//! Direct UDP programming against a Z21 / RailBOX, bypassing dcc-bus.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, RwLock};

use crate::config::Config;
use crate::error::ApiError;

use super::{Ack, CvEntry, LocoProgrammer, ProgrammingMode, Status};

const SETTLE: Duration = Duration::from_millis(300);
const ADDR_CVS: [u16; 4] = [1, 17, 18, 29];

pub struct Z21Programmer {
    cfg: Arc<RwLock<Config>>,
    inner: Mutex<Option<z21_lan::Z21Client>>,
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
    ) -> Result<tokio::sync::MutexGuard<'_, Option<z21_lan::Z21Client>>, ApiError> {
        let mut guard = self.inner.lock().await;
        if guard.is_none() {
            let cfg = self.cfg.read().await;
            let z21 = &cfg.loco_programming.z21;
            if !z21.skip_scan() {
                return Err(ApiError::unavailable("z21_not_configured").with_detail(
                    "locoProgramming.z21.address and port are required in direct mode",
                ));
            }
            let addr: SocketAddr = format!("{}:{}", z21.address.trim(), z21.port)
                .parse()
                .map_err(|err: std::net::AddrParseError| {
                    ApiError::bad_request("invalid_z21_address").with_detail(err.to_string())
                })?;
            drop(cfg);
            let client = z21_lan::Z21Client::connect(addr).await.map_err(|err| {
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
        let (loco_address, long_address) =
            address_from_cvs(values[1], values[17], values[18], values[29])?;
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
        let (writes, long) = address_cv_writes(address, current)?;
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

fn map_cv_err(err: z21_lan::CvError) -> ApiError {
    match err {
        z21_lan::CvError::Timeout => ApiError::unavailable("programming_timeout"),
        z21_lan::CvError::Nack | z21_lan::CvError::ShortCircuit => {
            ApiError::unavailable("programming_failed").with_detail(err.to_string())
        }
        z21_lan::CvError::Io(err) => {
            ApiError::unavailable("z21_unreachable").with_detail(err.to_string())
        }
    }
}

fn address_from_cvs(cv1: u8, cv17: u8, cv18: u8, cv29: u8) -> Result<(u16, bool), ApiError> {
    if cv29 & 0x20 != 0 {
        let addr = (u16::from(cv17 & 0x3F) << 8) | u16::from(cv18);
        Ok((addr, true))
    } else {
        Ok((u16::from(cv1), false))
    }
}

fn address_cv_writes(addr: u16, cv29: u8) -> Result<(Vec<CvEntry>, bool), ApiError> {
    if addr == 0 {
        return Err(ApiError::bad_request("invalid_address"));
    }
    if addr <= 127 {
        Ok((
            vec![
                CvEntry {
                    cv: 1,
                    value: addr as u8,
                },
                CvEntry {
                    cv: 29,
                    value: cv29 & !0x20,
                },
            ],
            false,
        ))
    } else {
        Ok((
            vec![
                CvEntry {
                    cv: 17,
                    value: ((addr >> 8) as u8) | 0xC0,
                },
                CvEntry {
                    cv: 18,
                    value: addr as u8,
                },
                CvEntry {
                    cv: 29,
                    value: cv29 | 0x20,
                },
            ],
            true,
        ))
    }
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
}
