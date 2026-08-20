//! `POST /api/v1/wizard/verify-pin` — check a participant's PIN without
//! issuing a browser session. Used by the WiFred Soft-AP flow so the kiosk
//! never stores a driver JWT.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

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

    let url = format!(
        "{}/api/v1/auth/login",
        state.config().await.bigfred_api_base()
    );
    let res = state
        .http
        .post(&url)
        .json(&json!({
            "login": login,
            "pin": pin,
            "layoutId": body.layout_id,
        }))
        .send()
        .await
        .map_err(|err| {
            ApiError::unavailable("bigfred_unreachable").with_detail(err.to_string())
        })?;

    if res.status().is_success() {
        // Drop the minted session — the kiosk must not keep a driver JWT.
        return Ok(StatusCode::NO_CONTENT);
    }

    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let text = res.text().await.unwrap_or_default();
    let code = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| {
            if status == StatusCode::UNAUTHORIZED {
                "invalid_credentials".to_string()
            } else {
                format!("http_{}", status.as_u16())
            }
        });
    let detail = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(str::to_string));
    let mut err = ApiError::new(status, code);
    if let Some(detail) = detail {
        err = err.with_detail(detail);
    }
    Err(err)
}
