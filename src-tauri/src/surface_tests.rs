//! Guards for Disco's reduced default attack surface: no code is loaded into other
//! processes, and the PawnIO driver installer is only built on explicit opt-in.
use std::path::{Path, PathBuf};

const BUILD_SCRIPT: &str = include_str!("../build.rs");
const APP_MANIFEST: &str = include_str!("../Cargo.toml");
const PLATFORM_MANIFEST: &str = include_str!("../crates/mangodisk-platform/Cargo.toml");
const PRIVILEGED_MANIFEST: &str = include_str!("../crates/mangodisk-privileged/Cargo.toml");
const HELPER_BUILD_SCRIPT: &str = include_str!("../../scripts/build-privileged.mjs");

/// APIs used to place code inside another process, including Explorer.
const INJECTION_APIS: [&str; 6] = [
    "InitializeXamlDiagnostics",
    "CreateRemoteThread",
    "WriteProcessMemory",
    "VirtualAllocEx",
    "SetWindowsHookEx",
    "QueueUserAPC",
];

fn source_files(directory: &Path, files: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(directory).expect("readable source directory") {
        let path = entry.expect("readable source entry").path();
        if path.is_dir() {
            source_files(&path, files);
        } else if path.extension().is_some_and(|extension| {
            ["rs", "cpp", "hpp", "c", "h", "def"].contains(&extension.to_str().unwrap_or_default())
        }) {
            files.push(path);
        }
    }
}

#[test]
fn desktop_sources_never_inject_code_into_other_processes() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    for directory in ["src", "windows"] {
        source_files(&root.join(directory), &mut files);
    }
    assert!(!files.is_empty());
    let this_file = root.join("src").join("surface_tests.rs");
    for file in files.iter().filter(|file| **file != this_file) {
        let text = std::fs::read_to_string(file).expect("UTF-8 source");
        for api in INJECTION_APIS {
            assert!(!text.contains(api), "{} references {api}", file.display());
        }
    }
}

#[test]
fn build_script_compiles_no_native_module_into_the_desktop_executable() {
    assert!(!BUILD_SCRIPT.contains("cc::Build"));
    assert!(!BUILD_SCRIPT.contains(".dll"));
    assert!(!APP_MANIFEST.contains("\ncc = "));
    assert!(!Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("windows")
        .join("taskbar")
        .exists());
}

#[test]
fn hardware_sensors_are_opt_in_in_every_manifest() {
    assert!(APP_MANIFEST.contains("[features]\ndefault = []\n"));
    for manifest in [APP_MANIFEST, PLATFORM_MANIFEST] {
        assert!(manifest.contains("hardware-sensors = ["));
        assert!(manifest.contains("mangodisk-privileged\", optional = true }"));
        assert!(manifest.contains("mangodisk-privileged-protocol\", optional = true }"));
    }
    // The helper binary embeds PawnIO_setup.exe and must not be built by default.
    assert!(PRIVILEGED_MANIFEST.contains("hardware-sensors = []"));
    assert!(PRIVILEGED_MANIFEST.contains(
        "name = \"MangoDiskPrivileged\"\npath = \"src/main.rs\"\nrequired-features = [\"hardware-sensors\"]"
    ));
    assert!(HELPER_BUILD_SCRIPT.contains("process.env.DISCO_HARDWARE_SENSORS === '1'"));
    assert!(BUILD_SCRIPT.contains("CARGO_FEATURE_HARDWARE_SENSORS"));
}

#[test]
fn login_startup_changes_only_through_the_explicit_settings_command() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    source_files(&root, &mut files);
    let callers: Vec<_> = files
        .iter()
        .filter(|file| {
            std::fs::read_to_string(file)
                .expect("UTF-8 source")
                .contains("autostart::set(")
        })
        .filter(|file| !file.ends_with("surface_tests.rs"))
        .map(|file| file.strip_prefix(&root).unwrap().to_path_buf())
        .collect();
    assert_eq!(
        callers,
        [Path::new("commands").join("resident.rs")],
        "only resident_set_autostart may register Disco at login"
    );
    let app = include_str!("lib.rs");
    assert!(!app.contains("autolaunch().enable()"));
}

#[test]
fn browser_stores_are_never_copied_or_listed_for_sensitive_kinds() {
    let source = include_str!("../crates/mangodisk-core/src/privacy/browser_database.rs");
    let production = source
        .split("#[cfg(test)]")
        .next()
        .expect("production section");
    // No private copy of a browser database may be created to read around a browser lock.
    for forbidden in ["fs::copy(", "temp_dir()", "Snapshot"] {
        assert!(!production.contains(forbidden), "{forbidden}");
    }
    // Detail queries never select cookie hosts, credential origins, form fields or search terms.
    for forbidden in [
        "SELECT host_key",
        "SELECT host,",
        "SELECT origin_url",
        "SELECT name, COUNT(*) FROM autofill",
        "SELECT fieldname",
        "SELECT keyword_search_terms.term",
    ] {
        assert!(!production.contains(forbidden), "{forbidden}");
    }
}

#[cfg(not(feature = "hardware-sensors"))]
#[test]
fn default_build_reports_hardware_sensors_as_unsupported() {
    let observation = crate::services::windows_monitoring::observe();
    assert!(matches!(
        observation.state,
        crate::services::windows_monitoring::ServiceState::UnsupportedHardware
    ));
    assert!(!observation.driver_available);
    assert!(!observation.service_installed);
}
