//! One JSON error shape for every wizard endpoint: `{"error": code,
//! "detail": "..."}` — the same envelope BigFred uses, so the SPA has a
//! single error path.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub detail: Option<String>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: impl Into<String>) -> Self {
        Self {
            status,
            code: code.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn bad_request(code: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code)
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized")
    }

    pub fn unavailable(code: impl Into<String>) -> Self {
        Self::new(StatusCode::SERVICE_UNAVAILABLE, code)
    }

    pub fn internal(code: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, code)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = json!({ "error": self.code });
        if let Some(detail) = self.detail {
            body["detail"] = json!(detail);
        }
        (self.status, Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
