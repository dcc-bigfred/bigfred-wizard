//! `POST /api/v1/wizard/oauth/token` — confidential half of the
//! authorization-code flow.

use axum::extract::State;
use axum::Json;
use serde::Deserialize;

use crate::error::{ApiError, ApiResult};
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenRequest {
    pub code: String,
    pub redirect_uri: String,
    /// Accepted so the SPA can post the whole callback query back
    /// unchanged; CSRF matching happens in the browser, which minted it.
    #[serde(default)]
    #[allow(dead_code)]
    pub state: Option<String>,
}

/// Handles the exchange. `state` is accepted for symmetry with the OAuth
/// redirect but is verified in the browser, which is where it was minted.
pub async fn token(
    State(state): State<AppState>,
    Json(body): Json<TokenRequest>,
) -> ApiResult<Json<bigfred_client::TokenResponse>> {
    if body.code.trim().is_empty() {
        return Err(ApiError::bad_request("missing_code"));
    }
    let cfg = state.config().await;
    if !cfg.redirect_uri_allowed(&body.redirect_uri) {
        return Err(ApiError::bad_request("invalid_redirect_uri"));
    }

    let bf = state.bf_cfg.read().await.clone();
    let parsed = bigfred_client::oauth::exchange_token(
        &state.http,
        &bf,
        body.code.trim(),
        body.redirect_uri.trim(),
    )
    .await?;
    Ok(Json(parsed))
}
