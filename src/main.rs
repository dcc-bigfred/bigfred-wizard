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
mod dccbus_client;
mod ensure_client;
mod error;
mod oauth_proxy;
mod programming_api;
mod qr;

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
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::{Config, PublicConfig};
use crate::dccbus_client::DccBusClient;

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
    pub cfg: Arc<Config>,
    pub http: reqwest::Client,
    pub dcc: Arc<DccBusClient>,
    pub pulse_locks: Arc<programming_api::PulseLocks>,
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
    let mut cfg = Config::load(&config_path)?;
    if let Some(http) = args.http {
        cfg.http = http;
    }

    match config::write_example_config(&config_path) {
        Ok(path) => tracing::info!(path = %path.display(), "wrote wizard config example"),
        Err(err) => tracing::warn!(error = %err, "could not write wizard config example"),
    }

    // A missing/unwritable data dir must not stop the daemon: the SPA and
    // the proxy still work, only the SSO exchange will fail loudly.
    match ensure_client::ensure(&cfg) {
        Ok(path) => tracing::info!(path = %path.display(), "oauth client ready"),
        Err(err) => tracing::error!(error = %err, "oauth client drop-in unavailable"),
    }

    let addr: SocketAddr = cfg.http.parse()?;
    let cfg = Arc::new(cfg);
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let state = AppState {
        cfg: Arc::clone(&cfg),
        http: http.clone(),
        dcc: Arc::new(DccBusClient::new(Arc::clone(&cfg), http)),
        pulse_locks: Arc::new(programming_api::PulseLocks::default()),
    };

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(
        %addr,
        enabled = cfg.enabled,
        bigfred = %cfg.bigfred_api_base(),
        "bigfred-wizard listening"
    );
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn router(state: AppState) -> Router {
    let mut app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/wizard/config", get(public_config))
        .route("/api/v1/wizard/qr.svg", get(qr::qr_svg))
        .route("/api/v1/wizard/oauth/token", post(oauth_proxy::token))
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
        .fallback(dispatch)
        .layer(TraceLayer::new_for_http());

    if state.cfg.cors_enabled && !state.cfg.cors_origins.is_empty() {
        let origins: Vec<HeaderValue> = state
            .cfg
            .cors_origins
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
    Json(state.cfg.public())
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
