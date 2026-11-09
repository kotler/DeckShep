# Herdr App inspector refresh correction

Date: 2026-11-08. The owner reported that Refresh status showed nothing while
the private hardware launcher was ready. Read-only metadata checks confirmed
the installed plugin was the experimental hardware build; no running App/core
or agent was connected to, inspected or restarted during this correction.

Two defects were found:

- The App inspector's status handler returned cached state. Refresh status sent
  that passive query plus a doctor request, so it could not explicitly reconnect
  or acquire new pane state after the launcher became ready. A regression fixture
  first failed because the click caused zero new App reads.
- A real-browser test of the built inspector and pinned sdpi-components library
  found `ReferenceError: exports is not defined` in `preferences.js`. The
  type-only `export {}` marker made TypeScript emit an unbound CommonJS exports
  marker inside the UMD browser helper. Removing that marker only during this
  helper's browser compilation preserves its browser global and Node behavior.

The App button now sends an explicit refresh request. The controller performs a
new guarded read, then reports success or an unavailable connection. Periodic
status queries remain passive; setup/doctor stays App-only. A changed key
appearance suppresses stale inspector replies. An ongoing refresh/request is
reported as busy. No focus request or provider action is sent by Refresh status.

The inspector immediately displays **Refreshing status…** and displays a fixed
message after three seconds if no status reply arrives. An ordinary App
connection failure is distinguished from an empty production build list.

Verification:

- Full isolated coverage: 280 tests, 277 passed, 3 live groups skipped,
  zero failures. Coverage: 94.85% lines/statements, 90.42% functions,
  86.83% branches; no thresholds/exclusions or goldens changed.
- Two real-browser tests passed with the actual bundled inspector and pinned
  library, using mocked host sockets. They cover connection, refresh routing,
  visible results, missing-reply feedback and startup without script errors.
- Typecheck and lint passed. The private test installer was validated/repacked
  for the same test root and helper hash. No live App/core tests were run.

The updated installer must be installed by the owner before physical behavior
can be confirmed. Existing installed files, consents, profiles, production
records/capabilities and the current launcher session were not changed. The
launcher retains its ten-minute lifetime; an expired session needs a fresh launch.

## Owner-requested installation

The owner subsequently requested applying the update. Preflight confirmed the
same plugin UUID/version, private hardware backend and unchanged native helper.
Only DeckShep was stopped through the pinned CLI. The three replaced runtime
files (`bin/plugin.js`, `inspector.js`, `preferences.js`) were backed up in the
account's private external DeckShep backup directory and replaced atomically.
Their installed hashes matched the validated test artifact afterward.

Config, profile contents, manifest and native helper hashes were checked
unchanged before DeckShep alone was restarted. No installer/profile reimport,
consent change, App/core connection, live test or agent restart occurred. Physical
Refresh status behavior still needs confirmation by reopening the key inspector.

## Installed helper permission diagnosis

After the owner reported the remaining connection failure, the live Stream Deck
inspector showed that status messages were arriving but its helper checklist was
unavailable. Read-only metadata inspection found the installed peer helper had
mode 0644, while the reviewed build had 0755. Its content hash still matched the
signed helper. The test launcher had a current ownership heartbeat.

The original helper/mode was backed up, then only its executable permission was
restored to 0755. Bytes, settings, profiles and consent were unchanged. The
Stream Deck UI subsequently visibly showed **2 pane(s) · App-reported status**
and **App status refreshed**. No focus key, text input, App/core launch/restart or
live calibration was performed for this diagnosis.

The Elgato-packed installer also encoded both native helpers as 0644. Packaging
now records 0755 for the two fixed helper entries, preserving their signed bytes;
the distribution audit rejects missing execute permissions. Private hardware
preparation uses the same correction. A regression independently extracts the
archive with the system unzip and checks actual file modes. Native installer
reinstallation of the corrected archive remains separate from that extraction
test; the currently installed helper was repaired directly and verified in UI.

The permissions follow-up passed the full isolated suite (281 tests: 278 passed,
3 live groups skipped) plus typecheck, lint, formatting and knip. Both architectures
rebuilt successfully. No production capability or build record was added.

## Owner-reported hardware result

On 2026-11-08, after the permission repair and visible two-pane status, the owner
was asked to test the first Terminal key, second Terminal key and Next pane on
the physical Stream Deck, watching the disposable App window between presses.
The owner replied, **“yes it worked.”** Record this as a successful user-reported
request-only hardware smoke test, separate from the automated native reports.

No exact physical request timings, instrumented keyboard-focus proof, Zoom,
typing, installed-release build, multi-window/screen behavior or complete hardware
matrix was established. `verifiedFocus:false` and empty production
records/capabilities remain unchanged. Final cleanup of the owner's manually
started launcher session has not been observed; the owner was instructed to
press Enter in that Terminal when finished.
