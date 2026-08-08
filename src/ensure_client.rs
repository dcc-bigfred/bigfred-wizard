//! Seeds the wizard's own OAuth client into BigFred's drop-in directory
//! (`$DATA_DIR/etc/bigfred/oauth-clients/bigfred-wizard.json`). BigFred
//! hot-reloads that directory, so a fresh hub needs no manual step.
//!
//! The generated `clientSecret` stays on disk (0600) and is read back by
//! `oauth_proxy` — it is never sent to the browser.

use std::io::Write;
use std::path::{Path, PathBuf};

use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::config::{oauth_clients_dir, Config};

/// One drop-in registration, mirroring `cmd.OAuthClient` on the Go side.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthClientFile {
    pub client_id: String,
    pub client_secret: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub redirect_uris: Vec<String>,
    #[serde(default)]
    pub cors_enabled: bool,
    #[serde(default)]
    pub cors_origins: Vec<String>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum EnsureError {
    #[error("io {path}: {source}")]
    Io {
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

/// Path of the drop-in for `cfg.sso_client_id`.
pub fn client_path(cfg: &Config) -> PathBuf {
    oauth_clients_dir().join(format!("{}.json", cfg.sso_client_id))
}

/// Creates the drop-in when missing. An existing file is left untouched
/// (an operator may have widened the redirect list by hand).
pub fn ensure(cfg: &Config) -> Result<PathBuf, EnsureError> {
    let dir = oauth_clients_dir();
    std::fs::create_dir_all(&dir).map_err(|source| EnsureError::Io {
        path: dir.clone(),
        source,
    })?;
    let path = client_path(cfg);
    if path.exists() {
        tracing::info!(path = %path.display(), "oauth client drop-in present");
        return Ok(path);
    }

    let file = OAuthClientFile {
        client_id: cfg.sso_client_id.clone(),
        client_secret: random_secret(),
        display_name: "BigFred Wizard".to_string(),
        redirect_uris: cfg.redirect_uris.clone(),
        cors_enabled: false,
        cors_origins: Vec::new(),
        enabled: true,
    };
    write_private(
        &path,
        &serde_json::to_vec_pretty(&file).expect("serialize client"),
    )?;
    tracing::info!(path = %path.display(), "seeded oauth client drop-in");
    Ok(path)
}

/// Reads the client secret back for the token exchange.
pub fn load_secret(cfg: &Config) -> Result<Option<String>, EnsureError> {
    let path = client_path(cfg);
    let raw = match std::fs::read(&path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => return Err(EnsureError::Io { path, source }),
    };
    let file: OAuthClientFile =
        serde_json::from_slice(&raw).map_err(|source| EnsureError::Parse { path, source })?;
    Ok(Some(file.client_secret))
}

fn random_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn write_private(path: &Path, data: &[u8]) -> Result<(), EnsureError> {
    let io = |source| EnsureError::Io {
        path: path.to_path_buf(),
        source,
    };
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path).map_err(io)?;
    f.write_all(data).map_err(io)?;
    f.write_all(b"\n").map_err(io)?;
    f.sync_all().map_err(io)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_is_64_hex_chars() {
        let s = random_secret();
        assert_eq!(s.len(), 64);
        assert!(s.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(s, random_secret());
    }

    #[test]
    fn ensure_writes_once_and_reads_back() {
        let tmp = std::env::temp_dir().join(format!("wizard-test-{}", uuid::Uuid::new_v4()));
        std::env::set_var("BIGFRED_DATA_DIR", &tmp);
        let cfg = Config::default();

        let path = ensure(&cfg).expect("seed");
        let first = load_secret(&cfg).expect("read").expect("some");
        ensure(&cfg).expect("idempotent");
        let second = load_secret(&cfg).expect("read").expect("some");

        assert_eq!(first, second);
        assert!(path.ends_with("bigfred-wizard.json"));
        std::env::remove_var("BIGFRED_DATA_DIR");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
