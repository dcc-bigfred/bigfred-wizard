//! HTTP face of the decoder programming flows. React never speaks
//! WebSocket: it posts here, the daemon translates to dcc-bus frames and
//! waits for the ack.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;

use crate::dccbus_client::{
    Ack, CvEntry, Status, FRAME_ADDR_GET, FRAME_ADDR_SET, FRAME_CV_READ, FRAME_CV_WRITE,
};
use crate::error::{ApiError, ApiResult};
use crate::AppState;

/// Highest CV number reachable via NMRA S-9.2.2 indexed addressing —
/// the same ceiling the daemon validates against.
const MAX_CV: u16 = 1024;
/// NMRA long-address ceiling.
const MAX_DCC_ADDRESS: u16 = 10_239;
const MAX_FUNCTION: u8 = 31;
const DEFAULT_PULSE_MS: u64 = 1_000;
const MAX_PULSE_MS: u64 = 5_000;
/// Cap on the per-key lock registry. The domain is bounded by the layout
/// roster × function count; this guards against pathological growth.
const PULSE_LOCK_REGISTRY_CAP: usize = 4_096;

/// Per-`(address, function)` concurrency bound for `function_pulse`. A
/// second pulse to the same loco/function while one is in flight is
/// rejected with `429 function_pulse_busy` so ON/OFF frames cannot
/// interleave and leave a function latched.
#[derive(Default)]
pub struct PulseLocks {
    inner: tokio::sync::Mutex<HashMap<(u16, u8), Arc<Semaphore>>>,
}

