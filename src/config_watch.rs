//! Linux inotify-based configuration watcher (no polling).
//!
//! Watches the parent directory of the config file for changes, debounces
//! bursts (atomic write+rename), then signals a reload.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

const DEBOUNCE: Duration = Duration::from_millis(300);

/// Signal that the configuration file may have changed.
pub struct ReloadSignal;

/// Filter path events relevant to the watched config basename.
pub fn is_relevant_path(path: &Path, config_name: &str) -> bool {
    let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
        return false;
    };
    if name.starts_with('.') {
        return false;
    }
    if name.ends_with('~') || name.ends_with(".swp") || name.ends_with(".tmp") {
        return false;
    }
    // Ignore the documented example sibling (`*.json.example`).
    if name.ends_with(".example") {
        return false;
    }
    name == config_name
}

/// Spawn an inotify watcher thread. Returns a receiver of debounce-coalesced
/// reload signals and a stop flag.
pub fn spawn(config_path: PathBuf) -> Result<(Receiver<ReloadSignal>, Arc<AtomicBool>), String> {
    let (tx, rx) = mpsc::channel();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thr = Arc::clone(&stop);

    thread::Builder::new()
        .name("config-watch".into())
        .spawn(move || {
            if let Err(e) = watch_loop(config_path, tx, stop_thr) {
                tracing::warn!("config watcher stopped: {e}");
            }
        })
        .map_err(|e| e.to_string())?;

    Ok((rx, stop))
}

fn watch_loop(
    config_path: PathBuf,
    reload_tx: Sender<ReloadSignal>,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let config_name = config_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("bigfred-wizard.json")
        .to_string();

    let watch_dir = config_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let (raw_tx, raw_rx) = mpsc::channel();

    let mut watcher = RecommendedWatcher::new(
        move |res: std::result::Result<Event, notify::Error>| {
            let _ = raw_tx.send(res);
        },
        notify::Config::default(),
    )
    .map_err(|e| format!("inotify watcher: {e}"))?;

    if !watch_dir.is_dir() {
        let _ = std::fs::create_dir_all(&watch_dir);
    }
    if watch_dir.is_dir() {
        watcher
            .watch(&watch_dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("watch {}: {e}", watch_dir.display()))?;
    } else if let Some(parent) = watch_dir.parent() {
        if parent.is_dir() {
            let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
        }
    }

    tracing::info!(path = %watch_dir.display(), "config watch active");

    let mut pending: Option<Instant> = None;

    loop {
        if stop.load(Ordering::SeqCst) {
            break;
        }

        let timeout = pending
            .map(|t| {
                let elapsed = t.elapsed();
                if elapsed >= DEBOUNCE {
                    Duration::from_millis(0)
                } else {
                    DEBOUNCE - elapsed
                }
            })
            .unwrap_or(Duration::from_secs(1));

        match raw_rx.recv_timeout(timeout) {
            Ok(Ok(event)) => {
                let relevant = matches!(
                    event.kind,
                    EventKind::Create(_)
                        | EventKind::Modify(_)
                        | EventKind::Remove(_)
                        | EventKind::Any
                ) && event
                    .paths
                    .iter()
                    .any(|p| is_relevant_path(p, &config_name));

                if relevant {
                    pending = Some(Instant::now());
                }
            }
            Ok(Err(e)) => {
                tracing::warn!("config watch error: {e}");
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if pending.is_some_and(|t| t.elapsed() >= DEBOUNCE) {
                    pending = None;
                    let _ = reload_tx.send(ReloadSignal);
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relevant_path_matches_basename_only() {
        assert!(is_relevant_path(
            Path::new("/data/etc/bigfred/wizard/bigfred-wizard.json"),
            "bigfred-wizard.json"
        ));
        assert!(!is_relevant_path(
            Path::new("/data/etc/bigfred/wizard/bigfred-wizard.json.example"),
            "bigfred-wizard.json"
        ));
        assert!(!is_relevant_path(
            Path::new("/data/etc/bigfred/wizard/.bigfred-wizard.json.swp"),
            "bigfred-wizard.json"
        ));
        assert!(!is_relevant_path(
            Path::new("/data/etc/bigfred/wizard/other.json"),
            "bigfred-wizard.json"
        ));
    }
}
