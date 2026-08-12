//! Wizard configuration: `$DATA_DIR/etc/bigfred/wizard/bigfred-wizard.json`
//! (or `--config`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Environment variables consulted for the data directory, in order.
const DATA_DIR_VARS: [&str; 2] = ["BIGFRED_DATA_DIR", "DATA_DIR"];
const DATA_DIR_FALLBACK: &str = "/data";

/// TCP port the wizard listens on by default (`http: "0.0.0.0:8091"`).
/// Every builtin redirect URI MUST target this port — otherwise BigFred
/// sends the tablet browser to a port where nothing answers and SSO breaks.
/// Referenced by tests to lock the allowlist to the listen port.
#[allow(dead_code)]
pub const WIZARD_DEFAULT_PORT: u16 = 8091;

/// Redirect URIs always present in the wizard allowlist and OAuth drop-in.
/// Ports are derived from [`WIZARD_DEFAULT_PORT`] so the allowlist cannot
/// drift away from the address the wizard actually binds.
pub const BUILTIN_REDIRECT_URIS: &[&str] = &[
    "http://bigfred.local:8091/auth/callback",
    "http://bigfred.local:5175/auth/callback",
    "http://bigfred-wizard.local:8091/auth/callback",
    "http://wizard.local:8091/auth/callback",
];

/// Appends [`BUILTIN_REDIRECT_URIS`] that are not already in `uris` (exact match).
pub fn merge_builtin_redirect_uris(uris: &mut Vec<String>) {
    for builtin in BUILTIN_REDIRECT_URIS {
        if !uris.iter().any(|u| u.trim() == *builtin) {
            uris.push((*builtin).to_string());
        }
    }
}

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
    /// URL the tablet's browser can reach BigFred at (SSO redirect + phone QR).
    pub bigfred_public_url: String,
    /// Google Play listing for the BigFred Android app (Android phone QR).
    /// Empty until the operator publishes the store URL.
    pub android_app_url: String,
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
    /// WiFi SSID written into commissioned handsets (wireless-programmer).
    #[serde(default)]
    pub wifi_ssid: String,
    /// WiFi PSK for commissioned handsets. Empty = open network.
    #[serde(default)]
    pub wifi_psk: String,
    /// wiThrottle server host written into WiFred (and similar).
    #[serde(default = "default_throttle_host")]
    pub throttle_server_host: String,
    /// wiThrottle server port.
    #[serde(default = "default_throttle_port")]
    pub throttle_server_port: u16,
    /// Prefer mDNS discovery of the wiThrottle server on the device.
    #[serde(default = "default_true")]
    pub throttle_server_automatic: bool,
    /// Path to the wireless-programmer Unix socket.
    #[serde(default = "default_wireless_socket")]
    pub wireless_programmer_socket: String,
}

fn default_throttle_host() -> String {
    "bigfred.local".to_string()
}

fn default_throttle_port() -> u16 {
    12090
}

fn default_true() -> bool {
    true
}

fn default_wireless_socket() -> String {
    "/data/run/wireless-programmer/wireless-programmer.sock".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            http: "0.0.0.0:8091".to_string(),
            enabled: false,
            bigfred_url: "http://127.0.0.1:8080".to_string(),
            bigfred_public_url: "http://bigfred.local:8080".to_string(),
            android_app_url: String::new(),
            sso_client_id: "bigfred-wizard".to_string(),
            redirect_uris: {
                let mut uris = vec![
                    "http://bigfred.local:8091/auth/callback".to_string(),
                    "http://localhost:8091/auth/callback".to_string(),
                ];
                merge_builtin_redirect_uris(&mut uris);
                uris
            },
            cors_enabled: false,
            cors_origins: Vec::new(),
            dcc_per_user: 25,
            idle_timeout_secs: 86_400,
            default_remote_protocol: "z21".to_string(),
            wifi_ssid: String::new(),
            wifi_psk: String::new(),
            throttle_server_host: default_throttle_host(),
            throttle_server_port: default_throttle_port(),
            throttle_server_automatic: default_true(),
            wireless_programmer_socket: default_wireless_socket(),
        }
    }
}

