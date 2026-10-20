use super::*;

#[test]
fn switch_and_reset_preserve_independent_exact_session_totals() {
    let traffic = NetworkTraffic::default();
    assert!(traffic.total("lan").is_none());
    traffic.record("lan", 100, 200, 1000, 2000).unwrap();
    traffic.record("wifi", 20, 30, 2000, 3000).unwrap();
    traffic.record("lan", 300, 400, 3000, 4000).unwrap();
    assert_eq!(traffic.total("lan").unwrap().received_bytes, "400");
    assert_eq!(traffic.total("wifi").unwrap().transmitted_bytes, "30");
    assert_eq!(traffic.total("lan").unwrap().started_at_ms, 1000);
    traffic.reset("lan", 1000, 5000).unwrap();
    assert_eq!(
        traffic
            .record("lan", 999, 999, 4500, 5500)
            .unwrap()
            .received_bytes,
        "0"
    );
    assert_eq!(
        traffic
            .record("lan", 3, 4, 5500, 6500)
            .unwrap()
            .received_bytes,
        "3"
    );
    assert_eq!(traffic.total("wifi").unwrap().received_bytes, "20");
    assert!(traffic.reset("lan", 1000, 7000).is_err());
    assert!(traffic.reset("missing", 1000, 7000).is_err());
}

#[test]
fn zero_overflow_invalid_intervals_and_bounded_interfaces_are_safe() {
    let traffic = NetworkTraffic::default();
    assert!(traffic.record("", 1, 1, 1000, 2000).is_none());
    assert!(traffic.record("lan", 1, 1, 2000, 1000).is_none());
    assert!(traffic.record("lan", 1, 1, 0, 1000).is_none());
    traffic.record("lan", 0, 0, 1000, 2000);
    assert_eq!(traffic.total("lan").unwrap().received_bytes, "0");
    traffic.record("lan", u64::MAX, u64::MAX, 2000, 3000);
    traffic.record("lan", 1, 1, 3000, 4000);
    assert_eq!(
        traffic.total("lan").unwrap().received_bytes,
        u64::MAX.to_string()
    );
    for id in 0..MAX_INTERFACES {
        traffic.record(&id.to_string(), 1, 1, 1000, 2000);
    }
    assert!(traffic.record("excess", 1, 1, 1000, 2000).is_none());
    assert!(traffic.record("lan", 0, 0, 5000, 6000).is_some());
}

#[test]
fn recording_and_resetting_never_create_files() {
    let directory = tempfile::tempdir().unwrap();
    let traffic = NetworkTraffic::default();
    traffic.record("lan", 10, 20, 1000, 2000);
    traffic.reset("lan", 1000, 3000).unwrap();
    traffic.record("lan", 1, 2, 3000, 4000);
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
}

#[test]
fn legacy_history_removal_deletes_only_known_regular_files() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::write(root.join("network-traffic.json"), br#"{"schemaVersion":1}"#).unwrap();
    fs::write(root.join("network-traffic.lock"), b"").unwrap();
    fs::write(root.join("settings.json"), b"{}").unwrap();

    assert_eq!(remove_legacy_history(root).unwrap(), 2);
    assert!(!root.join("network-traffic.json").exists());
    assert!(!root.join("network-traffic.lock").exists());
    assert!(root.join("settings.json").is_file());
    // A second launch finds nothing left to remove.
    assert_eq!(remove_legacy_history(root).unwrap(), 0);

    // An unexpected directory with a legacy name is never deleted.
    fs::create_dir(root.join("network-traffic.json")).unwrap();
    assert_eq!(remove_legacy_history(root).unwrap(), 0);
    assert!(root.join("network-traffic.json").is_dir());
}
