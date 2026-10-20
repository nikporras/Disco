//! Per-interface monitored traffic for the current app session. Only accepted
//! intervals are accumulated; operating-system counters are never treated as
//! recoverable offline history. Totals live in memory only and are never
//! written to disk, so every launch starts each interface from zero.

use std::{collections::BTreeMap, fs, path::Path, sync::Mutex};

use serde::Serialize;

use crate::{CoreError, CoreResult};

const MAX_INTERFACES: usize = 128;
const MAX_TIMESTAMP_MS: u64 = 253_402_300_799_999;

/// Files written by earlier MangoDisk versions, which persisted traffic totals.
pub const LEGACY_HISTORY_FILES: [&str; 2] = ["network-traffic.json", "network-traffic.lock"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficTotal {
    // Decimal strings retain exact counters across the JavaScript boundary.
    pub received_bytes: String,
    pub transmitted_bytes: String,
    pub started_at_ms: u64,
}

#[derive(Debug, Clone)]
struct Entry {
    received: u64,
    transmitted: u64,
    started_at_ms: u64,
}
impl Entry {
    fn total(&self) -> TrafficTotal {
        TrafficTotal {
            received_bytes: self.received.to_string(),
            transmitted_bytes: self.transmitted.to_string(),
            started_at_ms: self.started_at_ms,
        }
    }
}

/// Session-only traffic totals. Updates and resets never touch the filesystem.
#[derive(Default)]
pub struct NetworkTraffic {
    interfaces: Mutex<BTreeMap<String, Entry>>,
}
impl NetworkTraffic {
    pub fn record(
        &self,
        id: &str,
        received: u64,
        transmitted: u64,
        start_ms: u64,
        end_ms: u64,
    ) -> Option<TrafficTotal> {
        if !valid_id(id) || start_ms == 0 || end_ms < start_ms || end_ms > MAX_TIMESTAMP_MS {
            return None;
        }
        let mut interfaces = self
            .interfaces
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if !interfaces.contains_key(id) && interfaces.len() >= MAX_INTERFACES {
            return None;
        }
        let entry = interfaces.entry(id.to_owned()).or_insert(Entry {
            received: 0,
            transmitted: 0,
            started_at_ms: start_ms,
        });
        // A reset can finish while a native query is in flight. Exclude its
        // entire overlapping interval instead of reintroducing pre-reset bytes.
        if start_ms >= entry.started_at_ms {
            entry.received = entry.received.saturating_add(received);
            entry.transmitted = entry.transmitted.saturating_add(transmitted);
        }
        Some(entry.total())
    }

    pub fn total(&self, id: &str) -> Option<TrafficTotal> {
        self.interfaces
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(id)
            .map(Entry::total)
    }

    /// expected_start binds the reset to the displayed total, so a stale
    /// confirmation cannot reset an interface twice.
    pub fn reset(&self, id: &str, expected_start: u64, now_ms: u64) -> CoreResult<TrafficTotal> {
        let mut interfaces = self
            .interfaces
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let entry = interfaces
            .get_mut(id)
            .ok_or_else(|| CoreError::invalid_input("traffic interface is not recorded"))?;
        if entry.started_at_ms != expected_start
            || now_ms <= entry.started_at_ms
            || now_ms > MAX_TIMESTAMP_MS
        {
            return Err(CoreError::operation_busy("traffic reset target changed"));
        }
        *entry = Entry {
            received: 0,
            transmitted: 0,
            started_at_ms: now_ms,
        };
        Ok(entry.total())
    }
}

/// Removes traffic history left by earlier versions. Only regular files with the
/// known names are deleted; links, directories and other files are left alone.
/// Returns how many files were removed.
pub fn remove_legacy_history(directory: &Path) -> CoreResult<usize> {
    let mut removed = 0;
    for name in LEGACY_HISTORY_FILES {
        let path = directory.join(name);
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(failure(name, "inspect", error)),
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            continue;
        }
        match fs::remove_file(&path) {
            Ok(()) => removed += 1,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(failure(name, "remove", error)),
        }
    }
    Ok(removed)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 512 && !id.chars().any(char::is_control)
}
fn failure(name: &str, stage: &str, error: impl std::fmt::Display) -> CoreError {
    CoreError::persistence(format!(
        "legacy network traffic stage={stage} file={name} error={error}"
    ))
}

#[cfg(test)]
#[path = "network_traffic_tests.rs"]
mod tests;
