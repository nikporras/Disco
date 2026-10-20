//! Desktop lifecycle adapter for Core's per-interface traffic totals. Totals are
//! kept for the current session only; nothing about network traffic is written
//! to disk, and history files left by earlier versions are removed at startup.
use std::sync::Arc;

use mangodisk_core::{
    system_resources::network_traffic::{remove_legacy_history, NetworkTraffic},
    CoreError, CoreResult,
};
use tauri::Manager;

use super::runtime::{ResidentReading, ResidentState};

pub fn install(app: &tauri::AppHandle, state: &ResidentState) -> Arc<NetworkTraffic> {
    match app.path().app_data_dir() {
        Ok(directory) => match remove_legacy_history(&directory) {
            Ok(removed) => log::info!("network_traffic_legacy_cleanup removed_count={removed}"),
            Err(error) => log::warn!(
                "network_traffic_legacy_cleanup_failed error={}",
                mangodisk_platform::diagnostics::text(&error)
            ),
        },
        Err(error) => log::warn!("network_traffic_legacy_cleanup_skipped error={error}"),
    }
    let traffic = Arc::new(NetworkTraffic::default());
    *state
        .network_traffic
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = Some(traffic.clone());
    log::info!("network_traffic_started persistence=none");
    traffic
}
pub fn reset(
    state: &ResidentState,
    interface_id: &str,
    started_at_ms: u64,
) -> CoreResult<ResidentReading> {
    let traffic = state
        .network_traffic
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
        .ok_or_else(|| CoreError::persistence("network traffic history is unavailable"))?;
    // Bind the confirmation to the interface that was displayed, including when
    // preferences changed while the dialog or native command was pending.
    let current = state
        .reading
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .resources
        .network
        .value
        .as_ref()
        .map(|value| value.interface.id.clone());
    if current.as_deref() != Some(interface_id) {
        return Err(CoreError::operation_busy(
            "network traffic selection changed",
        ));
    }
    let total = traffic.reset(
        interface_id,
        started_at_ms,
        super::sampling_workers::timestamp_ms(),
    )?;
    let mut reading = state
        .reading
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if let Some(network) = reading
        .resources
        .network
        .value
        .as_mut()
        .filter(|value| value.interface.id == interface_id)
    {
        network.cumulative = Some(total);
    }
    reading.revision += 1;
    let reading = reading.clone();
    state.wake();
    log::info!("network_traffic_reset scope=displayed_interface outcome=applied");
    Ok(reading)
}
