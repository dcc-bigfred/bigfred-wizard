//! HTTP face of wireless-programmer: the SPA never opens the Unix socket.
//! This module translates REST/SSE into length-prefixed JSON frames.

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Path as AxumPath, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::Json;
use futures::stream::Stream;
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use wp_proto::{
    CandidateRef, ErrorBody, HelloResult, JobParams, JobSnapshot, Params, ProgramParams,
    ProgramRequestWire, ProgramResult, Request, RequestKind, Response, ResultBody, MAX_FRAME_BYTES,
};

use crate::error::{ApiError, ApiResult};
use crate::AppState;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const ROUND_TRIP_TIMEOUT: Duration = Duration::from_secs(30);

/// Thin wrapper that knows where the daemon socket lives (from live config).
#[derive(Debug, Clone)]
pub struct WirelessClient {
    cfg: Arc<tokio::sync::RwLock<crate::config::Config>>,
}

impl WirelessClient {
    pub fn new(cfg: Arc<tokio::sync::RwLock<crate::config::Config>>) -> Self {
        Self { cfg }
    }

    pub async fn socket_path(&self) -> PathBuf {
        PathBuf::from(self.cfg.read().await.wireless_programmer_socket.clone())
    }

    async fn connect(&self) -> ApiResult<UnixStream> {
        let socket = self.socket_path().await;
        match tokio::time::timeout(CONNECT_TIMEOUT, UnixStream::connect(&socket)).await {
            Ok(Ok(s)) => Ok(s),
            Ok(Err(e)) => Err(ApiError::unavailable("wireless_unavailable")
                .with_detail(format!("connect {}: {e}", socket.display()))),
            Err(_) => {
                Err(ApiError::unavailable("wireless_unavailable").with_detail("connect timed out"))
            }
        }
    }

    async fn round_trip(&self, req: &Request) -> ApiResult<Response> {
        let mut stream = self.connect().await?;
        write_frame_async(&mut stream, req).await?;
        let resp = tokio::time::timeout(ROUND_TRIP_TIMEOUT, read_frame_async(&mut stream))
            .await
            .map_err(|_| {
                ApiError::unavailable("wireless_timeout").with_detail("daemon did not reply")
            })??;
        Ok(resp)
    }

    async fn expect_result(&self, req: Request, expected: RequestKind) -> ApiResult<ResultBody> {
        let resp = self.round_trip(&req).await?;
        if let Some(e) = resp.error {
            return Err(map_daemon_error(e));
        }
        if resp.kind != expected {
            return Err(ApiError::internal("wireless_unexpected_response")
                .with_detail(format!("expected {:?}, got {:?}", expected, resp.kind)));
        }
        resp.result.ok_or_else(|| {
            ApiError::internal("wireless_unexpected_response").with_detail("missing result")
        })
    }

    pub async fn hello(&self) -> ApiResult<HelloResult> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::Hello,
                    params: Some(Params::None),
                },
                RequestKind::Hello,
            )
            .await?
        {
            ResultBody::Hello(h) => Ok(h),
            other => Err(unexpected_body(other)),
        }
    }

    pub async fn link_status(&self) -> ApiResult<wp_proto::LinkStatusWire> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::LinkStatus,
                    params: Some(Params::None),
                },
                RequestKind::LinkStatus,
            )
            .await?
        {
            ResultBody::LinkStatus(s) => Ok(s),
            other => Err(unexpected_body(other)),
        }
    }

    pub async fn scan(&self) -> ApiResult<Vec<wp_proto::CandidateWire>> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::Scan,
                    params: Some(Params::None),
                },
                RequestKind::Scan,
            )
            .await?
        {
            ResultBody::Scan(c) => Ok(c),
            other => Err(unexpected_body(other)),
        }
    }

    pub async fn probe(&self, candidate: CandidateRef) -> ApiResult<wp_proto::DeviceInfoWire> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::Probe,
                    params: Some(Params::Probe(wp_proto::ProbeParams { candidate })),
                },
                RequestKind::Probe,
            )
            .await?
        {
            ResultBody::Probe(d) => Ok(d),
            other => Err(unexpected_body(other)),
        }
    }

    pub async fn program(
        &self,
        candidate: CandidateRef,
        request: ProgramRequestWire,
    ) -> ApiResult<ProgramResult> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::Program,
                    params: Some(Params::Program(ProgramParams { candidate, request })),
                },
                RequestKind::Program,
            )
            .await?
        {
            ResultBody::Program(p) => Ok(p),
            other => Err(unexpected_body(other)),
        }
    }

    pub async fn job_cancel(&self, job_id: String) -> ApiResult<JobSnapshot> {
        match self
            .expect_result(
                Request {
                    kind: RequestKind::JobCancel,
                    params: Some(Params::Job(JobParams { job_id })),
                },
                RequestKind::JobCancel,
            )
            .await?
        {
            ResultBody::JobCancelled(j) => Ok(j),
            other => Err(unexpected_body(other)),
        }
    }
}

fn map_daemon_error(e: ErrorBody) -> ApiError {
    let status = match e.code.as_str() {
        "busy" => axum::http::StatusCode::CONFLICT,
        "notFound" | "not_found" | "candidateNotFound" | "noCandidates" => {
            axum::http::StatusCode::NOT_FOUND
        }
        "forbidden" => axum::http::StatusCode::FORBIDDEN,
        "invalidRequest" | "bad_params" => axum::http::StatusCode::BAD_REQUEST,
        _ => axum::http::StatusCode::BAD_GATEWAY,
    };
    ApiError::new(status, e.code).with_detail(e.message)
}

fn unexpected_body(b: ResultBody) -> ApiError {
    ApiError::internal("wireless_unexpected_response").with_detail(format!("{b:?}"))
}

