//! Resilient dcc-bus WebSocket client.
//!
//! Two long-lived sockets are kept (each with its own keep-alive pings):
//!
//! * **programming** — organizer JWT, used for CV / address frames
//!   (`loco.cvRead`, `loco.cvWrite`, `loco.addrGet`, `loco.addrSet`).
//! * **drive** — organizer JWT + `X-BigFred-Impersonate-As` for the
//!   currently selected participant; used for ops-track pulses (F2).
//!   Replaced when the wizard picks a different user.
//!
//! Both are warmed eagerly (`ensure_connected` after login,
//! `ensure_drive` when a participant is selected) and re-dialled with
//! exponential backoff if they die.
//!
//! The daemon that actually drives the command station is spawned by
//! BigFred when a layout session selects the station. If no daemon is
//! listening the proxy answers `503`, which surfaces here (and to the
//! SPA) as `dcc_bus_unavailable` — the organizer has to open the layout
//! in BigFred once so the station comes up.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use axum::http::StatusCode;
use futures::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::HeaderName;
use tokio_tungstenite::tungstenite::Message;

use crate::config::Config;
use tokio::sync::RwLock;
use crate::error::ApiError;

/// dcc-bus frame types used by the wizard.
pub const FRAME_CV_READ: &str = "loco.cvRead";
pub const FRAME_CV_WRITE: &str = "loco.cvWrite";
pub const FRAME_ADDR_GET: &str = "loco.addrGet";
pub const FRAME_ADDR_SET: &str = "loco.addrSet";
pub const FRAME_SET_FUNCTION: &str = "loco.setFunction";

const ACK_TIMEOUT: Duration = Duration::from_secs(30);
/// Keep-alive for both permanent sockets. Must stay below dcc-bus deadman
/// (default 6s; BigFred heartbeat is 2s).
const PING_INTERVAL: Duration = Duration::from_secs(2);
const CONNECT_ATTEMPTS: u32 = 3;
const BACKOFF_BASE_MS: u64 = 250;
const BACKOFF_MAX_MS: u64 = 4_000;
/// Best-effort timeout for the trailing `OFF` of a function pulse. Shorter
/// than [`ACK_TIMEOUT`] so a pulse never blocks the organizer for half a
/// minute; the ON ack still uses [`ACK_TIMEOUT`] because a stuck command
/// station is worth surfacing verbatim.
const PULSE_OFF_TIMEOUT: Duration = Duration::from_secs(5);

/// `contract.EnvelopeWire` on the wire.
#[derive(Debug, Serialize, Deserialize)]
struct Envelope {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

/// One configuration variable, mirroring `protocol.CVEntry`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CvEntry {
    pub cv: u16,
    pub value: u8,
}

/// `protocol.AckPayload` (only the fields the wizard reads back).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ack {
    #[serde(default)]
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cvs: Option<Vec<CvEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loco_address: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub long_address: Option<bool>,
}

/// One row of `GET /api/v1/command-stations/catalogue`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandStation {
    pub id: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub programming: bool,
    #[serde(default)]
    pub hide_in_throttle: bool,
    #[serde(default)]
    pub default_programming_track_output: String,
}

/// What `GET /api/v1/wizard/programming/status` reports.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_station_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_station_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_programming_track_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub reconnects: u64,
    /// Impersonated drive socket is up (F2 / ops track).
    pub drive_connected: bool,
    /// Participant the drive socket is impersonating, when connected.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_as: Option<String>,
}

type Pending = Arc<StdMutex<HashMap<String, oneshot::Sender<Ack>>>>;

/// A live socket plus the tasks that keep it readable and warm.
struct Session {
    tx: mpsc::UnboundedSender<Message>,
    pending: Pending,
    alive: Arc<AtomicBool>,
    command_station_id: u64,
    tasks: Vec<JoinHandle<()>>,
}

impl Session {
    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed) && !self.tx.is_closed()
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
        for task in self.tasks.drain(..) {
            task.abort();
        }
    }
}

/// Impersonated drive socket keyed by participant login.
struct DriveSession {
    login: String,
    session: Session,
}

/// Owns two dcc-bus sockets: organizer programming + participant drive.
pub struct DccBusClient {
    cfg: Arc<RwLock<Config>>,
    http: reqwest::Client,
    programming: Mutex<Option<Session>>,
    drive: Mutex<Option<DriveSession>>,
    status: StdMutex<Status>,
}

