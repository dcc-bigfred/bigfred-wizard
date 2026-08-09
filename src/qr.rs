//! Runtime QR codes for phone onboarding (`GET /api/v1/wizard/qr.svg`).

use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Deserialize;

use crate::error::{ApiError, ApiResult};
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
    let Some(url) = state.cfg.qr_url(&q.target) else {
        return Err(ApiError::bad_request("qr_url_unset").with_detail(format!(
            "no URL configured for target {:?}",
            q.target.trim()
        )));
    };

    let code = QrCode::new(url.as_bytes()).map_err(|err| {
        ApiError::internal("qr_encode_failed").with_detail(err.to_string())
    })?;
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
