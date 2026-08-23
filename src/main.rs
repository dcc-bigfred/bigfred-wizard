//! bigfred-wizard — party/event kiosk that sits in front of BigFred.
//!
//! One process serves three things on `:8091`:
//!   * the embedded React SPA (`web/dist`, via rust-embed),
//!   * `/api/v1/wizard/*` — public config, the confidential OAuth token
//!     exchange and the decoder programming API,
//!   * everything else under `/api/v1/*` — reverse-proxied to BigFred so
//!     the SPA stays same-origin.

mod bigfred_proxy;
mod config;
mod config_watch;
mod dccbus_client;
mod ensure_client;
mod error;
mod handset_api;
mod oauth_proxy;
mod pin_api;
mod programming_api;
mod qr;
mod wireless_api;
mod z21_direct;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderValue, Method, Request, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use clap::Parser;
use rust_embed::RustEmbed;
use tokio::sync::RwLock;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::{Config, PublicConfig};
use crate::dccbus_client::DccBusClient;
use crate::z21_direct::Z21DirectClient;

/// Production SPA bundle. `make web-build` fills this directory before
/// cargo runs; the placeholder keeps a fresh checkout compiling.
#[derive(RustEmbed)]
#[folder = "web/dist"]
struct Assets;

#[derive(Debug, Parser)]
#[command(
    name = "bigfred-wizard",
    about = "BigFred party kiosk (SSO + wizard flows)"
)]
struct Args {
    /// Config file; defaults to $DATA_DIR/etc/bigfred/wizard/bigfred-wizard.json.
    #[arg(long)]
    config: Option<PathBuf>,
    /// Overrides `http` from the config file.
    #[arg(long)]
    http: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<RwLock<Config>>,
    pub http: reqwest::Client,
    pub dcc: Arc<DccBusClient>,
    pub z21: Arc<Z21DirectClient>,
    pub pulse_locks: Arc<programming_api::PulseLocks>,
    pub wireless: Arc<wireless_api::WirelessClient>,
}

impl AppState {
    /// Snapshot of the current runtime config (hot-reloadable).
    pub async fn config(&self) -> Config {
        self.cfg.read().await.clone()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let args = Args::parse();
    let config_path = args.config.unwrap_or_else(config::default_config_path);
    let http_override = args.http.clone();
    let mut cfg = config::ensure_config_files(&config_path)?;
    if let Some(ref http) = http_override {
        cfg.http = http.clone();
    }

    // A missing/unwritable data dir must not stop the daemon: the SPA and
    // the proxy still work, only the SSO exchange will fail loudly.
    match ensure_client::ensure(&cfg) {
        Ok(path) => tracing::info!(path = %path.display(), "oauth client ready"),
        Err(err) => tracing::error!(error = %err, "oauth client drop-in unavailable"),
    }

    let addr: SocketAddr = cfg.http.parse()?;
    let listen_http = cfg.http.clone();
    let cors_enabled = cfg.cors_enabled;
    let cors_origins = cfg.cors_origins.clone();
    let enabled = cfg.enabled;
    let bigfred = cfg.bigfred_api_base();

    let cfg = Arc::new(RwLock::new(cfg));
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let state = AppState {
        cfg: Arc::clone(&cfg),
        http: http.clone(),
        dcc: Arc::new(DccBusClient::new(Arc::clone(&cfg), http)),
        z21: Arc::new(Z21DirectClient::new(Arc::clone(&cfg))),
        pulse_locks: Arc::new(programming_api::PulseLocks::default()),
        wireless: Arc::new(wireless_api::WirelessClient::new(Arc::clone(&cfg))),
    };

    let watch_stop = spawn_config_reloader(
        config_path.clone(),
        Arc::clone(&cfg),
        http_override,
        listen_http.clone(),
        cors_enabled,
        cors_origins.clone(),
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(
        %addr,
        enabled,
        bigfred = %bigfred,
        "bigfred-wizard listening"
    );
    axum::serve(listener, router(state, cors_enabled, &cors_origins))
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            watch_stop.store(true, std::sync::atomic::Ordering::SeqCst);
        })
        .await?;
    Ok(())
}

