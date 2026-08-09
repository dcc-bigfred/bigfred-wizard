//! Seeds the wizard's own OAuth client into BigFred's drop-in directory
//! (`$DATA_DIR/etc/bigfred/oauth-clients/bigfred-wizard.json`). BigFred
//! hot-reloads that directory, so a fresh hub needs no manual step.
//!
//! The generated `clientSecret` stays on disk (0640, group `bigfred`) and
//! is read back by `oauth_proxy` — it is never sent to the browser.
//! BigFred runs as user `bigfred`, so a root-only `0600` file would make
//! the registry skip the drop-in and return `invalid_client`.

use std::io::Write;
use std::path::{Path, PathBuf};

use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::config::{merge_builtin_redirect_uris, oauth_clients_dir, Config};

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

/// Creates the drop-in when missing. An existing file keeps its secret, but
/// builtin redirect URIs from the wizard config are always merged in.
/// Directory and file modes are re-asserted so BigFred (`bigfred`) can read.
pub fn ensure(cfg: &Config) -> Result<PathBuf, EnsureError> {
    let dir = oauth_clients_dir();
    std::fs::create_dir_all(&dir).map_err(|source| EnsureError::Io {
        path: dir.clone(),
        source,
    })?;
    harden_dropin_dir(&dir);

    let path = client_path(cfg);
    if path.exists() {
        sync_redirect_uris(&path, cfg)?;
        harden_dropin_file(&path);
        // chmod/chown alone may not wake BigFred's fsnotify watch; bump mtime.
        touch_for_reload(&path);
        tracing::info!(path = %path.display(), "oauth client drop-in present");
        return Ok(path);
    }

    let mut redirect_uris = cfg.redirect_uris.clone();
    merge_builtin_redirect_uris(&mut redirect_uris);
    let file = OAuthClientFile {
        client_id: cfg.sso_client_id.clone(),
        client_secret: random_secret(),
        display_name: "BigFred Wizard".to_string(),
        redirect_uris,
        cors_enabled: false,
        cors_origins: Vec::new(),
        enabled: true,
    };
    write_private(
        &path,
        &serde_json::to_vec_pretty(&file).expect("serialize client"),
    )?;
    harden_dropin_file(&path);
    tracing::info!(path = %path.display(), "seeded oauth client drop-in");
    Ok(path)
}

/// Merges config + builtin redirect URIs into an existing drop-in without
/// rotating the client secret.
fn sync_redirect_uris(path: &Path, cfg: &Config) -> Result<(), EnsureError> {
    let raw = std::fs::read(path).map_err(|source| EnsureError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    let mut file: OAuthClientFile =
        serde_json::from_slice(&raw).map_err(|source| EnsureError::Parse {
            path: path.to_path_buf(),
            source,
        })?;

    let before = file.redirect_uris.clone();
    for uri in &cfg.redirect_uris {
        let trimmed = uri.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !file.redirect_uris.iter().any(|u| u.trim() == trimmed) {
            file.redirect_uris.push(trimmed.to_string());
        }
    }
    merge_builtin_redirect_uris(&mut file.redirect_uris);
    if file.redirect_uris == before {
        return Ok(());
    }

    let mut data = serde_json::to_vec_pretty(&file).expect("serialize client");
    data.push(b'\n');
    std::fs::write(path, data).map_err(|source| EnsureError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    tracing::info!(path = %path.display(), "merged redirect URIs into oauth client drop-in");
    Ok(())
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
        // Temporary until harden_dropin_file sets 0640 + group bigfred.
        opts.mode(0o640);
    }
    let mut f = opts.open(path).map_err(io)?;
    f.write_all(data).map_err(io)?;
    f.write_all(b"\n").map_err(io)?;
    f.sync_all().map_err(io)?;
    Ok(())
}

/// `0750 root:bigfred` so loco-server can traverse and list drop-ins.
fn harden_dropin_dir(dir: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{chown, PermissionsExt};
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o750));
        if let Some(gid) = bigfred_gid() {
            let _ = chown(dir, None, Some(gid));
        }
        if let Some(parent) = dir.parent() {
            let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o750));
            if let Some(gid) = bigfred_gid() {
                let _ = chown(parent, None, Some(gid));
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
    }
}

/// `0640 root:bigfred` — BigFred must read `clientSecret` at reload time.
fn harden_dropin_file(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{chown, PermissionsExt};
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o640));
        if let Some(gid) = bigfred_gid() {
            let _ = chown(path, None, Some(gid));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

fn bigfred_gid() -> Option<u32> {
    let text = std::fs::read_to_string("/etc/group").ok()?;
    for line in text.lines() {
        let mut parts = line.split(':');
        if parts.next()? != "bigfred" {
            continue;
        }
        let _passwd = parts.next()?;
        return parts.next()?.parse().ok();
    }
    None
}

fn touch_for_reload(path: &Path) {
    if let Ok(f) = std::fs::OpenOptions::new().write(true).open(path) {
        let _ = f.set_modified(std::time::SystemTime::now());
    }
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
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o640);
        }
        std::env::remove_var("BIGFRED_DATA_DIR");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