impl PulseLocks {
    pub async fn acquire(
        &self,
        address: u16,
        function: u8,
    ) -> Result<tokio::sync::OwnedSemaphorePermit, ApiError> {
        let sem = {
            let mut map = self.inner.lock().await;
            if map.len() >= PULSE_LOCK_REGISTRY_CAP && !map.contains_key(&(address, function)) {
                return Err(ApiError::internal("pulse_lock_registry_full"));
            }
            map.entry((address, function))
                .or_insert_with(|| Arc::new(Semaphore::new(1)))
                .clone()
        };
        sem.try_acquire_owned().map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::TOO_MANY_REQUESTS,
                "function_pulse_busy",
            )
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvsReadRequest {
    pub address: u16,
    pub cvs: Vec<u16>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvsWriteRequest {
    pub address: u16,
    pub cvs: Vec<CvEntry>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressGetRequest {
    #[serde(default)]
    pub address: Option<u16>,
    #[serde(default)]
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressSetRequest {
    pub address: u16,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub verify: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionPulseRequest {
    pub address: u16,
    pub function: u8,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    /// Participant login — pulse runs via BigFred Impersonate-As so
    /// dcc-bus `CanDrive` sees the vehicle owner, not the organizer.
    #[serde(rename = "as")]
    pub as_login: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgrammingResponse {
    #[serde(flatten)]
    pub ack: Ack,
    pub command_station_id: Option<u64>,
}

pub async fn cvs_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CvsReadRequest>,
) -> ApiResult<Json<ProgrammingResponse>> {
    let token = bearer(&headers)?;
    validate_address(body.address)?;
    if body.cvs.is_empty() || body.cvs.iter().any(|cv| *cv == 0 || *cv > MAX_CV) {
        return Err(ApiError::bad_request("invalid_cvs"));
    }
    let mode = validate_mode(body.mode)?;
    let payload = json!({ "address": body.address, "cvs": body.cvs, "mode": mode });
    run(&state, &token, FRAME_CV_READ, payload).await
}

pub async fn cvs_write(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CvsWriteRequest>,
) -> ApiResult<Json<ProgrammingResponse>> {
    let token = bearer(&headers)?;
    validate_address(body.address)?;
    if body.cvs.is_empty() || body.cvs.iter().any(|e| e.cv == 0 || e.cv > MAX_CV) {
        return Err(ApiError::bad_request("invalid_cvs"));
    }
    let mode = validate_mode(body.mode)?;
    let payload = json!({ "address": body.address, "cvs": body.cvs, "mode": mode });
    run(&state, &token, FRAME_CV_WRITE, payload).await
}

pub async fn address_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AddressGetRequest>,
) -> ApiResult<Json<ProgrammingResponse>> {
    let token = bearer(&headers)?;
    let mode = validate_mode(body.mode)?;
    // POM reads have to name the decoder they interrogate; on the
    // programming track the address is implicit.
    if mode.as_deref() == Some("pom") {
        match body.address {
            Some(addr) => validate_address(addr)?,
            None => return Err(ApiError::bad_request("address_required_for_pom")),
        }
    }
    let payload = json!({ "address": body.address.unwrap_or(0), "mode": mode });
    run(&state, &token, FRAME_ADDR_GET, payload).await
}

pub async fn address_set(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AddressSetRequest>,
) -> ApiResult<Json<ProgrammingResponse>> {
    let token = bearer(&headers)?;
    validate_address(body.address)?;
    let mode = validate_mode(body.mode)?;
    let payload = json!({
        "address": body.address,
        "mode": mode,
        "verify": body.verify.unwrap_or(false),
    });
    run(&state, &token, FRAME_ADDR_SET, payload).await
}

/// Turns a function on, waits `durationMs` (default 1s), then turns it off.
/// Ops-mode main track — not programming track. Requires `as` (participant
/// login) so the dcc-bus drive gate runs as the vehicle owner.
pub async fn function_pulse(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<FunctionPulseRequest>,
) -> ApiResult<Json<ProgrammingResponse>> {
    let token = bearer(&headers)?;
    validate_address(body.address)?;
    if body.function > MAX_FUNCTION {
        return Err(ApiError::bad_request("invalid_function"));
    }
    let as_login = body.as_login.trim();
    if as_login.is_empty() {
        return Err(ApiError::bad_request("impersonate_required"));
    }
    let duration_ms = body
        .duration_ms
        .unwrap_or(DEFAULT_PULSE_MS)
        .clamp(1, MAX_PULSE_MS);

    if !state.cfg.enabled {
        return Err(ApiError::new(
            axum::http::StatusCode::FORBIDDEN,
            "wizard_disabled",
        ));
    }

    // Reject a concurrent pulse to the same (address, function) so ON/OFF
    // frames cannot interleave and leave the function latched.
    let _permit = state
        .pulse_locks
        .acquire(body.address, body.function)
        .await?;

    let ack = state
        .dcc
        .pulse_function(&token, as_login, body.address, body.function, duration_ms)
        .await?;
    Ok(Json(ProgrammingResponse {
        ack,
        command_station_id: state.dcc.status().command_station_id,
    }))
}

/// Reports the socket state plus the station the wizard would program on.
pub async fn status(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Status>> {
    let mut status = state.dcc.status();
    if let Ok(token) = bearer(&headers) {
        if let Ok(station) = state.dcc.pick_station(&token).await {
            status.command_station_id = Some(station.id);
            status.command_station_name = Some(station.name);
            status.default_programming_track_output =
                Some(station.default_programming_track_output);
        } else if status.command_station_id.is_none() {
            status.last_error = Some("no_programming_station".to_string());
        }
    }
    Ok(Json(status))
}

async fn run(
    state: &AppState,
    token: &str,
    frame: &str,
    payload: serde_json::Value,
) -> ApiResult<Json<ProgrammingResponse>> {
    if !state.cfg.enabled {
        return Err(ApiError::new(
            axum::http::StatusCode::FORBIDDEN,
            "wizard_disabled",
        ));
    }
    let ack = state.dcc.request(token, frame, payload).await?;
    let command_station_id = state.dcc.status().command_station_id;
    Ok(Json(ProgrammingResponse {
        ack,
        command_station_id,
    }))
}

/// Extracts the organizer's JWT from `Authorization: Bearer …`.
pub fn bearer(headers: &HeaderMap) -> Result<String, ApiError> {
    let raw = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(ApiError::unauthorized)?;
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))
        .unwrap_or("")
        .trim();
    if token.is_empty() {
        return Err(ApiError::unauthorized());
    }
    Ok(token.to_string())
}

fn validate_address(address: u16) -> Result<(), ApiError> {
    if address == 0 || address > MAX_DCC_ADDRESS {
        return Err(ApiError::bad_request("invalid_address"));
    }
    Ok(())
}

/// `None` lets the daemon apply the station's default track.
fn validate_mode(mode: Option<String>) -> Result<Option<String>, ApiError> {
    match mode.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some("pom") => Ok(Some("pom".to_string())),
        Some("prog") => Ok(Some("prog".to_string())),
        Some(_) => Err(ApiError::bad_request("invalid_mode")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn bearer_requires_a_token() {
        let mut headers = HeaderMap::new();
        assert!(bearer(&headers).is_err());
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer abc.def.ghi"),
        );
        assert_eq!(bearer(&headers).unwrap(), "abc.def.ghi");
    }

    #[test]
    fn mode_allowlist() {
        assert_eq!(validate_mode(None).unwrap(), None);
        assert_eq!(validate_mode(Some("".into())).unwrap(), None);
        assert_eq!(
            validate_mode(Some("pom".into())).unwrap().as_deref(),
            Some("pom")
        );
        assert!(validate_mode(Some("service".into())).is_err());
    }

    #[test]
    fn address_range() {
        assert!(validate_address(0).is_err());
        assert!(validate_address(10_240).is_err());
        assert!(validate_address(3).is_ok());
    }

    #[test]
    fn function_pulse_duration_clamps() {
        assert_eq!(DEFAULT_PULSE_MS, 1_000);
        assert_eq!(MAX_PULSE_MS, 5_000);
        // Mirrors the handler's clamp so the contract is locked.
        assert_eq!(0u64.clamp(1, MAX_PULSE_MS), 1);
        assert_eq!((MAX_PULSE_MS + 1).clamp(1, MAX_PULSE_MS), MAX_PULSE_MS);
    }

    #[tokio::test]
    async fn pulse_locks_reject_concurrent_same_key() {
        let locks = PulseLocks::default();
        let _first = locks.acquire(3, 2).await.expect("first acquire");
        // Second acquire for the same (address, function) must be rejected
        // so ON/OFF frames cannot interleave.
        let err = locks.acquire(3, 2).await.expect_err("should be busy");
        assert_eq!(err.status, axum::http::StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(err.code, "function_pulse_busy");
    }

    #[tokio::test]
    async fn pulse_locks_allow_concurrent_different_keys() {
        let locks = PulseLocks::default();
        let _a = locks.acquire(3, 0).await.expect("key A");
        let _b = locks.acquire(3, 1).await.expect("key B");
        let _c = locks.acquire(4, 0).await.expect("key C");
    }

    #[tokio::test]
    async fn pulse_locks_release_on_drop() {
        let locks = PulseLocks::default();
        {
            let _g = locks.acquire(7, 5).await.expect("acquire");
        }
        let _again = locks.acquire(7, 5).await.expect("re-acquire after drop");
    }
}
