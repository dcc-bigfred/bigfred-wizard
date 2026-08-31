//! Same-origin reverse proxy: `/api/v1/*` except `/api/v1/wizard/*`.

use axum::body::Body;
use axum::extract::State;
use axum::http::header::HeaderName;
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::error::ApiError;
use crate::AppState;

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

    let mut headers = Vec::new();
    for name in bigfred_client::proxy::forwarded_request_header_names() {
        if let Some(value) = parts.headers.get(name) {
            headers.push((name, value.as_bytes()));
        }
    }

    let api_base = state.bf_cfg.read().await.api_base.clone();
    let forwarded = bigfred_client::proxy::forward(
        &state.http,
        &api_base,
        parts.method.as_str(),
        path,
        parts.uri.query(),
        &headers,
        &bytes,
    )
    .await?;

    let status =
        StatusCode::from_u16(forwarded.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut out_headers = HeaderMap::new();
    for (name, value) in forwarded.headers {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_bytes(&value),
        ) {
            out_headers.insert(name, value);
        }
    }
    Ok((status, out_headers, forwarded.body).into_response())
}
