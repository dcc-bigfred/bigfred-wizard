//! Shared result types for locomotive CV / address programming.

pub use bigfred_client::{Ack, CvEntry, Status};

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
