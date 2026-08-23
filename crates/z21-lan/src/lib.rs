//! Z21 LAN (UDP) framing and locomotive CV / POM helpers.
//!
//! Packet layouts follow Roco Z21 LAN protocol §6. CV numbers on the wire
//! are zero-based (`0` = CV1). This crate is intentionally small: no radio,
//! no mDNS, no LocoNet dispatch.

mod client;
mod packets;

pub use client::{CvError, Z21Client};
pub use packets::{
    cv_read, cv_write, encode_xbus, parse_cv_reply, parse_records, pom_read, pom_write, xor_sum,
    CvReply, HEADER_XBUS, Z21_UDP_PORT,
};
