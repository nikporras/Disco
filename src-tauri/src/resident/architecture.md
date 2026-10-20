# Resident system status

The resident adapter combines independent Core readings into native menu-bar/tray
entries and one reusable detail panel. It does not own filesystem cleanup,
application termination, or memory-reclamation algorithms.

## Ownership

| Area | Responsibility |
| --- | --- |
| Platform `system_resources` | Native counters, interface identity, local volume identity and capacity |
| Core `system_resources` | CPU/network/disk I/O deltas, selection policy, freshness, bounded trends and memory use cases |
| `sampling_workers` / `sampling_schedule` | Bounded overview workers, demand, deadlines and generation checks |
| `process_cpu_sampling` | Independent application CPU cadence and coalesced immediate refresh |
| `runtime` | Cached snapshots, status transitions and sampling coordination |
| `presentation` | Bounded, coalesced visible-window publication and native display updates |
| `tray_display` | Shared formatting, localization, native entries and Windows bitmap ownership |
| `preferences` / `preference_schema` | Version migration, revision conflicts, native application and persistence rollback |
| `panel` / `main_window` | Independent presentation, source anchoring, focus and background-launch behavior |
| Vue resident settings store | Serialized optimistic edits and rollback to committed preferences |
| Vue settings / tray panel | Configuration preview and presentation of actual readings |

## Contracts and cadence

Fresh installations enable resident display with Logo, CPU and memory selected;
network and disk remain unselected. Disco shows them only in the notification
area; it has no in-taskbar display and never loads code into Explorer. Saved
taskbar placement and background fields stay in the schema for compatibility.

Resident preferences use schema version 25; resource readings use version 28.
Versions 1–8 preferences preserve every saved selection and order, appending GPU
display disabled. New installations also leave GPU display unselected. Resource
version 9 adds the GPU catalogue. Version 9 preferences migrate GPU selection to automatic; version 10 persists fixed selection. Frontends reject mismatched envelopes.
Version 1 preferences retain background and memory-display choices. Version 2
preferences retain all selections and migrate to taskbar presentation.
Version 3 retains that mode and defaults the new position preference to right.
Version 4 retains all choices and enables the new taskbar background option.
Version 5 retains its saved left/right preference; only new installations default
to automatic placement. Version 6 retains automatic/manual choices and defaults
the new compact mode to off. Compact mode reduces horizontal cells from 38/81
to 34/55 DIP (percentage/network), with abbreviated network units
(B/K/M/G/T) and unchanged numeric precision. Taskbar labels and values use 13 DIP Segoe UI. The shared size converts to physical pixels with nearest-pixel
rounding at the monitor DPI; paint and hit testing share those bounds.
Unknown persisted
versions are rejected for writes. Memory snapshots use version 4; release results retain their separate version 1 contract.

CPU overview samples every 2 seconds on both platforms, whether visible or hidden. Memory samples every
3 seconds, network every 1 and disk every 30.
Their freshness limits are respectively 5, 10, 5 and 90 seconds. CPU, memory, network and disk remain active while resident display is enabled,
regardless of native selections or panel visibility. GPU acquires its reader only
while selected for native display or while the panel is open; unselected hidden
GPU monitoring has no native sampling cost. Disabling resident mode stops periodic collection;
explicit device-catalogue requests may still read network and disk metadata.
Each overview worker creates its native reader only when demanded and drops it on
the same worker after demand stops and any in-flight query finishes. This releases
memory-process metadata, Windows network-change subscriptions, and CPU counters.
Re-enabling reacquires readers; hiding the panel preserves demanded readers and cached
rankings, releasing GPU resources when its native display is unselected. Resource acquisition/release logs record transitions rather than samples.
The panel has an overview of all five base readings on macOS/Windows (four on Linux),
with CPU, GPU, memory, disk and network detail pages on macOS/Windows. All pages retain
a uniform 610 logical-pixel height.
Explanatory health and network text is available through tooltips. SMART details
include cumulative reads, power cycles, spare capacity and warnings where supported;
filesystem names reuse mounted-volume enumeration. The visible Disk page also
demands the existing thirty-second temperature reading; the menu-bar choice still
controls background demand. Cached health temperatures never replace that live reading. System I/O totals are separate
from SMART lifetime counters. Interface IP/MAC metadata remains local display data,
never diagnostic or external-service payloads. macOS reuses its existing address
enumeration; Windows caches the local unicast table for ten seconds and invalidates
it on native topology changes. No per-process I/O/network tracking is added. Resource
version 25 adds disk health and network session totals/link rates; version 26 adds optional Wi-Fi metadata; version 27 adds lossless ATA attributes and additional standardized NVMe counters; version 28 adds per-interface network traffic totals (session-only in Disco). Disk health is
read only on its visible detail page, cached for five minutes, and expires after
ten minutes. Reopening the same disk preserves the last health fields while stale
results refresh in the background; cached status remains explicit. Unavailable
or disconnected readings never reuse old health fields. Temperature observations
retain their original timestamps across panel demand changes and query storage
at most once per thirty seconds for the same volume and mount. Transient failures retry after thirty seconds; unsupported devices
retry after five minutes. Native disk selection/generation checks reject stale
results, and a health read reuses its SMART temperature when both are due.
Health queries do not enable SMART, run self-tests, install drivers, or elevate.
NVMe lifetime counters retain their 128-bit decimal representation across JSON;
ATA attributes retain their IDs, flags, normalized/current/worst values and all seven vendor bytes. Only verified model/firmware profiles decode units and life percentages; unknown profiles keep raw attributes without guessed summaries. See [SMART decoding](../../crates/mangodisk-platform/src/system_resources/disk_health/decoding.md). Windows
management-only status is explicitly distinguished from detailed SMART data.
Network totals count valid observed intervals for the selected interface. Source
changes start a new total, while pauses and counter resets prime a new baseline
without counting the unobserved interval. Link rates are reported by the native
interface and never described as internet bandwidth. No active traffic probes or
average disk response-time display are added.
Network metadata uses a bounded ten-second CoreWLAN cache on macOS for negotiated transmit rate, PHY mode, channel and signal/noise. Generic IFMIB Wi-Fi baud rates are not displayed as negotiated rates; receive link rate stays absent when the native API supplies only transmit rate. Current interface MAC addresses can differ from factory addresses under private addressing. Traffic totals cover the monitored interface in this process; the UI labels them as session totals. Health percentage is max(0, 100 - NVMe percentage used). Every available health reading retains its temperature metadata slot while a live sample is unavailable, including Windows management-only health, preventing field reordering on tab switches.

