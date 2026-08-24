//! Runtime QR codes: public store/app URLs (`GET /api/v1/wizard/qr.svg`)
//! and an organizer-only Wi‑Fi join code (`GET /api/v1/wizard/wifi-qr.svg`).

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Deserialize;

use crate::error::{ApiError, ApiResult};
use crate::programming_api;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct QrQuery {
    /// `android` → `androidAppUrl`, `bigfred` → `bigfredPublicUrl`.
    pub target: String,
}

pub async fn qr_svg(
    State(state): State<AppState>,
    Query(q): Query<QrQuery>,
) -> ApiResult<Response> {
    let Some(url) = state.config().await.qr_url(&q.target) else {
        return Err(ApiError::bad_request("qr_url_unset").with_detail(format!(
            "no URL configured for target {:?}",
            q.target.trim()
        )));
    };
    svg_response(&url)
}

/// `GET /api/v1/wizard/wifi-qr.svg` — ZXing `WIFI:…` payload so Android and
/// iPhone cameras can add the club network. Requires organizer Bearer; the
/// public `qr.svg` endpoint must not grow a `wifi` target (that would leak
/// the PSK without login).
pub async fn wifi_qr_svg(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    programming_api::bearer(&headers)?;
    let cfg = state.config().await;
    let ssid = cfg.wifi_ssid.trim();
    if ssid.is_empty() {
        return Err(ApiError::bad_request("wifi_not_configured"));
    }
    svg_response(&wifi_qr_payload(ssid, cfg.wifi_psk.trim()))
}

/// ZXing / iOS Camera / Android Camera Wi‑Fi join string.
pub fn wifi_qr_payload(ssid: &str, psk: &str) -> String {
    let ssid = escape_wifi_field(ssid.trim());
    let psk = psk.trim();
    if psk.is_empty() {
        format!("WIFI:T:nopass;S:{ssid};;")
    } else {
        format!("WIFI:T:WPA;S:{ssid};P:{};;", escape_wifi_field(psk))
    }
}

fn escape_wifi_field(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '\\' | ';' | ',' | ':' | '"' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

fn svg_response(payload: &str) -> ApiResult<Response> {
    let code = QrCode::new(payload.as_bytes())
        .map_err(|err| ApiError::internal("qr_encode_failed").with_detail(err.to_string()))?;
    let svg = code
        .render::<svg::Color>()
        .min_dimensions(512, 512)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build();

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        svg,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_network_uses_nopass() {
        assert_eq!(
            wifi_qr_payload("club-net", ""),
            "WIFI:T:nopass;S:club-net;;"
        );
        assert_eq!(
            wifi_qr_payload("  club-net  ", "  "),
            "WIFI:T:nopass;S:club-net;;"
        );
    }

    #[test]
    fn wpa_network_includes_password() {
        assert_eq!(
            wifi_qr_payload("club-net", "secret"),
            "WIFI:T:WPA;S:club-net;P:secret;;"
        );
    }

    #[test]
    fn special_characters_are_escaped() {
        assert_eq!(
            wifi_qr_payload(r#"net;a:b,c"d\e"#, r#"p;a:b,c"d\e"#),
            r#"WIFI:T:WPA;S:net\;a\:b\,c\"d\\e;P:p\;a\:b\,c\"d\\e;;"#
        );
    }
}
