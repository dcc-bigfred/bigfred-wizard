//! `POST /api/v1/wizard/verify-pin` — check a participant's PIN without
//! issuing a browser session. Used by the WiFred Soft-AP flow so the kiosk
//! never stores a driver JWT.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;

use crate::error::{ApiError, ApiResult};
use crate::programming_api;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyPinBody {
    pub login: String,
    pub pin: String,
    pub layout_id: u64,
}

/// Verifies `{ login, pin }` against BigFred for the organizer's layout.
/// Returns 204 on success; maps BigFred auth failures through unchanged.
pub async fn verify_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VerifyPinBody>,
) -> ApiResult<StatusCode> {
    programming_api::bearer(&headers)?;

    let login = body.login.trim();
    let pin = body.pin.trim();
    if login.is_empty() || pin.is_empty() {
        return Err(ApiError::bad_request("missing_credentials"));
    }
    if body.layout_id == 0 {
        return Err(ApiError::bad_request("layout_required"));
    }

    let bf = state.bf_cfg.read().await.clone();
    bigfred_client::apis::verify_pin(&state.http, &bf, login, pin, body.layout_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