Memory process details are requested only by its selected page or startup icon
warming. CPU application counters stay warm while resident mode is enabled, every 4 seconds in the background and every 2 seconds on the CPU page. Opening or explicitly refreshing that page requests a sample immediately while reusing any in-flight query and displaying cached rows. Baseline-only results receive at most two 250 ms retries. Reopening preserves the last
selected tab within the application session; a new process defaults to CPU.
A different metric entry can navigate an already open panel.
Linux AppIndicator does not publish tray click events, so its native menu starts
with a localized System status action that opens the same reusable detail panel.
Linux also lacks tray geometry; the panel uses the existing placement fallback
at the upper-right of the primary monitor's work area.
Linux panel positioning and showing run on the GTK main thread: monitor work-area
queries access GDK directly and can corrupt an X11 connection when called by a
menu or command worker alongside GTK events. Showing failures clear open intent
and record a diagnostic instead of leaving detailed sampling active.
CPU and network require two valid observations; unavailable values remain `—`.
Windows keeps one PDH query on its CPU worker and uses language-neutral
`Processor Information(_Total)` counters. Windows 10 and older Windows 11
builds use `% Processor Utility` (frequency-weighted capacity); Windows 11
26100.3624 and later use `% Processor Time`, following the Task Manager change
introduced by [KB5053656](https://support.microsoft.com/help/5053656).
The update was a gradual rollout, so the build policy cannot detect every
feature-flag state or guarantee identical samples across Task Manager versions.
macOS retains its Mach aggregate tick source. PDH failures fall back to
`GetSystemTimes`, explicitly log the source/stage/native code, and retry after
30 seconds. Only valid intervals are published, and source switches reset tick
baselines. Re-enabling monitoring or resuming after a long pause primes a new
native interval. Percentages saturate at 100 for legitimate turbo utility;
missing, negative and non-finite samples are never converted to idle zeros.
`cpu_source_selected` records the version policy; source/recovery logs and
one-minute `cpu_sample_summary` aggregates (including actual window duration)
support user-log diagnosis without writing every sample at INFO. Summaries reset
when sampling is interrupted or falls back, so resumed windows exclude old peaks.
Independent refresh phases and averaging windows
can still produce transient differences between the two applications.
Each native trend retains at most 96 points over 80 seconds for the 60-second viewport. `observedAtMs` anchors the time
axis even when the latest valid sample is older than the current snapshot.

Application rankings are immutable shared snapshots in Rust. Cloning a reading
shares their allocations without changing the resource-reading JSON contract. Unchanged
coordinator ticks only check freshness; they do not rebuild histories or lists.
Query logs separate each sensor's bounded timing samples and discarded generations.

A slow native query stays in flight until it returns. Changing demand invalidates
its generation without spawning replacement threads. Native panel visibility explicitly stops chart animation even when WebView2 leaves
`document.hidden` false. Hidden WebViews receive no periodic reading events and reload the published cache when opened.
A prewarmed panel receives one initial CPU-history seed; hidden rows do not request icons.
Native show/hide events control rendering independently of focus; Windows can show
a taskbar popup before granting focus. The listener seeds actual window visibility
and ignores a late seed after a newer event, so cached rows appear on that first frame.
Publications from one completion burst are coalesced over 50 ms and limited to once
per second. A separate presentation worker uses one bounded wake slot and reads
one immutable snapshot for both native display and visible-window events. It stores
that same revision for IPC reads, preventing reopening from getting ahead of the
native display. Preference and explicit open/refresh requests may publish immediately; a slow native UI operation
cannot block sampling or accumulate old snapshots. Preference changes and periodic
native refreshes share a separate transaction gate; sampling only briefly reads
the committed settings snapshot. Native application, persistence and rollback do
not hold that snapshot lock. Refreshes read settings after acquiring the gate so
an older refresh cannot overwrite a committed display. Failed updates retain the
previous settings, and successful updates log their elapsed time.
`resident_presentation_delayed` and
`resident_sampling_delayed` distinguish UI waits from coordinator stalls; recovery
is logged once, and the periodic sample summary includes maximum loop latency.

macOS interface names and physical-interface classification are cached for at
most 10 seconds, with immediate invalidation when interface topology changes.
Connection state, routes and byte counters are always read on each network tick.
Windows reads interface state and byte counters every tick. Default-route preferences
are cached for at most thirty seconds and invalidated by native route/interface
notifications. Callback state is process-lifetime and never touches UI or reader
pointers; worker-owned subscriptions cancel outside callbacks. Registration failure
retains per-tick metadata queries. Route-query failure clears the preference and
retries next tick, with diagnostics only on failure/recovery transitions.
Automatic selection avoids virtual/loopback interfaces; an explicit selection is
never silently replaced. Only local writable/system or user-mounted disks are
listed; a selected volume is identified independently of its current mount name.

## Native and interaction boundaries

macOS uses one combined entry with a Retina-aware drawing-handler image. Labels
and values occupy two rows; network directions retain colored arrows and explicit
units. Rate digits are right-aligned in a fixed field; units have a separate fixed
origin so digit-count and unit changes cannot move neighboring text. Native column geometry keeps numeric changes
from resizing the entry (220 pt for all metrics plus the brand). Native appearance
and recreated buttons invalidate the image cache; accessibility retains the textual
summary. The adapter
uses Tauri 2.12 native tray access; upgrades require native UI regression checks.
On macOS, the adapter registers a menu with tray-icon 0.25 and updates it when
the locale changes. tray-icon retains the menu, attaches it to the status item
only during native secondary-click tracking, then detaches it on dismissal.
This follows
[tray-icon #365](https://github.com/tauri-apps/tray-icon/pull/365): macOS 27 swallows
primary clicks while `NSStatusItem.menu` is non-null. Apple documents this
[menu/action precedence](https://developer.apple.com/documentation/appkit/nsstatusitem/menu).
The native library owns the menu event loop; the adapter does not manually
invoke status-button actions. No display-state lock or tray-icon borrow spans
that nested loop. Primary presses toggle the panel once; releases do not toggle
it again. Secondary presses hide the panel while the native menu opens.
The complete tray-handle lifetime stays on the main thread, including lookup,
cloning, and destruction. Tauri's `Send` wrapper contains tray-icon's non-atomic
`Rc`; dispatching only its native methods does not make background ownership
safe. Workers pass application handles, entry IDs, and prepared display data,
without cloning detailed process lists for native rendering. The existing
bounded presentation queue preserves snapshot order across preference commits;
display locks are acquired only after main-thread dispatch. Diagnostic handle
counts are queued without blocking sampling.
Blur during a primary press over the entry is deferred to the toggle; keyboard
switching and outside clicks still dismiss it. Preference and locale refreshes
update the retained menu without attaching it to the status item. The panel
explicitly uses AppKit's
[stationary collection behavior](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/stationary)
so Show Desktop cannot sweep a newly opened panel offscreen. This replaces only
the mutually exclusive Mission Control flags and preserves workspace/fullscreen
policy. Check opening after clicking the wallpaper to reveal the desktop,
primary open/close, secondary menu dismissal
and actions, locale refresh, and entry recreation in a packaged app when changing
this path; macOS 15 regression results do not establish macOS 27 compatibility.
Windows uses at most six retained tray handles and
bounded native-size bitmaps. Logical entry IDs are stable within MangoDisk; they
are not Windows notification GUIDs and do not guarantee retained shell placement
across restarts or changed selections. Windows controls icon order and overflow.
Hidden Windows entries are absent from the notification area even while their
handles are retained. Update their tooltip only after showing them again; a
native modify call on a hidden entry fails and can reject a preference change.
When opening a Windows panel, move it to its target monitor before applying
physical dimensions; a hidden window can still carry the previous monitor DPI.
The current Windows CPU source reports `unsupported` for multiple processor groups
instead of presenting a partial group as whole-machine usage.

The settings display card owns the resident enable switch; disabling it collapses
its options without resetting metric, source or appearance preferences. Login
startup is configured independently in General. A login launch stays hidden only
when resident display is enabled. Disabling display keeps the main window open;
Windows closes the application when that window is subsequently closed, while
macOS preserves Dock reopening. Explicit Quit always exits the application.

Settings apply directly to the native status surface without a duplicate simulated
preview. The brand toggle is a fixed card
beside the reorderable metric cards; it is not part of metric ordering. macOS metric reordering
uses local pointer events because native file-drop handling is also needed by
cleanup pages. Keyboard reordering restores focus after keyed DOM moves.

Diagnostics record status transitions, network selection reasons, failure
stages/codes, sampling percentiles, discarded generations, tray updates and tray-handle counts. Device identities,
private mount paths and raw machine reports do not belong in application logs or
committed validation reports.

Run `pnpm check`, Core tests, Platform system-resource tests and resident-adapter
tests on applicable macOS and Windows environments. Native acceptance includes
cold/warm opening, overflow anchors, focus, lifecycle/login startup, disconnection,
volume removal, native-size readability and release-build resource measurements.
Exercise all 32 metric/brand combinations in the real notification area, including
brand-hidden transitions and the all-disabled fallback; model-only tests cannot
verify the native entry lifecycle.


## Memory release preferences

On macOS and Windows, `memory-release.json` stores schema version 1 separately from display
preferences. Unknown versions or malformed data disable automatic release and
block writes rather than replacing the user's settings. Revision checks prevent
the ranking shortcut and the settings window from overwriting each other's edits.

Manual and scheduled release share one serialized action. On Windows, both honor
executable-path exclusions. An exclusion covers all processes with the same executable image,
including later restarts; it does not cover unrelated helper executables or stop
Windows itself from reclaiming memory. Native identity is read from the opened
process handle before trimming, and unreadable identities are skipped whenever
exclusions are active. Automatic release can also skip the foreground image.

New preferences default to a fifteen-minute interval with automatic release off.
Accepted intervals are 3, 5, 15, 30, 60, and 120 minutes; existing saved choices
remain unchanged.

The desktop worker checks deadlines every five seconds, samples memory only when
a check is due, and never accumulates missed checks. Settings changes, manual
actions, sleep gaps, and clock discontinuities reset the interval. No service,
elevation, or operating-system scheduled task is installed. macOS uses the same
scheduler and settings entry point with its native volatile-memory operation;
foreground-process skipping remains Windows-only because the macOS operation is
global. macOS exposes only the timer and threshold; preferences containing an
exclusion list or foreground skipping are rejected, never silently ignored.
The separate settings window remains open when the monitor loses focus.

### Usage colors and menu-bar density

Preference version 16 stores independent color conditions for CPU/GPU
usage, memory, disk, and CPU/GPU temperature. Each metric has an enable flag
and zero to sixteen rules: below, inclusive-start/exclusive-end range, or
at least. Conditions cannot overlap; gaps use the system foreground. Thresholds
are whole percentages through 100 or Celsius values through 150. Classification
uses the rounded displayed value; missing readings never match a rule. Native
adapters share classification and theme-aware colors. The global switch gates
all metric rules. Each display item opens a fixed-height editing dialog with a
local draft, Number Field controls, explicit save/cancel, and deletion of every
rule. Closing without saving leaves persisted preferences unchanged.

Version 15 continuous bands migrate to equivalent conditions without changing
colors, thresholds, enable flags, or selections. Older preferences retain their
warning/critical thresholds as default/orange/red rules; temperature coloring
remains disabled during that migration. New installations use green/orange/red
defaults. Only adjacent descending boundaries have three-percentage-point or
two-degree hysteresis; gaps immediately return to the system foreground.

Version 8 adds these color preferences and an independent macOS compact setting.
Legacy selections and custom order are retained. The former default sequence
and new installations use CPU, memory, disk, then network. macOS compact mode preserves labels, percentages and direction
arrows, shortens network units, and reduces fixed field widths and spacing. Both
densities reserve enough width for their largest numeric values at the native font.

### Background update notice

`services::app_updates` owns both scheduled discovery and explicit checks,
independently of resident sampling and main-window creation. It checks after a
3-second startup delay and then every six hours; failures retry after 1, 5, 30,
and at most 60 minutes while retaining the last successful result. Wall-clock
deadlines include sleep. A 30-second poll or window-focus read catches overdue
checks. Concurrent callers share the active result, including failures; a manual
check after completion explicitly refreshes. Each network operation has a total
timeout and uses the same native locale, distribution, optional existing install
identity, and OS version headers. Discovery does not depend on browser timezone
metadata or create another installation identity.

The versioned, revisioned `app-update-notice` snapshot is readable through
`get_app_update_notice`. Consumers subscribe before reading and reject older
revisions. Every successful check advances the revision, including no-update
results, so both windows clear stale notices. Failed checks retain the prior
result. The resource panel shows one text action in either tab; no tray-menu item
or OS notification is created.

The existing About navigation reads the native cache through
`acquire_app_update(refresh=false)`. Only the main WebView may acquire a cloned
plugin Update in its resource table. The cached native Update remains independent
of that window's resource lifetime. `refresh=true` explicitly requests a check;
opening the update window after discovery does not make another network request.
The frontend continues using the plugin's signed download and install methods,
including portable download URL validation and existing user-controlled actions.
Downloaded resources are not replaced by background notices.

Logs record request source and ID, shared requests, availability, version
changes, elapsed time, retry delay, and retained-result state. Resource acquisition
is distinct from network discovery. Polls and unchanged notice reads do not log.
State remains process-local and is rediscovered after restart, without a new
persisted settings schema or forced WebView creation.

### GPU activity

GPU activity samples every two seconds with a five-second freshness limit. Its
independent worker acquires native resources lazily and releases them after
GPU demand stops and in-flight work completes. Windows baseline recovery uses
at most two 250 ms retries for a quick first value. Hidden panels stop chart animation;
GPU history is retained with the same bounded window as CPU. The overview places
CPU and GPU side by side; GPU entries share the existing panel navigation. Native GPU percentages
reuse the existing compact layout, rounded usage colors and unavailable dash.

Core selects the busiest readable GPU by default, with stable identity-based ties.
A fixed selection never falls back to another adapter; a missing selection is
reported as disconnected. Selection changes clear history and re-prime native
intervals. Automatic history represents the system-wide maximum even when the
leading GPU changes. Settings list hardware adapters even when their counters
are unavailable. Catalogue-only demand refreshes metadata without acquiring the
PDH query; opening configuration with GPU display disabled does not start
utilization sampling. Windows identities use PCI vendor/device and bus/device/function
plus physical-adapter index; macOS uses the IOService registry path. Neither
persists an ephemeral LUID or registry entry ID. Session adapters with invalid
PCI addresses are excluded instead of sharing a persisted identity. The card and native tooltip
identify the sampled device. Invalid observations never become idle zeros.

Windows keeps one language-neutral `\\GPU Engine(*)\\Utilization Percentage` PDH
query and reuses a bounded, aligned native buffer. Instances are grouped by
adapter LUID, physical GPU and engine; process activity is summed per engine.
DXGI and public D3DKMT adapter queries cache hardware identities and standard
WDDM engine types for 30 seconds. The aggregate takes the busiest standard
engine, excluding driver-defined `DXGK_ENGINE_TYPE_OTHER` nodes. This matches
the tested Windows 10 summary where a driver-defined Graphics_1 curve can be
much higher than the overall percentage. It is a summary compatibility policy,
not an assertion that OTHER engines are idle: compute workloads exposed only
through custom engines are outside this reading. Do not infer engine roles from
names or use the current four visible charts to classify engines. Software
adapters are excluded. Missing metadata fails closed instead of reverting to an
incomparable all-engine maximum. Driver/build differences require hardware
validation; exact instantaneous equality is not guaranteed across sample windows.

On macOS, CPU and memory enumerate `proc_listallpids` and read fresh
`proc_pid_rusage(RUSAGE_INFO_V2)` counters through one minimal native reader. They
share executable metadata keyed by PID, creation time, and executable-image UUID.
Exited identities are evicted; failed identity queries are not cached by PID alone.
Readers acquire the cache lazily, and the registry holds only a weak reference so
resetting the last active reader releases all cached metadata.
Path lookups validate identity again before attaching measurements. Transient path
failures retry after two seconds; successful paths refresh after thirty seconds.
LaunchServices display names remain freshly queried, including per-application
WebKit names. Enumeration failures retain historical readings through the existing
failure path; they never publish an empty success or substitute RSS for footprint.

A bounded, isolated `/bin/ps` query supplements processes owned by
other users, including WindowServer and virtual machines. Only unreadable PIDs
are queried; readable processes retain the cheaper native path. It reads cumulative CPU
**time**, never the lifetime-average `%cpu`, environment, or command-line arguments.
The command has a 500 ms deadline and 1 MiB output limit. Its creation identity has
one-second resolution and counters have 10 ms resolution; the native path retains
subsecond identity and counters. The kernel task remains explicitly unavailable,
as it cannot be read through this path. Unreadable counters are omitted, never idle.
Registered macOS applications supply their display names, including individual VM names.

Windows reads cumulative CPU times in one `NtQuerySystemInformation` process snapshot,
so system/service counters do not require opening each process handle or elevation.
PID 0 is idle capacity and is excluded from the work ranking. Image paths remain
optional: limited-access image queries validate the exact creation identity on the
same handle, then cache both success and denial until that identity exits. Reused
PIDs receive new queries. CPU and memory readers share a PID/creation-keyed image
cache; numeric snapshots remain fresh and independent. The registry owns only a
weak reference, so dropping the last reader releases cached metadata. Warm snapshots
reuse image results rather than repeating process-handle path queries.
The native entry point is resolved dynamically. The Windows 10/11 CPU prefix layout
is checked against this process's public `GetProcessTimes` before/after counters on
every sample. Entry offsets, UTF-16 pointers and lengths are checked within the
returned buffer; retries are capped at four and retained buffer storage at 16 MiB.
An unavailable or incompatible native snapshot logs a bounded fallback transition
and uses limited-access `GetProcessTimes`; that fallback can omit system processes,
which remain available in diagnostic coverage counts rather than a permanent user-facing count. No new privileges or helper are needed.

Core computes monotonic deltas keyed by PID and creation identity. macOS CPU rows remain individual processes. Windows CPU rows and memory rows use the same application identity and aggregation function: known executable paths group together, unknown paths and `svchost.exe` service hosts remain separate. Service hosts never expose application quit. CPU groups sum all valid members before ranking, retain up to 50 member PID/start-time/usage details, and never expose an app-wide quit action. macOS process percentages
use 100% per logical core and can exceed 100%; Windows uses 100% across all logical
cores, matching each platform's customary system-tool scale. The CPU overview and
trend still use the whole-machine 0–100% scale. Typed `usageScale` communicates the
list's units. Relative row bars compare with the largest row, not the overview.
New processes, counter rollback, scale/topology changes, and intervals outside
200–5000 ms require a new baseline. Maps are replaced every sample and rankings
publish the 50 highest-usage applications after aggregation. The delta baseline still retains every readable process so a newly busy process can enter the ranking immediately. CPU retains coverage counts for diagnostics; only actionable refresh failures appear in the panel. Process IDs are shown in details.
Compare the same PID in Task Manager's Details view: its Processes view groups
application instances, and independently sampled windows need not show identical
instantaneous values.

CPU and memory share icon identity, disclosure, and file-manager navigation. CPU is
view-only: normal app-wide quit and memory exclusions remain in the memory list.
Resource version 9 replaces the ephemeral IPC protocol; readers reject other
versions. Resident preferences migrate independently to version 11.

Linux process rows request path-specific icons rather than sharing an extensionless
file-type icon. The GUI enables the platform's `linux-desktop-icons` feature;
standalone Core/CLI builds do not acquire GTK dependencies. The adapter indexes registered desktop entries through
GIO, matches canonical executable paths, and resolves their artwork through the
current GTK icon theme. Conflicting entries, script/sandbox launchers, and processes
without registered artwork retain a neutral process glyph. The running MangoDisk
executable uses its bundled artwork after registration of its exact path.
Shared-launcher checks apply to both the desktop command and its canonical
executable, so a differently named symlink cannot assign a script's artwork to
unrelated interpreter processes. An isolated desktop-registry regression test
covers this alias case without modifying the user's registered applications.
Metadata and scaled PNG decoding run on icon workers, independently of resource
sampling. Only theme lookup uses the GTK main loop, with a bounded wait and retry
backoff. Desktop indexing and positive/negative path resolution are bounded and
refresh after sixty seconds; theme changes invalidate native resolved paths. Existing
frontend batching and native PNG caching avoid repeated decoding on panel reopen.
Run `cargo test -p mangodisk-platform --features linux-desktop-icons --test linux_file_icons -- --ignored --nocapture`
with the target desktop's `DISPLAY` for cold/repeated timings and real application
coverage. Set `MANGODISK_EXPECT_NATIVE_ICONS=1` on the Ubuntu GNOME test desktop to
assert registered application artwork and daemon fallback. Keep raw output under
the ignored `.local/` directory.

For repeatable sensor-cost measurements, build `resource_sampling_probe` in
`mangodisk-platform` with `--release`, then run `overview`, `memory`, `cpu`,
`cpu-background`, or `cpu-memory` with a duration in seconds (60 by default).
`gpu` isolates two-second GPU sampling, and `overview-gpu` adds it to the
CPU/memory baseline. `gpu_usage_probe <seconds> --lifecycle` prints native
GPU observations and exercises baseline reset and reader reacquisition.
`gpu_usage_probe <seconds> --catalogue` measures metadata-only discovery without
acquiring utilization counters.
`cpu-memory` measures both detail sources in one process with shared metadata.
The optional third argument selects a two- or four-second process CPU interval.
Each run warms up for eight seconds and emits
aggregate single-core CPU percentage, helper CPU time, RSS bounds, and sample latency
percentiles. macOS measurements include the system-tool fallback separately and in
the combined CPU total; helper RSS is transient and excluded from probe RSS bounds.
Use the same build, workload, and duration for comparisons; the probe includes its
own observation overhead and excludes UI, icon I/O, and application aggregation.
Keep raw machine output in the ignored `.local/` directory. Measure the packaged
application separately with its windows hidden and each detail panel open.

Memory process rankings have a separate `memoryProcesses` reading and timestamp in resource protocol version 8. Overview-only samples preserve these rows without extending their freshness. Real empty detail samples clear the list; failed/stale detail results retain previous rows with a notice. The source memory snapshot is version 3; resident publication moves its optional detail payload into the dedicated cache to avoid duplicate IPC data. Frontends reject earlier resource versions.

Windows image lookups retain typed available/denied/exited/unavailable outcomes. Only transient unavailable results retry, at 30-second intervals and at most three total attempts per PID/creation identity. Successful paths and denials do not poll again; exited identities are evicted. Path failures never remove readable CPU counters. The UI explains access restrictions without requesting elevation.

CPU and memory panels share persisted name/usage sorting (frontend settings key
`resourceSortPreferences`, schema 1, invalid/unknown versions reset to defaults).
Both rankings publish at most 50 highest-usage entries and use virtual rendering; name sorting reorders this bounded set. The sortable column labels occupy one header row. Row keys remain stable across value-only updates to avoid invalidating virtual measurements; startup icon warming stays capped at
30 entries. Expanding details freezes the displayed identities and member order
while measurements continue. Missing samples display unavailable values and disable
actions rather than claiming the process exited. New identities wait until the
list unlocks. Explicit column sorting applies immediately; closing the panel clears
the interaction lock and resets the scroll position. Native visibility disables virtual
observers while hidden; reopening rebuilds the visible range from offset zero even
when the WebView suppresses hidden scroll events. CPU and memory retain separate sorting preferences.

Visible main-window publications omit process rankings, which are consumed only by
the detail panel. The panel retains value identity for matching sample timestamps
so network-only ticks do not rebuild the CPU or memory lists; status changes and
explicit clears still apply. Native entries and overview values share the same
published revision as before.

## Memory measurement semantics

Memory rankings publish `usageKind` and nullable `usedBytes`, rather than calling every
platform metric resident memory. macOS uses the process footprint ledger (including
compressed attribution); Windows uses private working set, excluding shared pages and
commit. Linux retains RSS. Groups reuse the CPU identity fold and sum all readable
members before ranking and publish `readableProcessCount` with each application. A
partially readable group shows its measured sum with a partial-data badge and readable/total
coverage in expanded details; a completely unreadable group remains unknown. Shared macOS
WebKit XPC images retain separate PID identities and OS display names, because their
processes can belong to unrelated host applications. Windows service hosts remain
separate by PID; other images group by executable path, so runtime hosts may still
group differently from Task Manager. Use matching PID sets for numerical comparisons; group totals do not sum to
system used memory.

macOS overview subtracts native free and file-backed page counts from installed RAM,
including inactive anonymous pages and the physical compressor. The free-page field
excludes speculative pages and is not a pressure classification. Windows overview
retains physical total minus native available memory. No process totals are used to
construct either system overview.

Unreadable GUI applications remain visible without a numeric rank, even when they
would otherwise be lost behind 50 known rows. Their values show a dash and their
expanded detail explains the permission limitation. Other unknown processes occupy
remaining slots. Native failures never fall back to RSS or zero under a footprint or
private-working-set label. macOS system/root processes can remain unreadable at normal
privilege: Activity Monitor has system access which this app does not request. High-cost
`top`/memory-map traversal and privilege elevation are not part of periodic monitoring.

Source snapshot schema 3 and resident schema 8 replace the former resident-byte field;
frontends reject earlier envelopes. `application_memory_probe` captures native PID
measurements and grouped Core publication from the same sample for reproducible
system-tool comparisons without collecting command lines or environments.

## GPU detail observations

The version 11 reading contract adds device-bound GPU histories and optional
telemetry to `gpuDetails`. `gpuDetailAdapterId` identifies the source of
`gpuDetailHistory`, `gpuRendererHistory` and `gpuTilerHistory`.
`gpu` retains a summary with no embedded details. An incompatible frontend
rejects the snapshot rather than presenting partial measurements. Preferences
use version 11; the existing stable device selection is shared by both views.

Only a visible GPU tab requests detail observations. Windows temporarily adds
adapter-wide Dedicated Usage and Shared Usage counters to its persistent PDH
query, removes them when detail demand ends, and maps them by LUID and physical
adapter index. DXGI reports dedicated capacity for a single physical adapter;
linked-adapter capacity and shared capacity remain unavailable. Driver-defined
engines are visible separately and do not change the standard-engine summary.
Memory failures have independent backoff and cannot disable activity readings.
Windows probes temperature through public WDDM `KMTQAITYPE_ADAPTERPERFDATA`
queries independently of detail demand. The metadata cache retains its adapter handle;
physical adapter indices keep linked GPUs separate. Temperature is converted from
deci-Celsius, and unsupported or invalid readings are omitted. Wholly unavailable
adapter telemetry queries retry after thirty seconds.
The panel displays dedicated usage only; shared usage is withheld because its
equivalence to Task Manager has not been validated across drivers.
macOS probes Renderer and Tiler percentages and optional clocks and fan percentage
from the same IOAccelerator snapshot, including background samples. Identified GPU
temperature has a separate four-second read described below. Core count is discovered
from `gpu-core-count` with the adapter, outside the sampling hot path.
Apple AGX adapters report unified memory architecture; driver allocation fields
are not treated as physical VRAM capacity. Unsupported optional facts are omitted.

Core records every real summary sample in the selected-device trend, including
background samples when details pause. This prevents artificial holes caused by
tab changes without bridging real outages or mixing devices. Renderer and Tiler
histories include every actual engine observation, so macOS tab changes preserve
their continuity. Actual sampling outages remain blank. All three selected-device
histories clear when the adapter changes. The overview retains its history of the
automatic maximum. Both views
use bounded histories and original sample timestamps; failures and expiration do
not become idle values. Native GPU entries and the GPU overview card navigate to
the GPU tab. The detail selector persists through the same optimistic settings
store, including rollback and retained disconnected selections.

Reopening the panel displays the retained sample while native detail collection
resumes. Stale or failed samples keep their original status and are marked as
cached. A warm summary can fill the card before the first detail sample arrives.
Details and histories are displayed only for their matching summary adapter; preference
refreshes run in the background, and a changed fixed selection hides mismatched
measurements immediately. Disconnected or unsupported GPUs do not reuse values.

The panel omits unified-memory placeholder sections and explanatory memory text.
Optional driver telemetry is shown only when supported; absent fields never
become plausible zero measurements. Minute average and peak use valid actual
selected-device observations within the last 60 seconds, excluding missing or
future samples. Neither ANE percentages estimated from nominal power nor display
swap rates are presented as GPU compute utilization or application FPS.

GPU engine presentation uses a stable functional order: 3D, Copy, Video Decode,
Video Encode, Video Processing, then other standard nodes. Only observed types
are shown; zero utilization does not hide an observed engine. Custom engines
use natural native-name order with numeric chunks and stable identity tie-breaks,
independent of locale and live utilization. macOS retains Renderer before Tiler.

GPU discovery logs hardware identities, names and available metadata, plus Windows
node ordinals, native engine types and inclusion in the peak-standard-engine summary.
Topology is logged on discovery/change only, with at most 64 node records per
adapter and an explicit omitted count. Native names are escaped and bounded.
Observation diagnostics record the actual utilization source, optional capabilities,
memory availability and missing/invalid data stages, without per-sample values.
Capability records have a 30-second minimum interval per device; transient changes
retain a count and their latest unavailable stage until the next summary. Device
removal and reader release flush pending transitions before discarding their state;
these lifecycle summaries can precede the periodic deadline. Already emitted changes
are never repeated on release. macOS instantaneous readings need no interval reset:
tab/demand changes preserve the 30-second native catalogue cache until discovery
refreshes it or the owning worker releases the reader. A missing
capability snapshot means details were not collected, not that the hardware lacks
them. The engine mask uses Graphics=1, Copy=2, Decode=4, Encode=8, Processing=16,
Other=32, Renderer=64 and Tiler=128. Diagnostic entries are pruned as devices leave.
Windows temperature query failures retain their native stage/code at Info level,
with unsupported retries and diagnostic state preserved across metadata refreshes.
Windows GPU utilization retains its PDH query for the first three transient data
failures, retrying after 1, 2, and 4 seconds. Persistent or structural failures
reopen the query after 30 seconds. A new rate-counter baseline does not establish
recovery; the first valid sample records the prior native error, attempt count,
and outage duration. Unchanged failures are summarized rather than logged every
sample, and unchanged memory-capacity diagnostics remain at Debug level.
`gpu_usage_probe <seconds> --details --diagnostics` enables the same diagnostics
on stderr without mixing them into its JSON observation protocol. Combining
`--lifecycle --details --diagnostics` also exercises detail demand transitions
before a reader release, without injecting hardware failures.

### CPU temperature observations

CPU temperature is independent of utilization and frequency. The existing CPU
worker requests a reading at most once every four seconds while macOS resident
monitoring or the optional Windows collection service is enabled. Display choices
and panel visibility do not interrupt collection. Stopping collection drops native
sensor handles; resuming starts a fresh observation.
Failed queries retry after 30 seconds. Values expire after ten seconds, and the
frontend checks sample age before displaying a number. The Celsius trend defaults
to 0–100 degrees and expands in twenty-degree steps when retained samples exceed
100 degrees; this range is not a health threshold. Failures and changed sensor
sets clear temperature history.

macOS reads only mapped CPU SMC keys, caches their metadata, and requires all
selected sensors to be valid before publishing a reading. Apple Silicon
M1–M5 mappings distinguish CPU keys from GPU, PMU, battery and proximity sensors;
unknown chips are unsupported. Apple Silicon publishes the selected cores' average.
Intel prefers the CPU package key TCAD. When absent, machines with one to eight
physical cores can use the highest TC1C–TC8C core temperature, bounded by
`hw.physicalcpu_max` and requiring the complete selected set. Unused slots are
excluded because they can expose plausible-looking sentinel values. A core maximum
is explicitly labeled as such, never as a package reading. If those readings are
unavailable or contain disabled-sensor sentinels, Intel falls back to the first
valid TC0D/TC0E/TC0F diode reading, then TC0P CPU proximity. The protocol and detail
hints distinguish diode and proximity from core/package measurements. Native
transport failures remain errors rather than triggering a different sensor.
These private
interfaces require per-chip and OS validation; available readings do not establish
support for every Mac. Linux recognizes coretemp package/core sensors and k10temp
Tdie, excluding Tctl offsets and anonymous thermal zones. Windows uses the optional
privileged collection service for single-package x64 Intel DTS and AMD Zen
families 17h, 19h, and 1Ah. AMD reads the fixed SMN temperature register through
the signed PawnIO module, applies range and documented Tctl offsets, and labels
the result Tdie. PCI configuration access uses a shared, bounded native mutex.
Public ACPI zone readings are intentionally unsupported rather than mislabeled. Unsupported
devices omit the entire temperature section, while failed or stale values display
an em dash rather than a cached number.

## CPU temperature display

Preference schema 21 keeps network last in the default display order, after
battery and whole-system power items. Loading an older complete default order
moves only network to the end; custom saved order, selections and color rules
remain intact. Missing display items are inserted before a trailing network item.

Preference schema 11 adds `cpuTemperature` to the ordered `metrics` display
items. It is disabled by default and appended to migrated preferences without
changing existing selections or relative order. macOS exposes the same checkbox
and drag/keyboard reordering as other items, independently of CPU utilization.
Display item IDs are separate from the five resource worker IDs. Detail hints
identify the sensor aggregation and count; native hover text shows the current
temperature without sensor explanations. Temperature does not use utilization
warning colors.
The column keeps a fixed width and displays `—` for unavailable or expired data.

The display checkbox does not control collection. macOS samples temperature every
four seconds while resident monitoring is enabled. Windows requires explicit
consent for its optional privileged CPU collection service; once enabled,
it continues independently of panel visibility and resident display selection.
Linux omits the CPU temperature display item. Unsupported devices omit the entire
temperature section in CPU details.


### Cross-platform GPU temperature

Preference schema 13 adds a separate, default-off `gpuTemperature` display item.
Versions 1–12 retain their saved order and selections; migration appends the new
item disabled. Resource schema 17 exposes an identified `gpuTemperature` reading
and `gpuTemperatureHistory`, independent of utilization and detail visibility.
GPU usage and temperature share `gpuAdapter`; device changes clear temperature
history rather than attributing a previous GPU's samples to the new selection.

The resident GPU worker reads temperature at four-second intervals while
macOS or Windows monitoring is enabled, including when its display item or detail panel is hidden.
The display checkbox controls presentation only. Enabling GPU temperature requires
a fresh, valid reading from the selected adapter; a loading or failed observation
does not establish support. Settings show the unavailable status beside the label
and keep device selection and disabling a saved item available.
GPU and CPU cards share their
numeric, tooltip and chart presentation; unsupported temperature sections are omitted.
Transient failures preserve original timestamps and real history without adding
points or replacing missing values with zero. Values expire after ten seconds.

Driver temperature is preferred when available. Apple GPUs use generation-specific
SMC thermal-zone averages; Intel integrated GPUs use `TCGC` only when a single
Intel accelerator is identified. Arbitrary SMC prefixes and proximity sensors do
not establish GPU identity. A shared AMD `TGDD` sensor is not assigned to arbitrary
accelerators; AMD GPUs retain identified driver temperature support. Reads use
ordinary process permissions and the shared read-only SMC transport; no fan
control, helper, service or driver installation is involved.

Preference schema 14 removes the Windows display destination field. Versions 1–13
preserve metric selections, layout, and enabled state; legacy tray selections
migrate to taskbar display. A plain tray icon remains the recovery entry when
Explorer is unavailable or the taskbar has insufficient space.

Windows uses the same identified temperature contract, cache, display column and
GPU detail chart as macOS. Public WDDM adapter performance data supplies device
temperature in tenths of a degree Celsius without additional driver installation
or elevation. Adapter identity includes the physical adapter index. Unsupported
driver readings remain unsupported, native query failures remain failed, and
utilization counter failures do not stop temperature sampling. Temperature is
sampled every four seconds while resident monitoring is enabled; failed driver
queries use the existing thirty-second backoff and transition diagnostics.

### Resource detail card layout

CPU and GPU details show utilization and temperature in separate adjacent cards.
Device identity appears only in the utilization card. Both charts share typography,
padding, and chart height without axis labels or grid lines. Overview and detail
summary cards share a 104-DIP height and eight-DIP vertical card spacing. GPU facts
remain outside the scrolling memory and engine detail sections, matching CPU facts.

### macOS battery display

Preference version 20 keeps battery temperature, charging power, and battery power
display disabled by default, preserving saved selections, order, and color rules.
Battery-temperature rules use the defaults described below; power rules start
disabled and empty. Limits are 100°C and 300 W. Menu-bar power uses rounded integer watts in both modes; nonzero
readings below 1 W display as <1W and use zero as their integer color-rule value.
Tooltips retain one decimal place. Integer color thresholds compare against the
displayed, rounded watt value. Native columns reserve three integer digits; whole-system values expand only
when a rounded reading needs four digits (1000–3000 W).
Resource version 21 carries independent freshness and source for all three readings.

Battery telemetry runs on the existing CPU worker every two seconds only while
at least one battery display item is selected. Disabling all three releases its SMC
connection without stopping CPU sampling. SMC TB1T/TB2T provide the available
sensor average, with AppleSmartBattery Temperature divided by 100 as fallback.
SMC open or read failures release the connection and retry on the next scheduled
sample. Diagnostics retain the native failure and record recovery; missing sensor
keys remain distinct from connection failures.
Charging power means net power entering the battery, measured from battery
voltage times signed InstantAmperage, falling back to Amperage when unavailable.
PPBR can report discharge-rail consumption
while the pack charges, so it must not substitute for charging current. Battery
power has a typed charging/discharging/idle state. While disconnected it prefers
SMC PPBR, because pack current can remain zero for a minute after unplugging;
signed pack power is the fallback. While connected, it uses signed pack power,
never substituting discharge-rail consumption for charging current. Adapter input
and rated watts are not substitutes. Charging power reports 0 W when paused or disconnected; missing
flags or unavailable telemetry report unavailable. Values expire after five
seconds. Diagnostics record capability/source and charge-state changes plus a
periodic numeric observation, without battery identity or raw registry contents.

Native battery power headings use BAT with a separate red ↑ for discharging,
blue ↓ for charging, and IDLE for zero current without charging. Arrow colors
indicate direction independently of the value's color rules. Tooltips localize the state; stale readings
clear the state along with the value. Version 17 selections and colors migrate
without changing them, appending battery power disabled.


### macOS whole-system power display

Preference version 19 appends whole-system power disabled and preserves saved
selections, relative order, and color rules. Its color rules start disabled and
empty, use watts, and accept thresholds up to 3000 W. The new metric is visible
only on macOS and uses SYS in the native menu bar; localized tooltips name the
metric explicitly.

Whole-system power uses the same identified SMC PSTR sensor as Stats System
Total. The transport decodes both Apple Silicon floats and Intel signed sp96
fixed-point values; unsupported encodings are diagnosed separately from absent
keys. It does not require AppleSmartBattery and must not substitute adapter
ratings, battery power, or a fabricated zero when PSTR is unavailable. The
existing CPU worker reads it every two seconds only while selected; disabling it
releases its own SMC connection. Native failures reopen the connection on the
next scheduled read. Missing, failed, invalid and stale samples remain distinct;
values expire after five seconds. Diagnostics log sensor/state changes and a
bounded periodic watt observation. No private sensor dumps are persisted.


Battery presence is a separate nullable boolean in resource version 21. The
existing CPU worker checks AppleSmartBattery and BatteryInstalled every 30
seconds independently of battery display selection. A successful empty match
means absent; a registry error retains the last known state instead of hiding
controls because a sensor failed. Confirmed absence hides all three battery rows
and native columns while preserving saved selections and color rules. If no
visible metric remains, the native brand icon preserves access to settings.


Preference version 20 adds enabled battery-temperature color defaults: below
40°C green, 40–45°C orange, and at least 45°C red. Migration upgrades only the
old inactive, empty battery-temperature default; custom rules remain intact.
Current-version users can still disable or remove every rule. Charging, battery
and whole-system power defaults remain disabled and empty. Battery help actions
sit immediately after their labels, separate from color controls.


### Disk temperature and network selection

Preference and resource version 22 add `diskTemperature` without temperature
history. Migration inserts this default-off item immediately after disk usage,
preserving existing relative order, enabled flags, device selections and colors.
Disk temperature colors default to green below 50°C, orange from 50°C to below
60°C, and red at 60°C or above. These editable display presets do not represent
universal drive health limits. Saved color rules, including disabled or empty
ones, remain unchanged until the user restores defaults and saves. Disk capacity
and temperature share `diskVolume` but retain
independent results, freshness and color state. The existing disk worker collects
temperature every 30 seconds only while its display item and resident monitoring
are enabled. Switching volumes or disabling collection clears the old temperature.
Values expire after 90 seconds and unavailable observations display an em dash.

macOS resolves the selected mounted volume through the IORegistry to one physical
block device and revalidates the volume after reading. Multi-device volumes are
unsupported rather than assigning an arbitrary disk's temperature. Read-only
NVMeSMARTLib and ATA SMART interfaces are destroyed after each query. ATA reads
never enable SMART, alter autosave or run self-tests. Other monitoring tools can
hold exclusive SMART resources; native stage and error codes remain diagnostic
failures rather than triggering a different sensor.

Windows resolves volume extents to one physical disk, preferring native storage
temperature descriptors. If unavailable, an identified NVMe bus uses the SMART
health log; an ATA/SATA bus first uses the read-only storage failure-prediction
query with its metadata handle. Its full SMART sector retains checksum validation.
Unsupported or denied queries fall back to the fixed SMART READ DATA operation,
whose raw device access can require administrator permissions. Invalid native
responses fail closed instead of substituting another reading. No additional
driver is installed and collection does not automatically elevate. Unsupported
virtual, RAID and bridged devices remain unavailable. Queries are bounded, run on
the disk worker and do not block CPU/network sampling or the UI. Logs record source or failure transitions
with the volume name and native stage/code, avoiding per-sample repetition.

The network catalogue exposes connected physical Wi-Fi/Ethernet links, ordered
by default-route preference and stable name/identity. It does not filter by
instantaneous traffic. Saved manual identities remain visible across disconnects
and may still refer to a VPN. Counters retain the full native interface set;
automatic selection continues to avoid virtual double counting. On macOS,
carrier flags additionally require a non-loopback, non-link-local assigned IP,
so unused Thunderbolt and Ethernet ports do not masquerade as usable links.

## Windows WebView process recovery

`webview_recovery` listens to WebView2 `ProcessFailed` for the main window,
resident panel, and memory settings. Diagnostics retain the window label,
browser PID, native failure kind, reason, exit code, and recovery action.
Renderer exits reload the affected document. Unresponsiveness requires two
observations spanning at least fifteen seconds, with no observation gap longer
than thirty seconds. Isolated stalls receive a new grace period because WebView2
does not emit a responsive event. GPU and utility process failures
remain under WebView2's own recovery policy. Main-browser failure closes all
associated controllers before reconstructing the application's visible windows
and hidden resident panel. Closing the last broken window during this interval
does not exit the application; explicit Quit still does.

Automatic recovery is limited to two attempts per window or shared browser in
five minutes. Navigation completion confirms renderer reload; missing completion
or exhausted retries produces a localized native warning that remains usable
without Vue. Failures from several controllers share one open warning until it
is dismissed, while retaining each controller's diagnostic. Core operations and
privileged sessions are retained throughout;
recovery never reissues a destructive command. Hidden main windows are recreated
on the next foreground request, and frontend readiness is reset before revealing
a recovered main window. Follow Microsoft's [process-related event guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-related-events).

## macOS fan speed

Preference envelopes use version 25; current readings use version 28. Previous preferences retain all
saved display choices, relative order, colors, and device selections. Migration
adds fan speed disabled before a trailing network item, with automatic fan
selection. Version-23 automatic and fixed choices migrate to highest and selected
modes. Selected IDs contain one or two unique, bounded IDs sorted numerically;
missing tachometers never change the saved selection.

The platform fan reader uses the existing read-only Apple SMC connection. FNum
identifies the fan count; F0Ac through F9Ac expose actual RPM. Integer counts,
Intel unsigned fpe2 speeds, and Apple Silicon float speeds have explicit encoding
and size checks. Counts are bounded to ten, RPM to 0–30000, and malformed or
non-finite values fail closed. Zero RPM is valid. A successful zero count denotes
fanless hardware; an unavailable count remains Unsupported. Missing individual
tachometers retain their identity with no fabricated zero reading.

Sampling runs on the existing two-second CPU worker only while resident display
and fan speed are enabled. Disabling releases its independent SMC connection.
Key metadata is cached per connection; missing keys are retried, and native
failures discard the connection and metadata before the next sample. Logs record
capability/error transitions with sensor diagnostics, without per-sample RPM logs.
Core expires readings after five seconds. Highest mode uses the highest valid
RPM with deterministic fan-ID ties. Average mode includes stopped fans as zero
and excludes unreadable tachometers; tooltips report valid/total counts. Selected
mode shows one fan as a heading/value pair, or two fans as equal-height numbered
rows in a single column. Missing selections remain in their physical rows as a
dash. Display text omits RPM units. Settings enforce one or two selections, and
backend validation rejects empty, duplicate, oversized or out-of-range lists. Windows and Linux do not expose this
item. Fan speed has no trend or control interface.

Fan color conditions use RPM with configurable thresholds bounded to 30000.
The default bands are green below 2000, orange from 2000 to below 4000, and
red from 4000 upward. These are speed bands, not hardware health limits.
Version-24 and older preferences acquire only the missing default fan rule;
existing color choices are preserved. Highest and average modes color their
aggregate value; paired rows classify independently by fan ID. Missing or stale
values use the system foreground. Descending boundaries hold for 100 RPM to
avoid flicker and reset when the mode, selected fans, or rules change.


### Session network traffic

Core `system_resources::network_traffic` accumulates only valid intervals from
`NetworkDelta` for the selected interface. Unobserved gaps, source changes and
counter rollbacks never import operating-system totals. This is monitored
traffic, including LAN traffic, rather than Internet billing.

Totals are kept per interface for the current application session only. Disco
writes nothing about network traffic to disk: the per-minute `network-traffic.json`
saves and its `.lock` lease inherited from MangoDisk were removed because an
antivirus repeatedly quarantined the file, and because a stable adapter GUID with
traffic totals is unnecessary persisted data. At startup the adapter deletes those
legacy files (regular files only). Reset targets the confirmed interface and start
time and preserves the current session counters. Intervals overlapping a reset are
excluded. The adapter refreshes totals before publishing a snapshot so an in-flight
sample cannot restore pre-reset values.
