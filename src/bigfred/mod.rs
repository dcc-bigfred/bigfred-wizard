//! Axum wrappers around [`bigfred_client`]. The crate talks HTTP/WS/fs;
//! this module maps that onto wizard routes and [`ApiError`].

pub mod oauth;
pub mod pin;
pub mod proxy;

use std::path::PathBuf;

use axum::http::StatusCode;

use crate::error::ApiError;

/// Seeds or syncs the OAuth drop-in on boot / config reload.
pub fn ensure_dropin(
    cfg: &bigfred_client::BigFredConfig,
) -> Result<PathBuf, bigfred_client::Error> {
    bigfred_client::oauth::ensure_dropin(cfg)
}

impl From<bigfred_client::Error> for ApiError {
    fn from(err: bigfred_client::Error) -> Self {
        use bigfred_client::Error as E;
        match err {
            E::OauthUnreachable(d) | E::ProxyUnreachable(d) => {
                ApiError::unavailable("bigfred_unreachable").with_detail(d)
            }
            E::ProxyReadFailed(d) => ApiError::unavailable("bigfred_read_failed").with_detail(d),
            E::DccBusUnreachable(d) => {
                let mut out = ApiError::unavailable("dcc_bus_unavailable");
                if !d.is_empty() {
                    out = out.with_detail(d);
                }
                out
            }
            E::Unauthorized => ApiError::unauthorized(),
            E::ProgrammingTimeout => {
                ApiError::new(StatusCode::GATEWAY_TIMEOUT, "programming_timeout")
            }
            E::FunctionOffTimeout => {
                ApiError::new(StatusCode::GATEWAY_TIMEOUT, "function_off_timeout")
            }
            E::BadStatus {
                status,
                code,
                detail,
            } => {
                let mut out = ApiError::new(
                    StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY),
                    code,
                );
                if let Some(d) = detail {
                    out = out.with_detail(d);
                }
                out
            }
            E::OauthBadResponse(d) => ApiError::internal("oauth_bad_response").with_detail(d),
            E::CatalogueUnavailable(d) => {
                ApiError::unavailable("catalogue_unavailable").with_detail(d)
            }
            E::CatalogueBadResponse(d) => {
                ApiError::internal("catalogue_bad_response").with_detail(d)
            }
            E::OauthClientEnsureFailed(d) => {
                ApiError::internal("oauth_client_ensure_failed").with_detail(d)
            }
            E::OauthClientUnreadable(d) => {
                ApiError::internal("oauth_client_unreadable").with_detail(d)
            }
            E::OauthClientMissing => ApiError::internal("oauth_client_missing"),
            E::NoProgrammingStation => ApiError::unavailable("no_programming_station"),
            E::DccBusSessionLost => ApiError::internal("dcc_bus_session_lost"),
            E::DccBusDriveSessionLost => ApiError::internal("dcc_bus_drive_session_lost"),
            E::DccBusPendingPoisoned => ApiError::internal("dcc_bus_pending_poisoned"),
            E::DccBusBadUrl(d) => ApiError::internal("dcc_bus_bad_url").with_detail(d),
            E::FrameEncodeFailed(d) => ApiError::internal("frame_encode_failed").with_detail(d),
            E::ImpersonateRequired => ApiError::bad_request("impersonate_required"),
            E::InvalidImpersonateLogin => ApiError::bad_request("invalid_impersonate_login"),
            E::Io { path, source } => ApiError::internal("oauth_client_unreadable")
                .with_detail(format!("io {}: {source}", path.display())),
            E::Parse { path, source } => ApiError::internal("oauth_client_unreadable")
                .with_detail(format!("parse {}: {source}", path.display())),
            E::Serialize { path, source } => ApiError::internal("oauth_client_unreadable")
                .with_detail(format!("serialize {}: {source}", path.display())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn maps_oauth_unreachable() {
        let err: ApiError = bigfred_client::Error::OauthUnreachable("down".into()).into();
        assert_eq!(err.status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(err.code, "bigfred_unreachable");
        assert_eq!(err.detail.as_deref(), Some("down"));
    }

    #[test]
    fn maps_dcc_bus_unavailable() {
        let err: ApiError = bigfred_client::Error::DccBusUnreachable("ws".into()).into();
        assert_eq!(err.status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(err.code, "dcc_bus_unavailable");
    }

    #[test]
    fn maps_programming_timeout() {
        let err: ApiError = bigfred_client::Error::ProgrammingTimeout.into();
        assert_eq!(err.status, StatusCode::GATEWAY_TIMEOUT);
        assert_eq!(err.code, "programming_timeout");
    }

    #[test]
    fn maps_upstream_status() {
        let err: ApiError = bigfred_client::Error::BadStatus {
            status: 401,
            code: "invalid_client".into(),
            detail: None,
        }
        .into();
        assert_eq!(err.status, StatusCode::UNAUTHORIZED);
        assert_eq!(err.code, "invalid_client");
    }
}
