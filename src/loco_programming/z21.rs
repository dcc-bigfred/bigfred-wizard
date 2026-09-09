//! Direct UDP programming against a Z21 / RailBOX, bypassing dcc-bus.
//!
//! `addr_set` also clears ESU RailComPlus (CV 28 bit 7) when it is on: after
//! leaving the programming track that bit makes the decoder restore the
//! previous address.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use dcc_bigfred_proto_z21 as z21;
use tokio::sync::{Mutex, RwLock};

use crate::config::Config;
use crate::error::ApiError;

use super::z21_udp::{CvError, Z21Client};
use super::{Ack, CvEntry, LocoProgrammer, ProgrammingMode, Status};

const SETTLE: Duration = Duration::from_millis(300);
const ADDR_CVS: [u16; 4] = [1, 17, 18, 29];

pub struct Z21Programmer {
    cfg: Arc<RwLock<Config>>,
    inner: Mutex<Option<Z21Client>>,
    status: std::sync::Mutex<Status>,
}

impl Z21Programmer {
    pub fn new(cfg: Arc<RwLock<Config>>) -> Self {
        Self {
            cfg,
            inner: Mutex::new(None),
            status: std::sync::Mutex::new(Status::default()),
        }
    }

    async fn ensure_inner(
        &self,
    ) -> Result<tokio::sync::MutexGuard<'_, Option<Z21Client>>, ApiError> {
        let mut guard = self.inner.lock().await;
        if guard.is_none() {
            let cfg = self.cfg.read().await;
            let z21_cfg = &cfg.loco_programming.z21;
            if !z21_cfg.skip_scan() {
                return Err(ApiError::unavailable("z21_not_configured").with_detail(
                    "locoProgramming.z21.address and port are required in direct mode",
                ));
            }
            let addr: SocketAddr = format!("{}:{}", z21_cfg.address.trim(), z21_cfg.port)
                .parse()
                .map_err(|err: std::net::AddrParseError| {
                    ApiError::bad_request("invalid_z21_address").with_detail(err.to_string())
                })?;
            drop(cfg);
            let client = Z21Client::connect(addr).await.map_err(|err| {
                ApiError::unavailable("z21_unreachable").with_detail(err.to_string())
            })?;
            *guard = Some(client);
            if let Ok(mut status) = self.status.lock() {
                status.connected = true;
                status.last_error = None;
                status.command_station_name = Some("Z21 (direct)".into());
            }
        }
        Ok(guard)
    }

    /// Optional CV: NACK / timeout / short → `None` (non-ESU often has no CV 28).
    async fn try_read_cv(
        &self,
        address: u16,
        cv: u16,
        mode: ProgrammingMode,
    ) -> Result<Option<u8>, ApiError> {
        let guard = self.ensure_inner().await?;
        let client = guard
            .as_ref()
            .ok_or_else(|| ApiError::unavailable("z21_unreachable"))?;
        try_read_cv_inner(client, address, cv, mode.is_pom()).await
    }
}

impl LocoProgrammer for Z21Programmer {
    fn status(&self) -> Status {
        self.status.lock().map(|g| g.clone()).unwrap_or_default()
    }

    async fn snapshot(&self, _token: Option<&str>) -> Status {
        self.status()
    }

    async fn ensure_connected(&self, _token: &str) -> Result<Status, ApiError> {
        let _ = self.ensure_inner().await?;
        Ok(self.status())
    }

    async fn read_cvs(
        &self,
        _token: &str,
        address: u16,
        cvs: &[u16],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        let guard = self.ensure_inner().await?;
        let client = guard
            .as_ref()
            .ok_or_else(|| ApiError::unavailable("z21_unreachable"))?;
        let pom = mode.is_pom();
        let mut out = Vec::with_capacity(cvs.len());
        for (i, cv) in cvs.iter().copied().enumerate() {
            if i > 0 {
                tokio::time::sleep(SETTLE).await;
            }
            let value = if pom {
                client.read_cv_pom(address, cv).await.map_err(map_cv_err)?
            } else {
                client.read_cv(cv).await.map_err(map_cv_err)?
            };
            out.push(CvEntry { cv, value });
        }
        Ok(Ack {
            ok: true,
            cvs: Some(out),
            ..Ack::default()
        })
    }

