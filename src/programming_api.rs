//! HTTP face of the decoder programming flows. React never speaks
//! WebSocket: it posts here, the daemon translates to dcc-bus frames and
//! waits for the ack.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::json;

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
}