async fn write_frame_async(stream: &mut UnixStream, msg: &impl serde::Serialize) -> ApiResult<()> {
    let payload = serde_json::to_vec(msg)
        .map_err(|e| ApiError::internal("wireless_encode").with_detail(e.to_string()))?;
    if payload.len() > MAX_FRAME_BYTES {
        return Err(ApiError::bad_request("wireless_frame_too_large"));
    }
    let len = (payload.len() as u32).to_le_bytes();
    stream.write_all(&len).await.map_err(io_err)?;
    stream.write_all(&payload).await.map_err(io_err)?;
    Ok(())
}

async fn read_frame_async(stream: &mut UnixStream) -> ApiResult<Response> {
    let mut header = [0u8; 4];
    stream.read_exact(&mut header).await.map_err(io_err)?;
    let len = u32::from_le_bytes(header) as usize;
    if len > MAX_FRAME_BYTES {
        return Err(ApiError::internal("wireless_frame_too_large")
            .with_detail(format!("{len} > {MAX_FRAME_BYTES}")));
    }
    let mut payload = vec![0u8; len];
    stream.read_exact(&mut payload).await.map_err(io_err)?;
    serde_json::from_slice(&payload)
        .map_err(|e| ApiError::internal("wireless_decode").with_detail(e.to_string()))
}

fn io_err(e: std::io::Error) -> ApiError {
    ApiError::unavailable("wireless_io").with_detail(e.to_string())
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

pub async fn hello(State(state): State<AppState>) -> ApiResult<Json<HelloResult>> {
    Ok(Json(state.wireless.hello().await?))
}

pub async fn link_status(
    State(state): State<AppState>,
) -> ApiResult<Json<wp_proto::LinkStatusWire>> {
    Ok(Json(state.wireless.link_status().await?))
}

pub async fn scan(State(state): State<AppState>) -> ApiResult<Json<Vec<wp_proto::CandidateWire>>> {
    Ok(Json(state.wireless.scan().await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBody {
    pub candidate: CandidateRef,
}

pub async fn probe(
    State(state): State<AppState>,
    Json(body): Json<ProbeBody>,
) -> ApiResult<Json<wp_proto::DeviceInfoWire>> {
    Ok(Json(state.wireless.probe(body.candidate).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramFromWizardBody {
    pub candidate: CandidateRef,
    pub identity: String,
    #[serde(default)]
    pub roster: Vec<wp_proto::RosterEntryWire>,
    #[serde(default)]
    pub bigfred: Option<wp_proto::BigfredCredsWire>,
    #[serde(default)]
    pub roster_mode: Option<String>,
}

pub async fn program(
    State(state): State<AppState>,
    Json(body): Json<ProgramFromWizardBody>,
) -> ApiResult<Json<ProgramResult>> {
    let cfg = state.config().await;
    if cfg.wifi_ssid.trim().is_empty() {
        return Err(ApiError::bad_request("wifi_not_configured")
            .with_detail("wifiSsid is empty in bigfred-wizard.json"));
    }
    let psk = {
        let p = cfg.wifi_psk.trim();
        if p.is_empty() {
            None
        } else {
            Some(p.to_string())
        }
    };
    let request = ProgramRequestWire {
        identity: body.identity,
        wifi: wp_proto::WifiCredentialsWire {
            ssid: cfg.wifi_ssid.trim().to_string(),
            psk,
        },
        server: wp_proto::ThrottleServerWire {
            host: cfg.throttle_server_host.trim().to_string(),
            port: cfg.throttle_server_port,
            automatic: if cfg.throttle_server_automatic {
                Some(true)
            } else {
                None
            },
        },
        roster: body.roster,
        bigfred: body.bigfred,
        roster_mode: body.roster_mode,
    };
    Ok(Json(state.wireless.program(body.candidate, request).await?))
}

pub async fn job_cancel(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> ApiResult<Json<JobSnapshot>> {
    Ok(Json(state.wireless.job_cancel(job_id).await?))
}

/// SSE stream of job progress frames until the job reaches a terminal state.
pub async fn job_events(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<String>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let mut stream = state.wireless.connect().await?;
    write_frame_async(
        &mut stream,
        &Request {
            kind: RequestKind::JobWatch,
            params: Some(Params::Job(JobParams { job_id })),
        },
    )
    .await?;

    let (tx, rx) = tokio::sync::mpsc::channel::<Event>(8);
    tokio::spawn(async move {
        loop {
            let resp = match read_frame_async(&mut stream).await {
                Ok(r) => r,
                Err(_) => break,
            };
            if let Some(e) = resp.error {
                let _ = tx
                    .send(
                        Event::default()
                            .event("error")
                            .data(serde_json::to_string(&e).unwrap_or_default()),
                    )
                    .await;
                break;
            }
            let Some(ResultBody::JobWatch(frame)) = resp.result else {
                break;
            };
            let terminal = frame.state.is_terminal();
            let data = serde_json::to_string(&frame).unwrap_or_default();
            if tx
                .send(Event::default().event("frame").data(data))
                .await
                .is_err()
            {
                break;
            }
            if terminal {
                break;
            }
        }
    });

    let sse = futures::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|ev| (Ok::<Event, Infallible>(ev), rx))
    });
    Ok(Sse::new(sse).keep_alive(KeepAlive::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use tokio::sync::RwLock;

    #[tokio::test]
    async fn default_socket_path_is_nested() {
        let cfg = Arc::new(RwLock::new(Config::default()));
        let c = WirelessClient::new(cfg);
        assert!(c
            .socket_path()
            .await
            .to_string_lossy()
            .contains("wireless-programmer"));
    }
}
