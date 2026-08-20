//! `POST /api/v1/wizard/oauth/token` — the confidential half of the
//! authorization-code flow. The SPA hands over the one-time code; the
//! daemon adds the client secret from the drop-in file and exchanges it
//! with BigFred.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult};
use crate::{ensure_client, AppState};

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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpstreamRequest<'a> {
    grant_type: &'a str,
    code: &'a str,
    client_id: &'a str,
    client_secret: &'a str,
    redirect_uri: &'a str,
}

/// Handles the exchange. `state` is accepted for symmetry with the OAuth
/// redirect but is verified in the browser, which is where it was minted.
pub async fn token(
    State(state): State<AppState>,
    Json(body): Json<TokenRequest>,
) -> ApiResult<Json<TokenResponse>> {
    if body.code.trim().is_empty() {
        return Err(ApiError::bad_request("missing_code"));
    }
    let cfg = state.config().await;
    if !cfg.redirect_uri_allowed(&body.redirect_uri) {
        return Err(ApiError::bad_request("invalid_redirect_uri"));
    }

    // Lazy create only when the drop-in is absent or unreadable: `ensure`
    // does fs read/parse/write/chmod/chown and would otherwise run on every
    // token exchange. Startup already calls `ensure`; this is a fallback
    // for the race where BigFred's drop-in dir appears after boot.
    let secret = match ensure_client::load_secret(&cfg) {
        Ok(Some(secret)) => secret,
        Ok(None) => {
            tracing::info!("oauth drop-in missing on token exchange — seeding");
            ensure_client::ensure(&cfg).map_err(|err| {
                ApiError::internal("oauth_client_ensure_failed").with_detail(err.to_string())
            })?;
            ensure_client::load_secret(&cfg)
                .map_err(|err| {
                    ApiError::internal("oauth_client_unreadable").with_detail(err.to_string())
                })?
                .ok_or_else(|| ApiError::internal("oauth_client_missing"))?
        }
        Err(err) => {
            // Parse error → try to re-seed a clean drop-in before failing.
            tracing::warn!(error = %err, "oauth drop-in unreadable — re-seeding");
            ensure_client::ensure(&cfg).map_err(|err| {
                ApiError::internal("oauth_client_ensure_failed").with_detail(err.to_string())
            })?;
            ensure_client::load_secret(&cfg)
                .map_err(|err| {
                    ApiError::internal("oauth_client_unreadable").with_detail(err.to_string())
                })?
                .ok_or_else(|| ApiError::internal("oauth_client_missing"))?
        }
    };

    let url = format!("{}/api/v1/auth/oauth/token", cfg.bigfred_api_base());
    let res = state
        .http
        .post(&url)
        .json(&UpstreamRequest {
            grant_type: "authorization_code",
            code: body.code.trim(),
            client_id: &cfg.sso_client_id,
            client_secret: &secret,
            redirect_uri: body.redirect_uri.trim(),
        })
        .send()
        .await
        .map_err(|err| ApiError::unavailable("bigfred_unreachable").with_detail(err.to_string()))?;

    let status = res.status();
    let payload = res.bytes().await.unwrap_or_default();
    if !status.is_success() {
        let code = serde_json::from_slice::<serde_json::Value>(&payload)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
            .unwrap_or_else(|| "oauth_exchange_failed".to_string());
        return Err(ApiError::new(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            code,
        ));
    }

    let parsed: TokenResponse = serde_json::from_slice(&payload)
        .map_err(|err| ApiError::internal("oauth_bad_response").with_detail(err.to_string()))?;
    Ok(Json(parsed))
}