impl DccBusClient {
    pub fn new(cfg: Arc<RwLock<Config>>, http: reqwest::Client) -> Self {
        Self {
            cfg,
            http,
            programming: Mutex::new(None),
            drive: Mutex::new(None),
            status: StdMutex::new(Status::default()),
        }
    }

    /// Locks `status`, recovering from a poisoned mutex by taking the inner
    /// guard anyway (status is best-effort reporting; a previous panic should
    /// not take down the daemon). Returns a default status only if the lock
    /// is somehow unusable, which for `StdMutex` cannot happen here.
    fn lock_status(&self) -> std::sync::MutexGuard<'_, Status> {
        self.status.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("status mutex poisoned — recovering inner guard");
            poisoned.into_inner()
        })
    }

    pub fn status(&self) -> Status {
        self.lock_status().clone()
    }

    fn refresh_drive_status(&self, drive: &Option<DriveSession>) {
        let mut status = self.lock_status();
        match drive {
            Some(d) if d.session.is_alive() => {
                status.drive_connected = true;
                status.drive_as = Some(d.login.clone());
            }
            _ => {
                status.drive_connected = false;
                status.drive_as = None;
            }
        }
    }

    /// Opens (or reuses) the organizer programming WebSocket. No-op when a
    /// live session already exists — used to warm the link right after login.
    pub async fn ensure_connected(&self, token: &str) -> Result<Status, ApiError> {
        let mut guard = self.programming.lock().await;
        if guard.as_ref().is_some_and(|s| !s.is_alive()) {
            *guard = None;
        }
        if guard.is_none() {
            *guard = Some(self.connect_with_backoff_as(token, None).await?);
        }
        drop(guard);
        Ok(self.status())
    }

    /// Opens (or switches) the impersonated drive WebSocket for `as_login`.
    /// Reuses the existing socket when it is alive and already that user.
    pub async fn ensure_drive(&self, token: &str, as_login: &str) -> Result<Status, ApiError> {
        let login = as_login.trim();
        if login.is_empty() {
            return Err(ApiError::bad_request("impersonate_required"));
        }
        let mut guard = self.drive.lock().await;
        let reuse = guard
            .as_ref()
            .is_some_and(|d| d.login == login && d.session.is_alive());
        if !reuse {
            if let Some(prev) = guard.take() {
                tracing::info!(
                    previous = %prev.login,
                    next = %login,
                    "dcc-bus drive session switching user"
                );
            }
            let session = self.connect_with_backoff_as(token, Some(login)).await?;
            *guard = Some(DriveSession {
                login: login.to_string(),
                session,
            });
        }
        self.refresh_drive_status(&guard);
        drop(guard);
        Ok(self.status())
    }

    /// Sends one programming frame and waits for the matching `ack`.
    /// Reconnects once if the cached programming socket turned out to be dead.
    pub async fn request(
        &self,
        token: &str,
        frame: &str,
        payload: serde_json::Value,
    ) -> Result<Ack, ApiError> {
        let mut guard = self.programming.lock().await;
        if guard.as_ref().is_some_and(|s| !s.is_alive()) {
            *guard = None;
        }
        if guard.is_none() {
            *guard = Some(self.connect_with_backoff_as(token, None).await?);
        }

        match send_and_wait(
            guard
                .as_ref()
                .ok_or_else(|| ApiError::internal("dcc_bus_session_lost"))?,
            frame,
            payload.clone(),
        )
        .await
        {
            Ok(ack) => Ok(ack),
            Err(err) if err.status == StatusCode::SERVICE_UNAVAILABLE => {
                *guard = None;
                *guard = Some(self.connect_with_backoff_as(token, None).await?);
                send_and_wait(
                    guard
                        .as_ref()
                        .ok_or_else(|| ApiError::internal("dcc_bus_session_lost"))?,
                    frame,
                    payload,
                )
                .await
            }
            Err(err) => Err(err),
        }
    }

    /// Impersonated on→wait→off for one function on the cached drive socket.
    ///
    /// # Errors
    ///
    /// Returns `impersonate_required` if `as_login` is empty. Propagates
    /// command-station errors from the `ON` or `OFF` frame.
    ///
    /// # Rollback
    ///
    /// If the `OFF` frame fails or the caller drops this future mid-pulse,
    /// a best-effort fire-and-forget `OFF` is still emitted so the function
    /// does not stay latched on the ops track. The `OFF` ack waits at most
    /// [`PULSE_OFF_TIMEOUT`].
    pub async fn pulse_function(
        &self,
        token: &str,
        as_login: &str,
        address: u16,
        function: u8,
        duration_ms: u64,
    ) -> Result<Ack, ApiError> {
        let login = as_login.trim();
        if login.is_empty() {
            return Err(ApiError::bad_request("impersonate_required"));
        }

        let mut guard = self.drive.lock().await;
        let reuse = guard
            .as_ref()
            .is_some_and(|d| d.login == login && d.session.is_alive());
        if !reuse {
            let _ = guard.take();
            let session = self.connect_with_backoff_as(token, Some(login)).await?;
            *guard = Some(DriveSession {
                login: login.to_string(),
                session,
            });
            self.refresh_drive_status(&guard);
        }

        let session = &guard
            .as_ref()
            .ok_or_else(|| ApiError::internal("dcc_bus_drive_session_lost"))?
            .session;

        let on_result = send_and_wait(
            session,
            FRAME_SET_FUNCTION,
            serde_json::json!({
                "address": address,
                "function": function,
                "on": true,
            }),
        )
        .await;
        if let Err(err) = on_result {
            return Err(err);
        }

        let pulse_guard = PulseOffGuard {
            tx: session.tx.clone(),
            address,
            function,
            armed: true,
        };

        tokio::time::sleep(Duration::from_millis(duration_ms)).await;

        let off_ack = pulse_guard.disarm_and_send_off(session).await;
        // Keep the drive socket open for the next F2 on the same user.
        off_ack
    }

    /// Picks the programming-capable command station with the lowest id.
    pub async fn pick_station(&self, token: &str) -> Result<CommandStation, ApiError> {
        let api_base = self.cfg.read().await.bigfred_api_base();
        let url = format!("{api_base}/api/v1/command-stations/catalogue");
        let res = self
            .http
            .get(&url)
            .header("authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|err| {
                ApiError::unavailable("bigfred_unreachable").with_detail(err.to_string())
            })?;
        let status = res.status();
        let bytes = res.bytes().await.unwrap_or_default();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(ApiError::unauthorized());
        }
        if !status.is_success() {
            return Err(ApiError::unavailable("catalogue_unavailable")
                .with_detail(String::from_utf8_lossy(&bytes).to_string()));
        }
        let mut stations: Vec<CommandStation> = serde_json::from_slice(&bytes).map_err(|err| {
            ApiError::internal("catalogue_bad_response").with_detail(err.to_string())
        })?;
        stations.sort_by_key(|s| s.id);
        stations
            .into_iter()
            .find(|s| s.programming)
            .ok_or_else(|| ApiError::unavailable("no_programming_station"))
    }

    async fn connect_with_backoff_as(
        &self,
        token: &str,
        as_login: Option<&str>,
    ) -> Result<Session, ApiError> {
        let mut last: Option<ApiError> = None;
        for attempt in 0..CONNECT_ATTEMPTS {
            if attempt > 0 {
                tokio::time::sleep(backoff_delay(attempt)).await;
            }
            match self.connect(token, as_login).await {
                Ok(session) => {
                    if as_login.is_none() {
                        let mut status = self.lock_status();
                        status.connected = true;
                        status.last_error = None;
                        if attempt > 0 {
                            status.reconnects += 1;
                        }
                    }
                    return Ok(session);
                }
                Err(err) => {
                    tracing::warn!(
                        attempt,
                        error = %err.code,
                        as_login = as_login.unwrap_or(""),
                        "dcc-bus connect failed"
                    );
                    if as_login.is_none() {
                        let mut status = self.lock_status();
                        status.connected = false;
                        status.last_error = Some(err.code.clone());
                    }
                    last = Some(err);
                }
            }
        }
        Err(last.unwrap_or_else(|| ApiError::unavailable("dcc_bus_unavailable")))
    }

    async fn connect(&self, token: &str, as_login: Option<&str>) -> Result<Session, ApiError> {
        let station = self.pick_station(token).await?;
        if as_login.is_none() {
            let mut status = self.lock_status();
            status.command_station_id = Some(station.id);
            status.command_station_name = Some(station.name.clone());
            status.default_programming_track_output =
                Some(station.default_programming_track_output.clone());
        }

        let url = format!(
            "{}/api/v1/dcc-bus/{}/ws?token={}",
            self.cfg.read().await.bigfred_ws_base(),
            station.id,
            urlencode(token)
        );
        let mut req = url
            .into_client_request()
            .map_err(|err| ApiError::internal("dcc_bus_bad_url").with_detail(err.to_string()))?;
        if let Some(login) = as_login {
            let name = HeaderName::from_static("x-bigfred-impersonate-as");
            let value = login
                .parse()
                .map_err(|_| ApiError::bad_request("invalid_impersonate_login"))?;
            req.headers_mut().insert(name, value);
        }
        let (stream, _) = tokio_tungstenite::connect_async(req).await.map_err(|err| {
            ApiError::unavailable("dcc_bus_unavailable").with_detail(err.to_string())
        })?;

        let (mut sink, mut source) = stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
        let pending: Pending = Arc::new(StdMutex::new(HashMap::new()));
        let alive = Arc::new(AtomicBool::new(true));

        let writer = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if sink.send(msg).await.is_err() {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        let reader_pending = Arc::clone(&pending);
        let reader_alive = Arc::clone(&alive);
        let reader = tokio::spawn(async move {
            while let Some(Ok(msg)) = source.next().await {
                let text = match msg {
                    Message::Text(text) => text,
                    Message::Binary(bin) => match String::from_utf8(bin) {
                        Ok(text) => text,
                        Err(_) => continue,
                    },
                    Message::Close(_) => break,
                    _ => continue,
                };
                let Ok(env) = serde_json::from_str::<Envelope>(&text) else {
                    continue;
                };
                if env.kind != "ack" {
                    continue;
                }
                let Some(id) = env.id else { continue };
                // Recover from a poisoned pending map rather than panicking
                // the reader task: take the inner map and keep draining acks.
                let waiter = reader_pending
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .remove(&id);
                if let Some(waiter) = waiter {
                    let ack = env
                        .payload
                        .and_then(|p| serde_json::from_value::<Ack>(p).ok())
                        .unwrap_or_default();
                    let _ = waiter.send(ack);
                }
            }
            reader_alive.store(false, Ordering::Relaxed);
            reader_pending
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clear();
        });

        let ping_tx = tx.clone();
        let pinger = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(PING_INTERVAL);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                let Ok(frame) = serde_json::to_string(&Envelope {
                    kind: "ping".to_string(),
                    id: None,
                    payload: Some(serde_json::json!({})),
                }) else {
                    break;
                };
                if ping_tx.send(Message::Text(frame)).is_err() {
                    break;
                }
            }
        });

        tracing::info!(
            command_station = station.id,
            name = %station.name,
            as_login = as_login.unwrap_or(""),
            role = if as_login.is_some() {
                "drive"
            } else {
                "programming"
            },
            "dcc-bus connected"
        );
        Ok(Session {
            tx,
            pending,
            alive,
            command_station_id: station.id,
            tasks: vec![writer, reader, pinger],
        })
    }
}

