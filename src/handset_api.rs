//! Authenticated handset commissioning details (Wi‑Fi + Z21 target).

use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde::Serialize;

use crate::config::Config;
use crate::error::ApiError;
use crate::programming_api;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandsetSetup {
    pub wifi_ssid: String,
    pub wifi_psk: String,
    pub bigfred_host: String,
    pub bigfred_ipv4: Option<String>,
}

/// `GET /api/v1/wizard/handset-setup` — Wi‑Fi credentials and Z21 IP for
/// on-screen handset instructions. Requires an organizer Bearer token.
pub async fn setup(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<HandsetSetup>, ApiError> {
    programming_api::bearer(&headers)?;
    let cfg = state.config().await;
    handset_setup_from_config(&cfg).await.map(Json)
}

pub async fn handset_setup_from_config(cfg: &Config) -> Result<HandsetSetup, ApiError> {
    let wifi_ssid = cfg.wifi_ssid.trim();
    if wifi_ssid.is_empty() {
        return Err(ApiError::bad_request("wifi_not_configured"));
    }
    let host = cfg
        .bigfred_public_host()
        .ok_or_else(|| ApiError::bad_request("bigfred_url_invalid"))?;
    let bigfred_ipv4 = resolve_ipv4(&host).await;
    Ok(HandsetSetup {
        wifi_ssid: wifi_ssid.to_string(),
        wifi_psk: cfg.wifi_psk.trim().to_string(),
        bigfred_host: host,
        bigfred_ipv4,
    })
}

async fn resolve_ipv4(host: &str) -> Option<String> {
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        return Some(ip.to_string());
    }
    let endpoints = tokio::net::lookup_host((host, 80)).await.ok()?;
    for addr in endpoints {
        if let std::net::IpAddr::V4(v4) = addr.ip() {
            return Some(v4.to_string());
        }
    }
    None
}
