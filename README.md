<p align="center">
  <img src="public/disco.svg" width="40" alt="Disco application icon"> Disco
</p>

<p align="center">
  English ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.ko.md">한국어</a> ·
  <a href="README.ru.md">Русский</a>
</p>

Disco is a desktop app to analyze and clean your disk and to uninstall programs thoroughly. It is a fork of [MangoDisk](https://github.com/harry0703/MangoDisk) by harry0703 and is gradually integrating the uninstaller features of [Bulk Crap Uninstaller](https://github.com/Klocman/Bulk-Crap-Uninstaller) (BCU) by Marcin Szeniak: detection of unregistered and orphaned apps, silent batch uninstalls and leftover cleanup.

> **Status:** early development. Windows comes first; macOS and Linux builds compile but are not validated. There are no official releases yet, so build from source. The plan and its phases are in [`docs/PLAN.md`](docs/PLAN.md).

Disco is not affiliated with or endorsed by MangoDisk or BCU.

## What Disco can do today

Inherited from MangoDisk and adapted for Disco:

- **Deep cleanup** of caches, temporary files and app leftovers, driven by an open, reviewable rule library (`src-tauri/crates/mangodisk-core/rules`).
- **Large and duplicate file cleanup**, and **disk space analysis**.
- **Privacy cleanup** of app and system traces. Browser data is excluded unless you turn it on for the scan, and Disco never reads a browser's data while that browser is open. Cookies, saved passwords, autofill and search terms are reported only as totals.
- **Application uninstall** with confirmation and verification.
- **Startup item management**, **system optimization** and **system maintenance**.
- **Operation history** for every change.

Safety rules apply to every destructive flow: dry-run and preflight, protected paths, reparse-point handling, explicit confirmation, post-change verification and history.

Disco makes no connections to MangoDisk services, does not update itself (there is no release channel yet) and injects no code into other processes.

## Command line (CLI)

There are no prebuilt CLI downloads yet. Build it as shown below, then run:

```sh
# Scan and show cleanable content without changing anything
disco clean

# Apply the same smart recommendations as the desktop application
disco clean --apply

# Preview all selectable content without deleting anything
disco clean --apply --selection all --dry-run

# Produce machine-readable JSON output
disco clean --format json --no-progress
```

`disco clean` only scans and never modifies files by default. To clean up in a non-interactive environment you must also pass `--yes`. Run `disco clean --help` for all options.

## Build from source

### Prerequisites

- Node.js 24 LTS and pnpm 11
- Rust (the version pinned in `rust-toolchain.toml`)
- On Windows: Visual Studio Build Tools with the C++ workload and the WebView2 runtime

### Run, check and build

```sh
pnpm install          # frontend dependencies
pnpm tauri dev        # run the desktop app in development mode
pnpm check            # full validation: frontend, product identity, Rust fmt/clippy/check/tests
pnpm tauri build      # desktop installer
pnpm cli:build        # CLI in release mode (target/release/disco)
```

Optional hardware sensors (CPU temperature through the PawnIO driver) are excluded from default builds. See [`CLAUDE.md`](CLAUDE.md) for how to enable them.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the architecture and safety rules in [`AGENTS.md`](AGENTS.md). Report security issues as described in [`SECURITY.md`](SECURITY.md).

## License and attribution

Disco is licensed under the [GNU General Public License v3.0 only](LICENSE), like MangoDisk.

- Based on **MangoDisk** © harry0703, GPL-3.0-only.
- Uninstaller features based on **Bulk Crap Uninstaller** © Marcin Szeniak, Apache License 2.0 (as code is integrated).

See [`NOTICE`](NOTICE) for third-party attributions.
