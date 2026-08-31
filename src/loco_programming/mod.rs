//! Locomotive CV / address programming: one trait, two backends.
//!
//! HTTP handlers pick a backend per request from live config
//! (`locoProgramming.mode`) so a hot-reload can switch dcc-bus ↔ Z21
//! without restarting the daemon.

mod dcc_bus;
mod types;
mod z21;

use std::sync::Arc;

use tokio::sync::RwLock;

use bigfred_client::DccBusClient;

use crate::config::{Config, LocoProgrammingConfig};
use crate::error::ApiError;

pub use dcc_bus::DccBusProgrammer;
pub use types::{Ack, CvEntry, ProgrammingMode, Status};
pub use z21::Z21Programmer;

/// Decoder CV / address operations used by `/api/v1/wizard/programming/*`.
///
/// `async fn` in the trait: both backends run on tokio and are `Send`.
/// Callers use [`Selected`] (enum dispatch), not `dyn LocoProgrammer`.
#[allow(async_fn_in_trait)]
pub trait LocoProgrammer: Send + Sync {
    fn status(&self) -> Status;

    /// Status plus, for dcc-bus, a catalogue lookup when `token` is set.
    async fn snapshot(&self, token: Option<&str>) -> Status;

    async fn ensure_connected(&self, token: &str) -> Result<Status, ApiError>;

    async fn read_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[u16],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError>;

    async fn write_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[CvEntry],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError>;

    async fn addr_get(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError>;

    async fn addr_set(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
        verify: bool,
    ) -> Result<Ack, ApiError>;
}

/// Borrowed backend chosen from [`Hub::select`].
pub enum Selected<'a> {
    DccBus(&'a DccBusProgrammer),
    Z21(&'a Z21Programmer),
}

impl LocoProgrammer for Selected<'_> {
    fn status(&self) -> Status {
        match self {
            Self::DccBus(p) => p.status(),
            Self::Z21(p) => p.status(),
        }
    }

    async fn snapshot(&self, token: Option<&str>) -> Status {
        match self {
            Self::DccBus(p) => p.snapshot(token).await,
            Self::Z21(p) => p.snapshot(token).await,
        }
    }

    async fn ensure_connected(&self, token: &str) -> Result<Status, ApiError> {
        match self {
            Self::DccBus(p) => p.ensure_connected(token).await,
            Self::Z21(p) => p.ensure_connected(token).await,
        }
    }

    async fn read_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[u16],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        match self {
            Self::DccBus(p) => p.read_cvs(token, address, cvs, mode).await,
            Self::Z21(p) => p.read_cvs(token, address, cvs, mode).await,
        }
    }

    async fn write_cvs(
        &self,
        token: &str,
        address: u16,
        cvs: &[CvEntry],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        match self {
            Self::DccBus(p) => p.write_cvs(token, address, cvs, mode).await,
            Self::Z21(p) => p.write_cvs(token, address, cvs, mode).await,
        }
    }

    async fn addr_get(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        match self {
            Self::DccBus(p) => p.addr_get(token, address, mode).await,
            Self::Z21(p) => p.addr_get(token, address, mode).await,
        }
    }

    async fn addr_set(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
        verify: bool,
    ) -> Result<Ack, ApiError> {
        match self {
            Self::DccBus(p) => p.addr_set(token, address, mode, verify).await,
            Self::Z21(p) => p.addr_set(token, address, mode, verify).await,
        }
    }
}

/// Owns both CV backends; [`Self::select`] picks one from live config.
#[derive(Clone)]
pub struct Hub {
    dcc: DccBusProgrammer,
    z21: Arc<Z21Programmer>,
}

impl Hub {
    pub fn new(dcc: Arc<DccBusClient>, cfg: Arc<RwLock<Config>>) -> Self {
        Self {
            dcc: DccBusProgrammer::new(dcc),
            z21: Arc::new(Z21Programmer::new(cfg)),
        }
    }

    pub fn select(&self, cfg: &LocoProgrammingConfig) -> Selected<'_> {
        if cfg.is_direct() {
            Selected::Z21(&self.z21)
        } else {
            Selected::DccBus(&self.dcc)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Config, LocoProgrammingConfig, LocoProgrammingMode};

    fn hub() -> Hub {
        let cfg = Config::default();
        let bf = Arc::new(RwLock::new(cfg.bigfred_view()));
        let wizard_cfg = Arc::new(RwLock::new(cfg));
        let http = reqwest::Client::new();
        let dcc = Arc::new(DccBusClient::new(bf, http));
        Hub::new(dcc, wizard_cfg)
    }

    #[test]
    fn select_default_is_dcc_bus() {
        let hub = hub();
        let cfg = LocoProgrammingConfig::default();
        assert!(matches!(hub.select(&cfg), Selected::DccBus(_)));
    }

    #[test]
    fn select_direct_is_z21() {
        let hub = hub();
        let cfg = LocoProgrammingConfig {
            mode: LocoProgrammingMode::Direct,
            ..LocoProgrammingConfig::default()
        };
        assert!(matches!(hub.select(&cfg), Selected::Z21(_)));
    }
}
