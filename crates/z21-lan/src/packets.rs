//! Encode / parse Z21 LAN records used for decoder CV programming.

/// Default Z21 LAN port (spec §1.1).
pub const Z21_UDP_PORT: u16 = 21105;
/// X-BUS tunnel header (`LAN_X_*`).
pub const HEADER_XBUS: u16 = 0x0040;

/// XOR of every X-BUS byte except the checksum itself.
pub fn xor_sum(x: &[u8]) -> u8 {
    x.iter().fold(0, |a, b| a ^ b)
}

/// `DataLen LE | Header 0x0040 | xbus | xor(xbus)`.
pub fn encode_xbus(xbus: &[u8]) -> Vec<u8> {
    let data_len = 4u16 + u16::try_from(xbus.len()).unwrap_or(u16::MAX) + 1;
    let mut out = Vec::with_capacity(usize::from(data_len));
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(&HEADER_XBUS.to_le_bytes());
    out.extend_from_slice(xbus);
    out.push(xor_sum(xbus));
    out
}

/// NMRA CV number (1-based) to the Z21 wire value (`0` = CV1).
fn cv_wire(cv: u16) -> u16 {
    cv.saturating_sub(1)
}

fn loco_addr_bytes(addr: u16) -> (u8, u8) {
    let mut msb = ((addr >> 8) & 0x3F) as u8;
    if addr >= 128 {
        msb |= 0xC0;
    }
    (msb, (addr & 0xFF) as u8)
}

/// `LAN_X_CV_READ` (§6.1) — programming track, direct mode.
pub fn cv_read(cv: u16) -> Vec<u8> {
    let w = cv_wire(cv);
    encode_xbus(&[0x23, 0x11, (w >> 8) as u8, (w & 0xFF) as u8])
}

/// `LAN_X_CV_WRITE` (§6.2) — programming track, direct mode.
pub fn cv_write(cv: u16, value: u8) -> Vec<u8> {
    let w = cv_wire(cv);
    encode_xbus(&[0x24, 0x12, (w >> 8) as u8, (w & 0xFF) as u8, value])
}

/// `LAN_X_CV_POM_READ_BYTE` (§6.8).
pub fn pom_read(addr: u16, cv: u16) -> Vec<u8> {
    let w = cv_wire(cv);
    let (msb, lsb) = loco_addr_bytes(addr);
    let db3 = 0xE4 | ((w >> 8) & 0x03) as u8;
    encode_xbus(&[0xE6, 0x30, msb, lsb, db3, (w & 0xFF) as u8, 0x00])
}

/// `LAN_X_CV_POM_WRITE_BYTE` (§6.6). No Z21 reply.
pub fn pom_write(addr: u16, cv: u16, value: u8) -> Vec<u8> {
    let w = cv_wire(cv);
    let (msb, lsb) = loco_addr_bytes(addr);
    let db3 = 0xEC | ((w >> 8) & 0x03) as u8;
    encode_xbus(&[0xE6, 0x30, msb, lsb, db3, (w & 0xFF) as u8, value])
}

/// Parsed CV programming reply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CvReply {
    Result { cv: u16, value: u8 },
    Nack,
    NackShortCircuit,
}

/// Walk concatenated Z21 records and return the first CV reply, if any.
pub fn parse_cv_reply(buf: &[u8]) -> Option<CvReply> {
    for rec in parse_records(buf) {
        if rec.header != HEADER_XBUS {
            continue;
        }
        let d = rec.data;
        if d.len() >= 6 && d[0] == 0x64 && d[1] == 0x14 {
            let wire = (u16::from(d[2]) << 8) | u16::from(d[3]);
            return Some(CvReply::Result {
                cv: wire.saturating_add(1),
                value: d[4],
            });
        }
        if d.len() >= 2 && d[0] == 0x61 && d[1] == 0x13 {
            return Some(CvReply::Nack);
        }
        if d.len() >= 2 && d[0] == 0x61 && d[1] == 0x12 {
            return Some(CvReply::NackShortCircuit);
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub header: u16,
    pub data: Vec<u8>,
}

/// Walk concatenated Z21 records in one UDP datagram.
pub fn parse_records(buf: &[u8]) -> Vec<Record> {
    let mut out = Vec::new();
    let mut off = 0usize;
    while off + 4 <= buf.len() {
        let data_len = u16::from_le_bytes([buf[off], buf[off + 1]]) as usize;
        let header = u16::from_le_bytes([buf[off + 2], buf[off + 3]]);
        if data_len < 4 || off + data_len > buf.len() {
            break;
        }
        out.push(Record {
            header,
            data: buf[off + 4..off + data_len].to_vec(),
        });
        off += data_len;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cv_read_matches_spec() {
        let pkt = cv_read(1);
        assert_eq!(
            pkt,
            vec![0x09, 0x00, 0x40, 0x00, 0x23, 0x11, 0x00, 0x00, 0x32]
        );
    }

    #[test]
    fn cv_write_matches_spec() {
        let pkt = cv_write(8, 0x20);
        assert_eq!(
            pkt,
            vec![0x0A, 0x00, 0x40, 0x00, 0x24, 0x12, 0x00, 0x07, 0x20, 0x11]
        );
    }

    #[test]
    fn parse_cv_result() {
        let pkt = encode_xbus(&[0x64, 0x14, 0x00, 0x07, 0x20]);
        assert_eq!(
            parse_cv_reply(&pkt),
            Some(CvReply::Result { cv: 8, value: 0x20 })
        );
    }

    #[test]
    fn parse_nack() {
        let pkt = encode_xbus(&[0x61, 0x13]);
        assert_eq!(parse_cv_reply(&pkt), Some(CvReply::Nack));
        let sc = encode_xbus(&[0x61, 0x12]);
        assert_eq!(parse_cv_reply(&sc), Some(CvReply::NackShortCircuit));
    }

    #[test]
    fn pom_read_long_address() {
        let pkt = pom_read(128, 1);
        assert_eq!(pkt[0], 0x0C);
        assert_eq!(&pkt[4..6], &[0xE6, 0x30]);
        assert_eq!(pkt[6], 0xC0);
        assert_eq!(pkt[7], 0x80);
        assert_eq!(pkt[8], 0xE4);
    }
}
