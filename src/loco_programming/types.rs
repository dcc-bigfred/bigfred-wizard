//! Shared result types for locomotive CV / address programming.

use serde::{Deserialize, Serialize};

/// Track used for a CV or address operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ProgrammingMode {
    /// Let the command station pick its default track.
    #[default]
    Default,
    /// Programming-on-main (ops mode).
    Pom,
    /// Dedicated programming track.
    Prog,
}

impl ProgrammingMode {
    /// Wire value for dcc-bus JSON (`null` / `"pom"` / `"prog"`).
    pub fn as_wire(self) -> Option<&'static str> {
        match self {
            Self::Default => None,
            Self::Pom => Some("pom"),
            Self::Prog => Some("prog"),
        }
    }

    pub fn is_pom(self) -> bool {
        matches!(self, Self::Pom)
    }
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
