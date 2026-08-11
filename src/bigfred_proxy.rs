//! Same-origin reverse proxy: everything under `/api/v1/*` that is not
//! `/api/v1/wizard/*` is forwarded to BigFred over the loopback
//! interface, so the SPA never needs CORS or a second origin.
//!
//! HTTP only — the browser has no reason to open a WebSocket through the
//! wizard; the dcc-bus socket is owned by `dccbus_client`.

use axum::body::Body;
use axum::extract::State;
use axum::http::header::HeaderName;
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::error::ApiError;
use crate::AppState;

/// Impersonation header understood by BigFred's `MaybeImpersonate`.
pub const IMPERSONATE_HEADER: &str = "x-bigfred-impersonate-as";

/// Request headers forwarded upstream. Everything else (cookies, host,
/// connection controls) is dropped on purpose.
const FORWARDED_REQUEST_HEADERS: [&str; 3] = ["authorization", "content-type", "accept"];

/// Response headers copied back to the browser.
const FORWARDED_RESPONSE_HEADERS: [&str; 2] = ["content-type", "cache-control"];

const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub async fn proxy(State(state): State<AppState>, req: Request<Body>) -> Response {
    match forward(state, req).await {
        Ok(res) => res,
        Err(err) => err.into_response(),
    }
}

async fn forward(state: AppState, req: Request<Body>) -> Result<Response, ApiError> {
    let (parts, body) = req.into_parts();
    let path = parts.uri.path();
    if path.starts_with("/api/v1/wizard/") {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "not_found"));
    }
    if parts
        .headers
        .get(axum::http::header::UPGRADE)
        .is_some_and(|v| !v.is_empty())
    {
        return Err(ApiError::new(
            StatusCode::BAD_GATEWAY,
            "websocket_not_proxied",
        ));
    }

    let bytes = axum::body::to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|err| ApiError::bad_request("body_too_large").with_detail(err.to_string()))?;

    let mut url = format!("{}{}", state.config().await.bigfred_api_base(), path);
    if let Some(query) = parts.uri.query() {
        url.push('?');
        url.push_str(query);
    }

    let mut out = state.http.request(parts.method.clone(), &url);
    for name in FORWARDED_REQUEST_HEADERS
        .iter()
        .copied()
        .chain(std::iter::once(IMPERSONATE_HEADER))
    {
        if let Some(value) = parts.headers.get(name) {
            out = out.header(name, value);
        }
    }
    if !bytes.is_empty() {
        out = out.body(bytes);
    }

    let res = out
        .send()
        .await
        .map_err(|err| ApiError::unavailable("bigfred_unreachable").with_detail(err.to_string()))?;

    let status =
        StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut headers = HeaderMap::new();
    for name in FORWARDED_RESPONSE_HEADERS {
        if let Some(value) = res.headers().get(name) {
            if let (Ok(name), Ok(value)) = (
                HeaderName::from_bytes(name.as_bytes()),
                HeaderValue::from_bytes(value.as_bytes()),
            ) {
                headers.insert(name, value);
            }
        }
    }
    let payload = res
        .bytes()
        .await
        .map_err(|err| ApiError::unavailable("bigfred_read_failed").with_detail(err.to_string()))?;

    Ok((status, headers, payload).into_response())
}