    async fn write_cvs(
        &self,
        _token: &str,
        address: u16,
        cvs: &[CvEntry],
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        let guard = self.ensure_inner().await?;
        let client = guard
            .as_ref()
            .ok_or_else(|| ApiError::unavailable("z21_unreachable"))?;
        let pom = mode.is_pom();
        for (i, entry) in cvs.iter().enumerate() {
            if i > 0 {
                tokio::time::sleep(SETTLE).await;
            }
            if pom {
                client
                    .write_cv_pom(address, entry.cv, entry.value)
                    .await
                    .map_err(map_cv_err)?;
            } else {
                client
                    .write_cv(entry.cv, entry.value)
                    .await
                    .map_err(map_cv_err)?;
            }
        }
        Ok(Ack {
            ok: true,
            cvs: Some(cvs.to_vec()),
            ..Ack::default()
        })
    }

    async fn addr_get(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
    ) -> Result<Ack, ApiError> {
        let read = self.read_cvs(token, address, &ADDR_CVS, mode).await?;
        let cvs = read.cvs.unwrap_or_default();
        let mut values = [0u8; 30];
        for e in &cvs {
            if (e.cv as usize) < values.len() {
                values[e.cv as usize] = e.value;
            }
        }
        let (loco_address, long_address) = z21::decode_address(
            values[1],
            values[17],
            values[18],
            values[29],
            z21::CV29_LONG_BIT,
        );
        Ok(Ack {
            ok: true,
            cvs: Some(cvs),
            loco_address: Some(loco_address),
            long_address: Some(long_address),
            ..Ack::default()
        })
    }

    async fn addr_set(
        &self,
        token: &str,
        address: u16,
        mode: ProgrammingMode,
        verify: bool,
    ) -> Result<Ack, ApiError> {
        let cv29 = self.read_cvs(token, address, &[29], mode).await?;
        let current = cv29
            .cvs
            .as_ref()
            .and_then(|c| c.first())
            .map(|e| e.value)
            .ok_or_else(|| ApiError::unavailable("programming_failed"))?;
        tokio::time::sleep(SETTLE).await;
        // CV 28 is optional: failure must not abort address programming.
        let cv28 = self
            .try_read_cv(address, z21::RAILCOM_PLUS_CV, mode)
            .await?;
        let (mut writes, long) = address_cv_writes(address, current)?;
        // When bit 7 is set, write CV 28 first so RailComPlus cannot undo CV 1/17/18/29.
        prepend_railcom_plus_off(cv28, &mut writes);
        self.write_cvs(token, address, &writes, mode).await?;
        if verify {
            let got = self.addr_get(token, address, mode).await?;
            if got.loco_address != Some(address) {
                return Err(
                    ApiError::unavailable("programming_failed").with_detail("verify mismatch")
                );
            }
        }
        Ok(Ack {
            ok: true,
            cvs: Some(writes),
            loco_address: Some(address),
            long_address: Some(long),
            ..Ack::default()
        })
    }
}

/// Read one CV. Decoder NACK / timeout / short is `None` so missing CV 28
/// (non-ESU) still lets `addr_set` continue.
async fn try_read_cv_inner(
    client: &Z21Client,
    address: u16,
    cv: u16,
    pom: bool,
) -> Result<Option<u8>, ApiError> {
    let result = if pom {
        client.read_cv_pom(address, cv).await
    } else {
        client.read_cv(cv).await
    };
    match result {
        Ok(value) => Ok(Some(value)),
        Err(err @ (CvError::Nack | CvError::Timeout | CvError::ShortCircuit)) => {
            tracing::warn!(cv, error = %err, "optional CV unread, continuing");
            Ok(None)
        }
        Err(other) => Err(map_cv_err(other)),
    }
}