/// The subset of the config the browser is allowed to see. Secrets
/// (Wi‑Fi PSK, OAuth client secret) never leave the daemon.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub enabled: bool,
    pub bigfred_public_url: String,
    pub android_app_url: String,
    pub dcc_per_user: u32,
    pub idle_timeout_secs: u64,
    pub sso_client_id: String,
    pub redirect_uris: Vec<String>,
    pub default_remote_protocol: String,
    /// SSID written into commissioned handsets (empty until configured).
    pub wifi_ssid: String,
    /// Whether a Wi‑Fi PSK is set — never the raw secret.
    pub wifi_psk_configured: bool,
    pub throttle_server_host: String,
    pub throttle_server_port: u16,
    pub throttle_server_automatic: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("read {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("write {path}: {source}")]
    Write {
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
    #[error("serialize {path}: {source}")]
    Serialize {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

impl Config {
    /// Reads the config file. A missing file is not an error: the hub seeds
    /// one on first boot, and `make host` should still start locally.
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let mut cfg = match std::fs::read(path) {
            Ok(raw) => serde_json::from_slice(&raw).map_err(|source| ConfigError::Parse {
                path: path.to_path_buf(),
                source,
            })?,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                tracing::warn!(path = %path.display(), "config not found — using defaults");
                Self::default()
            }
            Err(source) => {
                return Err(ConfigError::Read {
                    path: path.to_path_buf(),
                    source,
                })
            }
        };
        merge_builtin_redirect_uris(&mut cfg.redirect_uris);
        Ok(cfg)
    }

    pub fn public(&self) -> PublicConfig {
        PublicConfig {
            enabled: self.enabled,
            bigfred_public_url: trim_slash(&self.bigfred_public_url),
            android_app_url: self.android_app_url.trim().to_string(),
            dcc_per_user: self.dcc_per_user,
            idle_timeout_secs: self.idle_timeout_secs,
            sso_client_id: self.sso_client_id.clone(),
            redirect_uris: self.redirect_uris.clone(),
            default_remote_protocol: self.default_remote_protocol.clone(),
            wifi_ssid: self.wifi_ssid.trim().to_string(),
            wifi_psk_configured: !self.wifi_psk.trim().is_empty(),
            throttle_server_host: self.throttle_server_host.trim().to_string(),
            throttle_server_port: self.throttle_server_port,
            throttle_server_automatic: self.throttle_server_automatic,
        }
    }

    /// Resolve a QR target to a configured URL, or `None` if unset / unknown.
    pub fn qr_url(&self, target: &str) -> Option<String> {
        match target.trim() {
            "android" => {
                let u = self.android_app_url.trim();
                if u.is_empty() {
                    None
                } else {
                    Some(u.to_string())
                }
            }
            "bigfred" => Some(trim_slash(&self.bigfred_public_url)),
            _ => None,
        }
    }

    /// Hostname from [`Self::bigfred_public_url`] (no port).
    pub fn bigfred_public_host(&self) -> Option<String> {
        url::Url::parse(self.bigfred_public_url.trim())
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
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

/// `$DATA_DIR/etc/bigfred/wizard` — wizard application config directory.
pub fn wizard_config_dir() -> PathBuf {
    data_dir().join("etc").join("bigfred").join("wizard")
}

/// `$DATA_DIR/etc/bigfred/wizard/bigfred-wizard.json`.
pub fn default_config_path() -> PathBuf {
    wizard_config_dir().join("bigfred-wizard.json")
}

/// Sibling of the active config: `bigfred-wizard.json` → `bigfred-wizard.json.example`.
pub fn example_config_path(config_path: &Path) -> PathBuf {
    match config_path.file_name().and_then(|n| n.to_str()) {
        Some(name) => config_path.with_file_name(format!("{name}.example")),
        None => config_path.with_extension("json.example"),
    }
}

/// Always (re)writes a documented example of the wizard app config next to
/// `config_path`. Does not touch the live config or the OAuth drop-in.
pub fn write_example_config(config_path: &Path) -> Result<PathBuf, ConfigError> {
    let path = example_config_path(config_path);
    write_config_json(&path, &Config::default())?;
    Ok(path)
}

/// Bootstrap at start: rewrite the sibling `.example`, seed the live file from
/// defaults when missing, then load (and merge builtin redirect URIs).
pub fn ensure_config_files(config_path: &Path) -> Result<Config, ConfigError> {
    match write_example_config(config_path) {
        Ok(path) => tracing::info!(path = %path.display(), "wrote wizard config example"),
        Err(err) => tracing::warn!(error = %err, "could not write wizard config example"),
    }
    if !config_path.exists() {
        write_config_json(config_path, &Config::default())?;
        tracing::info!(
            path = %config_path.display(),
            "seeded wizard config from defaults"
        );
    }
    Config::load(config_path)
}

fn write_config_json(path: &Path, cfg: &Config) -> Result<(), ConfigError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| ConfigError::Write {
            path: parent.to_path_buf(),
            source,
        })?;
    }
    let mut body =
        serde_json::to_vec_pretty(cfg).map_err(|source| ConfigError::Serialize {
            path: path.to_path_buf(),
            source,
        })?;
    body.push(b'\n');
    std::fs::write(path, body).map_err(|source| ConfigError::Write {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(())
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
        for uri in BUILTIN_REDIRECT_URIS {
            assert!(cfg.redirect_uri_allowed(uri), "missing builtin {uri}");
        }
    }

    /// Builtin redirect URIs must point at the port the wizard binds by
    /// default. A drift here (e.g. 8081 vs 8091) silently breaks SSO on the
    /// tablet because BigFred redirects the browser to a dead port.
    #[test]
    fn builtin_redirect_uris_match_default_port() {
        let default = Config::default();
        let listen_port = default
            .http
            .rsplit(':')
            .next()
            .and_then(|p| p.parse::<u16>().ok())
            .expect("default http must be host:port");
        assert_eq!(listen_port, WIZARD_DEFAULT_PORT);

        for uri in BUILTIN_REDIRECT_URIS {
            let port = uri
                .strip_prefix("http://")
                .and_then(|rest| rest.split('/').next())
                .and_then(|host| host.rsplit(':').next())
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or_else(|| panic!("builtin URI without port: {uri}"));
            assert_eq!(
                port, WIZARD_DEFAULT_PORT,
                "builtin {uri} targets port {port}, wizard listens on {WIZARD_DEFAULT_PORT}"
            );
        }
    }

    #[test]
    fn load_merges_builtin_redirect_uris() {
        let cfg: Config =
            serde_json::from_str(r#"{"redirectUris":["http://localhost:5175/auth/callback"]}"#)
                .unwrap();
        let mut uris = cfg.redirect_uris;
        merge_builtin_redirect_uris(&mut uris);
        assert!(uris.contains(&"http://localhost:5175/auth/callback".to_string()));
        for uri in BUILTIN_REDIRECT_URIS {
            assert!(uris.iter().any(|u| u == uri));
        }
    }

    #[test]
    fn partial_json_falls_back_to_defaults() {
        let cfg: Config = serde_json::from_str(r#"{"enabled":true,"dccPerUser":5}"#).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.dcc_per_user, 5);
        assert_eq!(cfg.http, "0.0.0.0:8091");
    }

    #[test]
    fn public_exposes_wifi_ssid_but_not_psk() {
        let cfg = Config {
            wifi_ssid: "  test-ssid  ".into(),
            wifi_psk: "test123".into(),
            ..Config::default()
        };
        let pub_cfg = cfg.public();
        assert_eq!(pub_cfg.wifi_ssid, "test-ssid");
        assert!(pub_cfg.wifi_psk_configured);
        let json = serde_json::to_value(&pub_cfg).unwrap();
        assert!(json.get("wifiPsk").is_none());
        assert_eq!(json["wifiPskConfigured"], true);
        assert_eq!(json["wifiSsid"], "test-ssid");
        assert_eq!(json["throttleServerHost"], "bigfred.local");
        assert_eq!(json["throttleServerPort"], 12090);
    }

    #[test]
    fn public_marks_psk_absent_when_empty() {
        let cfg = Config {
            wifi_ssid: "open-net".into(),
            wifi_psk: "   ".into(),
            ..Config::default()
        };
        assert!(!cfg.public().wifi_psk_configured);
    }

    #[test]
    fn qr_url_targets() {
        let cfg = Config {
            android_app_url: "https://play.google.com/store/apps/details?id=x".into(),
            bigfred_public_url: "http://bigfred.local:8080/".into(),
            ..Config::default()
        };
        assert_eq!(
            cfg.qr_url("android").as_deref(),
            Some("https://play.google.com/store/apps/details?id=x")
        );
        assert_eq!(
            cfg.qr_url("bigfred").as_deref(),
            Some("http://bigfred.local:8080")
        );
        assert!(cfg.qr_url("nope").is_none());
        assert!(Config::default().qr_url("android").is_none());
    }

    #[test]
    fn write_example_config_creates_sibling() {
        let tmp = std::env::temp_dir().join(format!("wizard-cfg-ex-{}", uuid::Uuid::new_v4()));
        let cfg_path = tmp
            .join("etc")
            .join("bigfred")
            .join("wizard")
            .join("bigfred-wizard.json");
        let example = write_example_config(&cfg_path).expect("write example");
        assert_eq!(
            example.file_name().and_then(|n| n.to_str()),
            Some("bigfred-wizard.json.example")
        );
        let parsed: Config = serde_json::from_slice(&std::fs::read(&example).unwrap()).unwrap();
        assert_eq!(parsed.http, "0.0.0.0:8091");
        for uri in BUILTIN_REDIRECT_URIS {
            assert!(parsed.redirect_uris.iter().any(|u| u == uri));
        }
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn ensure_config_files_seeds_live_and_example() {
        let tmp = std::env::temp_dir().join(format!("wizard-cfg-ens-{}", uuid::Uuid::new_v4()));
        let cfg_path = tmp
            .join("etc")
            .join("bigfred")
            .join("wizard")
            .join("bigfred-wizard.json");
        assert!(!cfg_path.exists());
        let cfg = ensure_config_files(&cfg_path).expect("ensure");
        assert!(cfg_path.exists());
        assert!(example_config_path(&cfg_path).exists());
        assert!(!cfg.enabled);
        assert_eq!(cfg.throttle_server_port, 12090);
        // Second call must not overwrite an existing live file.
        let mut edited = Config::default();
        edited.enabled = true;
        write_config_json(&cfg_path, &edited).unwrap();
        let reloaded = ensure_config_files(&cfg_path).expect("ensure again");
        assert!(reloaded.enabled);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