async fn send_and_wait(
    session: &Session,
    frame: &str,
    payload: serde_json::Value,
) -> Result<Ack, ApiError> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    // Scoped so the std MutexGuard is dropped before any `.await` — a
    // `std::sync::MutexGuard` is `!Send` and would make this future `!Send`.
    {
        let mut pending = session
            .pending
            .lock()
            .map_err(|_| ApiError::internal("dcc_bus_pending_poisoned"))?;
        pending.insert(id.clone(), tx);
    }

    let envelope = serde_json::to_string(&Envelope {
        kind: frame.to_string(),
        id: Some(id.clone()),
        payload: Some(payload),
    })
    .map_err(|err| ApiError::internal("frame_encode_failed").with_detail(err.to_string()))?;

    if session.tx.send(Message::Text(envelope)).is_err() {
        {
            if let Ok(mut pending) = session.pending.lock() {
                pending.remove(&id);
            }
        }
        return Err(ApiError::unavailable("dcc_bus_unavailable"));
    }

    match tokio::time::timeout(ACK_TIMEOUT, rx).await {
        Ok(Ok(ack)) if ack.ok => Ok(ack),
        Ok(Ok(ack)) => Err(ApiError::new(
            StatusCode::BAD_GATEWAY,
            ack.error
                .unwrap_or_else(|| "programming_failed".to_string()),
        )
        .with_detail(format!("command station {}", session.command_station_id))),
        Ok(Err(_)) => Err(ApiError::unavailable("dcc_bus_unavailable")),
        Err(_) => {
            {
                if let Ok(mut pending) = session.pending.lock() {
                    pending.remove(&id);
                }
            }
            Err(ApiError::new(
                StatusCode::GATEWAY_TIMEOUT,
                "programming_timeout",
            ))
        }
    }
}

