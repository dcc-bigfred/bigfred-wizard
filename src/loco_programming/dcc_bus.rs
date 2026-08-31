//! dcc-bus implementation of [`LocoProgrammer`].

use std::sync::Arc;

use serde_json::json;

use bigfred_client::DccBusClient;

use crate::error::ApiError;

use super::{Ack, CvEntry, LocoProgrammer, ProgrammingMode, Status};

const FRAME_CV_READ: &str = "loco.cvRead";
const FRAME_CV_WRITE: &str = "loco.cvWrite";
const FRAME_ADDR_GET: &str = "loco.addrGet";
const FRAME_ADDR_SET: &str = "loco.addrSet";

/// Organizer programming frames over the cached dcc-bus WebSocket.
#[derive(Clone)]
pub struct DccBusProgrammer {
    inner: Arc<DccBusClient>,
}

impl DccBusProgrammer {
    pub fn new(inner: Arc<DccBusClient>) -> Self {
        Self { inner }
    }
}

impl LocoProgrammer for DccBusProgrammer {
    fn status(&self) -> Status {
        self.inner.status()
    }

    async fn snapshot(&self, token: Option<&str>) -> Status {
        let mut status = self.inner.status();
        let Some(token) = token else {
            return status;
        };
        match self.inner.pick_station(token).await {
            Ok(station) => {
                status.command_station_id = Some(station.id);
                status.command_station_name = Some(station.name);
                status.default_programming_track_output =
                    Some(station.default_programming_track_output);
            }
            Err(_) if status.command_station_id.is_none() => {
                status.last_error = Some("no_programming_station".to_string());
            }
            Err(_) => {}
        }
        status
    }

    async fn ensure_connected(&self, token: &str) -> Result<Status, ApiError> {
        Ok(self.inner.ensure_connected(token).await?)
    }

    async fn read_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[u16],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        Ok(self
            .inner
            .request(
                token,
                FRAME_CV_READ,
                json!({ "address": address, "cvs": cvs, "mode": mode.as_wire() }),
            )
            .await?)
    }

    async fn write_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[CvEntry],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        Ok(self
            .inner
            .request(
                token,
                FRAME_CV_WRITE,
                json!({ "address": address, "cvs": cvs, "mode": mode.as_wire() }),
            )
            .await?)
    }

    async fn addr_get(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        Ok(self
            .inner
            .request(
                token,
                FRAME_ADDR_GET,
                json!({ "address": address, "mode": mode.as_wire() }),
            )
            .await?)
    }

    async fn addr_set(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
        verify: bool,
    ) -> Result<Ack, ApiError> {
        Ok(self
            .inner
            .request(
                token,
                FRAME_ADDR_SET,
                json!({
                    "address": address,
                    "mode": mode.as_wire(),
                    "verify": verify,
                }),
            )
            .await?)
    }
}