/// Watch the config file and refresh the shared [`Config`] on change.
fn spawn_config_reloader(
    config_path: PathBuf,
    cfg: Arc<RwLock<Config>>,
    http_override: Option<String>,
    bound_http: String,
    bound_cors_enabled: bool,
    bound_cors_origins: Vec<String>,
) -> Arc<std::sync::atomic::AtomicBool> {
    let (reload_rx, watch_stop) = match config_watch::spawn(config_path.clone()) {
        Ok(pair) => pair,
        Err(err) => {
            tracing::warn!(error = %err, "config watcher unavailable — hot-reload disabled");
            return Arc::new(std::sync::atomic::AtomicBool::new(false));
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    std::thread::Builder::new()
        .name("config-reload-bridge".into())
        .spawn(move || {
            while reload_rx.recv().is_ok() {
                if tx.send(()).is_err() {
                    break;
                }
            }
        })
        .ok();

    tokio::spawn(async move {
        while rx.recv().await.is_some() {
            match Config::load(&config_path) {
                Ok(mut new_cfg) => {
                    if let Some(ref http) = http_override {
                        new_cfg.http = http.clone();
                    }
                    if new_cfg.http != bound_http {
                        tracing::warn!(
                            configured = %new_cfg.http,
                            bound = %bound_http,
                            "http listen address changed in config — restart required to rebind"
                        );
                    }
                    if new_cfg.cors_enabled != bound_cors_enabled
                        || new_cfg.cors_origins != bound_cors_origins
                    {
                        tracing::warn!(
                            "cors settings changed in config — restart required to apply CorsLayer"
                        );
                    }

                    {
                        let mut guard = cfg.write().await;
                        *guard = new_cfg.clone();
                    }
                    tracing::info!(path = %config_path.display(), "config reloaded");

                    match ensure_client::ensure(&new_cfg) {
                        Ok(path) => {
                            tracing::info!(path = %path.display(), "oauth client synced after reload")
                        }
                        Err(err) => tracing::error!(
                            error = %err,
                            "oauth client drop-in unavailable after reload"
                        ),
                    }
                }
                Err(err) => {
                    tracing::warn!(
                        error = %err,
                        path = %config_path.display(),
                        "config reload failed — keeping previous config"
                    );
                }
            }
        }
    });

    watch_stop
}

fn router(state: AppState, cors_enabled: bool, cors_origins: &[String]) -> Router {
    let mut app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/wizard/config", get(public_config))
        .route("/api/v1/wizard/handset-setup", get(handset_api::setup))
        .route("/api/v1/wizard/qr.svg", get(qr::qr_svg))
        .route("/api/v1/wizard/oauth/token", post(oauth_proxy::token))
        .route("/api/v1/wizard/verify-pin", post(pin_api::verify_pin))
        .route(
            "/api/v1/wizard/programming/cvs/read",
            post(programming_api::cvs_read),
        )
        .route(
            "/api/v1/wizard/programming/cvs/write",
            post(programming_api::cvs_write),
        )
        .route(
            "/api/v1/wizard/programming/address/get",
            post(programming_api::address_get),
        )
        .route(
            "/api/v1/wizard/programming/address/set",
            post(programming_api::address_set),
        )
        .route(
            "/api/v1/wizard/programming/function/pulse",
            post(programming_api::function_pulse),
        )
        .route(
            "/api/v1/wizard/programming/status",
            get(programming_api::status),
        )
        .route(
            "/api/v1/wizard/programming/connect",
            post(programming_api::connect),
        )
        .route(
            "/api/v1/wizard/programming/drive-connect",
            post(programming_api::drive_connect),
        )
        .route("/api/v1/wizard/wireless/hello", get(wireless_api::hello))
        .route(
            "/api/v1/wizard/wireless/link-status",
            get(wireless_api::link_status),
        )
        .route("/api/v1/wizard/wireless/scan", get(wireless_api::scan))
        .route("/api/v1/wizard/wireless/probe", post(wireless_api::probe))
        .route(
            "/api/v1/wizard/wireless/program",
            post(wireless_api::program),
        )
        .route(
            "/api/v1/wizard/wireless/jobs/:id/events",
            get(wireless_api::job_events),
        )
        .route(
            "/api/v1/wizard/wireless/jobs/:id/cancel",
            post(wireless_api::job_cancel),
        )
        .fallback(dispatch)
        .layer(TraceLayer::new_for_http());

    if cors_enabled && !cors_origins.is_empty() {
        let origins: Vec<HeaderValue> = cors_origins
            .iter()
            .filter_map(|o| HeaderValue::from_str(o).ok())
            .collect();
        app = app.layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::PATCH,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([
                    header::CONTENT_TYPE,
                    header::AUTHORIZATION,
                    header::HeaderName::from_static(bigfred_proxy::IMPERSONATE_HEADER),
                ]),
        );
    }

    app.with_state(state)
}

async fn healthz() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn public_config(State(state): State<AppState>) -> Json<PublicConfig> {
    Json(state.config().await.public())
}

/// Unmatched routes: `/api/v1/*` goes to BigFred, everything else is the
/// SPA (client-side routing needs the index.html fallback).
async fn dispatch(State(state): State<AppState>, req: Request<Body>) -> Response {
    if req.uri().path().starts_with("/api/v1/") {
        return bigfred_proxy::proxy(State(state), req).await;
    }
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    serve_spa(req.uri())
}

fn serve_spa(uri: &Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let candidate = if path.is_empty() { "index.html" } else { path };
    if let Some(res) = embedded(candidate) {
        return res;
    }
    match embedded("index.html") {
        Some(res) => res,
        None => (
            StatusCode::NOT_FOUND,
            "bigfred-wizard: SPA bundle missing — run `make web-build`",
        )
            .into_response(),
    }
}

fn embedded(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    let mime = file.metadata.mimetype().to_string();
    let cache = if path == "index.html" {
        "no-cache"
    } else {
        "public, max-age=31536000, immutable"
    };
    Some(
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, cache.to_string()),
            ],
            file.data.into_owned(),
        )
            .into_response(),
    )
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutting down");
}