/// Best-effort `OFF` rollback for [`DccBusClient::pulse_function`]. On
/// drop, if still armed, it enqueues a fire-and-forget `OFF` frame so a
/// cancelled pulse does not leave the function latched on the ops track.
/// [`PulseOffGuard::disarm_and_send_off`] clears the arm and sends `OFF`
/// with a bounded ack wait, returning the ack.
struct PulseOffGuard {
    tx: mpsc::UnboundedSender<Message>,
    address: u16,
    function: u8,
    armed: bool,
}

impl PulseOffGuard {
    async fn disarm_and_send_off(mut self, session: &Session) -> Result<Ack, ApiError> {
        self.armed = false;
        let (tx, rx) = oneshot::channel();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let mut pending = session
                .pending
                .lock()
                .map_err(|_| ApiError::internal("dcc_bus_pending_poisoned"))?;
            pending.insert(id.clone(), tx);
        }
        let envelope = serde_json::to_string(&Envelope {
            kind: FRAME_SET_FUNCTION.to_string(),
            id: Some(id.clone()),
            payload: Some(serde_json::json!({
                "address": self.address,
                "function": self.function,
                "on": false,
            })),
        })
        .map_err(|err| ApiError::internal("frame_encode_failed").with_detail(err.to_string()))?;

        if self.tx.send(Message::Text(envelope)).is_err() {
            {
                if let Ok(mut pending) = session.pending.lock() {
                    pending.remove(&id);
                }
            }
            return Err(ApiError::unavailable("dcc_bus_unavailable"));
        }