fn map_cv_err(err: CvError) -> ApiError {
    match err {
        CvError::Timeout => ApiError::unavailable("programming_timeout"),
        CvError::Nack | CvError::ShortCircuit => {
            ApiError::unavailable("programming_failed").with_detail(err.to_string())
        }
        CvError::Io(err) => ApiError::unavailable("z21_unreachable").with_detail(err.to_string()),
    }
}

/// Prepend a CV 28 write that clears bit 7 (RailComPlus auto recognition).
/// Skip when unread (`None`) or already off — nothing to disable.
fn prepend_railcom_plus_off(cv28: Option<u8>, writes: &mut Vec<CvEntry>) {
    let Some(cur) = cv28 else {
        return;
    };
    if !z21::railcom_plus_on(cur) {
        return;
    }
    writes.insert(
        0,
        CvEntry {
            cv: z21::RAILCOM_PLUS_CV,
            value: z21::apply_railcom_plus(cur, false),
        },
    );
}

fn address_cv_writes(addr: u16, cv29: u8) -> Result<(Vec<CvEntry>, bool), ApiError> {
    let writes = z21::address_cv_writes(addr, cv29).map_err(|err| match err {
        z21::Error::InvalidAddress => ApiError::bad_request("invalid_address"),
        z21::Error::BufferFull => ApiError::unavailable("programming_failed"),
    })?;
    let long = addr > 127;
    Ok((
        writes
            .iter()
            .copied()
            .map(|(cv, value)| CvEntry { cv, value })
            .collect(),
        long,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_address_clears_long_bit() {
        let (writes, long) = address_cv_writes(7, 0x26).unwrap();
        assert!(!long);
        assert_eq!(writes[0].cv, 1);
        assert_eq!(writes[0].value, 7);
        assert_eq!(writes[1].cv, 29);
        assert_eq!(writes[1].value, 0x06);
    }

    #[test]
    fn long_address_sets_cv17_18() {
        let (writes, long) = address_cv_writes(1234, 0x06).unwrap();
        assert!(long);
        assert_eq!(writes[0].cv, 17);
        assert_eq!(writes[0].value, 0xC4);
        assert_eq!(writes[1].cv, 18);
        assert_eq!(writes[1].value, 0xD2);
        assert_eq!(writes[2].value, 0x26);
    }

    #[test]
    fn railcom_plus_off_is_prepended_when_bit7_set() {
        let (mut writes, _) = address_cv_writes(2138, 30).unwrap();
        // 131 = 3 | 0x80 (RailComPlus on) → first write is CV 28 = 3.
        prepend_railcom_plus_off(Some(131), &mut writes);
        assert_eq!(writes[0].cv, z21::RAILCOM_PLUS_CV);
        assert_eq!(writes[0].value, 3);
        assert_eq!(
            writes.iter().map(|e| e.cv).collect::<Vec<_>>(),
            vec![z21::RAILCOM_PLUS_CV, 17, 18, 29]
        );
    }

    #[test]
    fn railcom_plus_skipped_when_already_off() {
        let (mut writes, _) = address_cv_writes(2138, 30).unwrap();
        prepend_railcom_plus_off(Some(3), &mut writes);
        assert_eq!(
            writes.iter().map(|e| e.cv).collect::<Vec<_>>(),
            vec![17, 18, 29]
        );
    }

    #[test]
    fn railcom_plus_skipped_when_cv28_unread() {
        let (mut writes, _) = address_cv_writes(13, 62).unwrap();
        prepend_railcom_plus_off(None, &mut writes);
        assert_eq!(writes.iter().map(|e| e.cv).collect::<Vec<_>>(), vec![1, 29]);
    }
}
