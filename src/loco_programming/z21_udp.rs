//! Connected-UDP Z21 client with a single-flight send-and-await window.
//!
//! Framing comes from `dcc-bigfred-proto-z21`; this module owns the socket.

use std::net::SocketAddr;
use std::time::Duration;

use dcc_bigfred_proto_z21 as z21;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio::time::{timeout, Instant};

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
    codec: z21::Client,
    io: Mutex<()>,
    timeout: Duration,
}

impl Z21Client {
    pub async fn connect(addr: SocketAddr) -> Result<Self, CvError> {
        let sock = UdpSocket::bind("0.0.0.0:0").await?;
        sock.connect(addr).await?;
        Ok(Self {
            sock,
            codec: z21::Client::new(),
            io: Mutex::new(()),
            timeout: DEFAULT_TIMEOUT,
        })
    }

    pub async fn read_cv(&self, cv: u16) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&z21::Command::CvRead { cv }, cv).await
    }

    pub async fn write_cv(&self, cv: u16, value: u8) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&z21::Command::CvWrite { cv, value }, cv)
            .await
    }

    pub async fn read_cv_pom(&self, addr: u16, cv: u16) -> Result<u8, CvError> {
        let _g = self.io.lock().await;
        self.await_result(&z21::Command::PomRead { addr, cv }, cv)
            .await
    }

    /// POM write has no Z21 reply (spec §6.6).
    pub async fn write_cv_pom(&self, addr: u16, cv: u16, value: u8) -> Result<(), CvError> {
        let _g = self.io.lock().await;
        let pkt = self.encode(&z21::Command::PomWrite { addr, cv, value })?;
        self.sock.send(pkt.as_slice()).await?;
        Ok(())
    }

    fn encode(&self, cmd: &z21::Command) -> Result<z21::WireBuf, CvError> {
        let mut out = z21::WireBuf::new();
        self.codec.encode(cmd, &mut out).map_err(|err| {
            CvError::Io(std::io::Error::other(match err {
                z21::Error::BufferFull => "z21 encode buffer full",
                z21::Error::InvalidAddress => "z21 invalid address",
            }))
        })?;
        Ok(out)
    }

    async fn await_result(&self, cmd: &z21::Command, cv: u16) -> Result<u8, CvError> {
        let pkt = self.encode(cmd)?;
        self.sock.send(pkt.as_slice()).await?;
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
            match z21::parse_cv_reply(&buf[..n]) {
                Some(z21::Event::CvResult { cv: got, value }) if got == cv => return Ok(value),
                Some(z21::Event::CvResult { .. }) => continue,
                Some(z21::Event::CvNack) => return Err(CvError::Nack),
                Some(z21::Event::CvNackSc) => return Err(CvError::ShortCircuit),
                Some(_) | None => continue,
            }
        }
    }
}