        match tokio::time::timeout(PULSE_OFF_TIMEOUT, rx).await {
            Ok(Ok(ack)) if ack.ok => Ok(ack),
            Ok(Ok(ack)) => Err(ApiError::new(
                StatusCode::BAD_GATEWAY,
                ack.error
                    .unwrap_or_else(|| "function_off_failed".to_string()),
            )
            .with_detail(format!("command station {}", session.command_station_id))),
            Ok(Err(_)) => Err(ApiError::unavailable("dcc_bus_unavailable")),
            Err(_) => {
                {
                    if let Ok(mut pending) = session.pending.lock() {
                        pending.remove(&id);
                    }
                }
                Err(ApiError::new(
                    StatusCode::GATEWAY_TIMEOUT,
                    "function_off_timeout",
                ))
            }
        }
    }
}

impl Drop for PulseOffGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        // Caller dropped the future mid-pulse: emit a fire-and-forget OFF so
        // the function does not stay latched. We cannot wait for an ack in
        // `Drop`, but the frame still hits the wire.
        let id = uuid::Uuid::new_v4().to_string();
        let Ok(frame) = serde_json::to_string(&Envelope {
            kind: FRAME_SET_FUNCTION.to_string(),
            id: Some(id),
            payload: Some(serde_json::json!({
                "address": self.address,
                "function": self.function,
                "on": false,
            })),
        }) else {
            return;
        };
        let _ = self.tx.send(Message::Text(frame));
    }
}

/// Exponential backoff with full jitter, capped at [`BACKOFF_MAX_MS`].
fn backoff_delay(attempt: u32) -> Duration {
    let exp = BACKOFF_BASE_MS.saturating_mul(1u64 << attempt.min(6));
    let capped = exp.min(BACKOFF_MAX_MS);
    let jitter = rand::thread_rng().gen_range(0..=capped / 2);
    Duration::from_millis(capped / 2 + jitter)
}

/// Percent-encodes the JWT for the `?token=` query parameter. JWTs are
/// base64url plus dots, so only the padding-free alphabet matters here.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_and_is_capped() {
        for attempt in 0..8 {
            let delay = backoff_delay(attempt).as_millis() as u64;
            assert!(delay <= BACKOFF_MAX_MS, "attempt {attempt} → {delay}ms");
        }
        assert!(backoff_delay(0).as_millis() >= (BACKOFF_BASE_MS / 2) as u128);
    }

    #[test]
    fn urlencode_keeps_jwt_alphabet() {
        assert_eq!(urlencode("abcABC123-_.~"), "abcABC123-_.~");
        assert_eq!(urlencode("a+b/c=d"), "a%2Bb%2Fc%3Dd");
    }

    #[test]
    fn ack_parses_cv_results() {
        let ack: Ack = serde_json::from_str(
            r#"{"ok":true,"cvs":[{"cv":1,"value":3}],"locoAddress":3,"longAddress":false}"#,
        )
        .unwrap();
        assert!(ack.ok);
        assert_eq!(ack.cvs.unwrap()[0].cv, 1);
        assert_eq!(ack.loco_address, Some(3));
    }
}
