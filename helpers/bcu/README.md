# BCU integration

Disco uses the libraries of [Bulk Crap Uninstaller](https://github.com/BCUninstaller/Bulk-Crap-Uninstaller)
(BCU, Apache-2.0, © Marcin Szeniak) through a separate .NET helper,
`helpers/disco-bcu-helper`. BCU **proposes** candidates; Disco's Rust Core
**decides and executes** every change.

## Pinned sources

- `bcu.lock.json` pins the upstream repository and commit.
- BCU sources are **not** stored in this repository. `scripts/build-bcu-helper.mjs`
  reads a pristine checkout from `DISCO_BCU_SOURCE`, `third_party/bcu` or a sibling
  `../BCU` directory, and refuses to build unless it is exactly at the pinned
  commit with no local changes.
- The checkout is copied to `target/bcu-build/src`, and only that copy is patched.

## Patches (`patches.mjs`)

Each one is a minimal exact replacement that must match exactly once. Every
modified file is marked "Modified by Disco", as Apache-2.0 requires.

| File                                      | Change                                        | Why                                                                                               |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `source/Directory.Build.props`            | target `net10.0-windows10.0.18362.0`          | Disco's helper runs on .NET 10                                                                    |
| `source/app.manifest`                     | `asInvoker` instead of `requireAdministrator` | BCU's query helpers must never trigger UAC; elevation goes only through Disco's broker            |
| `KlocTools/IO/WmiQueries.cs`              | rewindable WMI enumeration                    | on .NET 10, `ToList()` reads `Count` first and Windows Features came back empty                   |
| `KlocTools/Forms/Tools/PremadeDialogs.cs` | `HeadlessErrorHandler`                        | BCU shows modal error dialogs during scans; the helper reports them as `warning` messages instead |

## Helper protocol (schema 1)

Every stdout line is one JSON object with `schemaVersion` and `type`:

- `disco-bcu-helper inventory`: `progress` and `warning` lines, then one
  `inventory` line with `applications`. Read-only.
- `disco-bcu-helper version`: one `version` line.
- Errors: an `error` line with a stable `code` (`usage`, `scan_failed`).
- Exit codes: `0` success, `1` scan failure, `2` invalid usage.

BCU diagnostics go to stderr. The output also contains BCU's read-only query
helpers (`SteamHelper`, `StoreAppHelper`, `OculusHelper`, `ScriptHelper`), which
UninstallTools launches when present.

## Build and test (Windows)

Requirements: Visual Studio 2022+ or Build Tools with MSBuild (UninstallTools has a
COM reference that `dotnet build` cannot resolve), the .NET 10 SDK, and the
.NET 10 Desktop Runtime to run the helper.

```sh
pnpm bcu:build   # -> src-tauri/resources/bcu (git-ignored), with BCU-LICENSE.txt and BCU-NOTICE.txt
pnpm bcu:test    # protocol checks, including a full read-only inventory
```
