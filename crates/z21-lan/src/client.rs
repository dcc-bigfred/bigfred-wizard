//! Connected-UDP Z21 client with a single-flight send-and-await window.

use std::net::SocketAddr;
use std::time::Duration;

use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio::time::{timeout, Instant};

use crate::packets::{cv_read, cv_write, parse_cv_reply, pom_read, pom_write, CvReply};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum CvError {
    #[error("udp: {0}")]
    Io(#[from] std::io::Error),
    #[error("timeout waiting for CV reply")]
    Timeout,
    #[error("decoder NACK")]
    Nack,
    #[error("decoder short circuit")]
    ShortCircuit,
}

/// One connected UDP socket talking to a Z21 / RailBOX LAN command station.
pub struct Z21Client {
    sock: UdpSocket,
    io: Mutex<()>,
    timeout: Duration,
}

impl Z21Client {
    pub async fn connect(addr: SocketAddr) -> Result<Self, CvError> {
        let sock = UdpSocket::bind("0.0.0.0:0").await?;
        sock.connect(addr).await?;
        Ok(Self {
            sock,
            io: Mutex::new(()),
            timeout: DEFAULT_TIMEOUT,
        })
    }

    pub fn set_timeout(&mut self, timeout: Duration) {
        if !timeout.is_zero() {
            self.timeout = timeout;
        }
    }

    pub async fn read_cv(&self, cv: u16) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&cv_read(cv), cv).await
    }

    pub async fn write_cv(&self, cv: u16, value: u8) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&cv_write(cv, value), cv).await
    }

    pub async fn read_cv_pom(&self, addr: u16, cv: u16) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&pom_read(addr, cv), cv).await
    }

    /// POM write has no Z21 reply (spec §6.6).
    pub async fn write_cv_pom(&self, addr: u16, cv: u16, value: u8) -> Result<(), CvError> {
        let _g = self.io.lock().await;
        self.sock.send(&pom_write(addr, cv, value)).await?;
        Ok(())
    }

    async fn await_result(&self, req: &[u8], cv: u16) -> Result<u8, CvError> {
        self.sock.send(req).await?;
        let deadline = Instant::now() + self.timeout;
        let mut buf = [0u8; 1500];
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(CvError::Timeout);
            }
            let n = match timeout(remaining, self.sock.recv(&mut buf)).await {
                Ok(Ok(n)) => n,
                Ok(Err(err)) => return Err(err.into()),
                Err(_) => return Err(CvError::Timeout),
            };
            match parse_cv_reply(&buf[..n]) {
                Some(CvReply::Result { cv: got, value }) if got == cv => return Ok(value),
                Some(CvReply::Result { .. }) => continue,
                Some(CvReply::Nack) => return Err(CvError::Nack),
                Some(CvReply::NackShortCircuit) => return Err(CvError::ShortCircuit),
                None => continue,
            }
        }
    }
}
