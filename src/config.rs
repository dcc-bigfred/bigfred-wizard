//! Wizard configuration: `$DATA_DIR/etc/bigfred-wizard.json` (or `--config`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Environment variables consulted for the data directory, in order.
const DATA_DIR_VARS: [&str; 2] = ["BIGFRED_DATA_DIR", "DATA_DIR"];
const DATA_DIR_FALLBACK: &str = "/data";

/// Runtime configuration of the wizard daemon.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    /// Listen address, e.g. `0.0.0.0:8091`.
    pub http: String,
    /// Master switch. When false the SPA renders a "disabled" screen and
    /// the wizard endpoints refuse to run flows.
    pub enabled: bool,
    /// Loopback URL of the BigFred server (proxy + OAuth target).
    pub bigfred_url: String,
    /// URL the tablet's browser can reach BigFred at (SSO redirect).
    pub bigfred_public_url: String,
    /// OAuth client id registered as a BigFred drop-in.
    pub sso_client_id: String,
    /// Exact-match allowlist of OAuth redirect URIs.
    pub redirect_uris: Vec<String>,
    /// CORS for the wizard's own API. Off by default (same-origin SPA).
    pub cors_enabled: bool,
    pub cors_origins: Vec<String>,
    /// DCC addresses auto-allocated for every account the wizard creates.
    pub dcc_per_user: u32,
    /// Kiosk idle logout, in seconds.
    pub idle_timeout_secs: u64,
    /// Handset protocol preselected in the pairing flows.
    pub default_remote_protocol: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            http: "0.0.0.0:8091".to_string(),
            enabled: false,
            bigfred_url: "http://127.0.0.1:8080".to_string(),
            bigfred_public_url: "http://bigfred.local:8080".to_string(),
            sso_client_id: "bigfred-wizard".to_string(),
            redirect_uris: vec![
                "http://bigfred.local:8091/auth/callback".to_string(),
                "http://localhost:8091/auth/callback".to_string(),
            ],
            cors_enabled: false,
            cors_origins: Vec::new(),
            dcc_per_user: 25,
            idle_timeout_secs: 86_400,
            default_remote_protocol: "z21".to_string(),
        }
    }
}

/// The subset of the config the browser is allowed to see. The client
/// secret never leaves the daemon.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub enabled: bool,
    pub bigfred_public_url: String,
    pub dcc_per_user: u32,
    pub idle_timeout_secs: u64,
    pub sso_client_id: String,
    pub redirect_uris: Vec<String>,
    pub default_remote_protocol: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("read {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("parse {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

impl Config {
    /// Reads the config file. A missing file is not an error: the hub seeds
    /// one on first boot, and `make host` should still start locally.
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let raw = match std::fs::read(path) {
            Ok(raw) => raw,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                tracing::warn!(path = %path.display(), "config not found — using defaults");
                return Ok(Self::default());
            }
            Err(source) => {
                return Err(ConfigError::Read {
                    path: path.to_path_buf(),
                    source,
                })
            }
        };
        serde_json::from_slice(&raw).map_err(|source| ConfigError::Parse {
            path: path.to_path_buf(),
            source,
        })
    }

    pub fn public(&self) -> PublicConfig {
        PublicConfig {
            enabled: self.enabled,
            bigfred_public_url: trim_slash(&self.bigfred_public_url),
            dcc_per_user: self.dcc_per_user,
            idle_timeout_secs: self.idle_timeout_secs,
            sso_client_id: self.sso_client_id.clone(),
            redirect_uris: self.redirect_uris.clone(),
            default_remote_protocol: self.default_remote_protocol.clone(),
        }
    }

    /// `http://host` → `ws://host` (and `https` → `wss`), without a
    /// trailing slash, for dialling the dcc-bus proxy.
    pub fn bigfred_ws_base(&self) -> String {
        let base = trim_slash(&self.bigfred_url);
        if let Some(rest) = base.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = base.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            base
        }
    }

    pub fn bigfred_api_base(&self) -> String {
        trim_slash(&self.bigfred_url)
    }

    pub fn redirect_uri_allowed(&self, uri: &str) -> bool {
        let uri = uri.trim();
        self.redirect_uris.iter().any(|u| u.trim() == uri)
    }
}

fn trim_slash(s: &str) -> String {
    s.trim().trim_end_matches('/').to_string()
}

/// Data directory root: `$BIGFRED_DATA_DIR`, `$DATA_DIR`, then `/data`.
pub fn data_dir() -> PathBuf {
    for var in DATA_DIR_VARS {
        if let Ok(val) = std::env::var(var) {
            let val = val.trim();
            if !val.is_empty() {
                return PathBuf::from(val);
            }
        }
    }
    PathBuf::from(DATA_DIR_FALLBACK)
}

/// `$DATA_DIR/etc/bigfred-wizard.json`.
pub fn default_config_path() -> PathBuf {
    data_dir().join("etc").join("bigfred-wizard.json")
}

/// `$DATA_DIR/etc/bigfred/oauth-clients` — BigFred's drop-in directory.
pub fn oauth_clients_dir() -> PathBuf {
    data_dir().join("etc").join("bigfred").join("oauth-clients")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_base_converts_scheme() {
        let cfg = Config {
            bigfred_url: "http://127.0.0.1:8080/".into(),
            ..Config::default()
        };
        assert_eq!(cfg.bigfred_ws_base(), "ws://127.0.0.1:8080");
        let cfg = Config {
            bigfred_url: "https://hub:8443".into(),
            ..Config::default()
        };
        assert_eq!(cfg.bigfred_ws_base(), "wss://hub:8443");
    }

    #[test]
    fn redirect_allowlist_is_exact() {
        let cfg = Config::default();
        assert!(cfg.redirect_uri_allowed("http://localhost:8091/auth/callback"));
        assert!(!cfg.redirect_uri_allowed("http://evil.example/auth/callback"));
    }

    #[test]
    fn partial_json_falls_back_to_defaults() {
        let cfg: Config = serde_json::from_str(r#"{"enabled":true,"dccPerUser":5}"#).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.dcc_per_user, 5);
        assert_eq!(cfg.http, "0.0.0.0:8091");
    }
}
