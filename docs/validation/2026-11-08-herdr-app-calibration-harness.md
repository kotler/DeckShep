# Herdr App calibration harness: fixture validation

Date: 2026-11-08. Checkpoint 2d, based on merged controller checkpoint `9badfea`.
Owner scope: build the testing harness; no native execution is authorized by
this implementation request. See the [operator guide](../../tests/live/APP-CALIBRATION.md).

## Implemented

- A test-only driver in `tests/live/herdr-app.test.js`, with reusable artifact,
  isolation, channel, scenario and lifecycle modules under `app-calibration/`.
- The existing live authorization gate plus `ASW_LIVE_HERDR_APP=1`. CI refuses;
  missing opt-ins skip before artifact/settings reads, process inspection or
  sockets. The guide invokes only this driver, avoiding other live suites.
- Exact source pins, reviewed source-no-updater attestation, executable/plist/
  bundle/helper hashes and architecture-specific App/core CDHashes. The template
  contains invalid `PENDING` placeholders. Artifacts are copied into a fresh
  private root; no installed App or guessed binary is executed.
- Private HOME, XDG directories, App home, session and core/holder endpoints,
  fixed core selection and scrubbed environment. Core starts directly before
  App; `HC_LAUNCHD_DIRECT` is scoped to the core launch. Both socket paths and
  owned process identities are checked; kernel peers are verified on connected
  descriptors before request bytes. No LaunchServices or existing-window handoff.
- Two fixed local `/bin/cat` spaces as setup; no configurable action/input or
  provider launcher. Focus requests use the real production authority, verifier
  and guarded sender with a manifest-supplied test record. Production records
  are neither imported as authorization nor populated by observed evidence.
- A 350 ms arming wait, existing 1,000 ms delivery budget, 3,000 ms setup exchange
  and 10,000 ms readiness bounds. Request acknowledgement and model selection
  are separate observations. Timeout after dispatch is uncertain, with no retry
  or compensation. Reused/stale/revoked permits must refuse before peer I/O.
- SIGINT/SIGTERM and test cancellation enter bounded cleanup. Descendant start
  identities are captured while parent ownership still holds. Unexpected parent
  exit, an unproven launch or failed shutdown cannot claim cleanup or delete the
  private root. Global Codex/Claude settings/auth fingerprints are compared on
  failure paths as well as success. This does not fingerprint every macOS store.
- Reports retain only fixed phases, source/build/helper hashes, hashed core
  method/feature inventories, timing and boolean observations. They contain no
  paths, PIDs, core/pane IDs, terminal text, credentials or raw exceptions. Every
  report has `productionApproved:false`; focus remains unverified.

## Verification

Eighteen new ordinary tests use synthetic artifacts, injected process/peer effects
and private in-process sockets. They launch/inspect no native App/core and read
no real HOME. Coverage includes the full lifecycle, no-consent/CI gates, artifact
links/permissions/hashes, endpoint replacement, unsafe modes, peer UID/PID/start/
signature/executable changes, core/schema/command failures, unchanged model
selection after acknowledgement, stale/reused/revoked requests, timeout/no retry,
cancellation, privacy, settings changes, unproven launch and ownership-loss cleanup.

- Final `npm run test:coverage`: **252 tests; 249 passed, 3 live groups skipped,
  0 failures**. Every live authorization/opt-in variable was removed for the run.
- Source coverage: **94.76% lines/statements, 90.10% functions, 86.70% branches**.
  Lines/functions are unchanged from checkpoint 2c; branches increased 0.01
  percentage points. Thresholds and exclusions are unchanged.
- Final focused harness run: 18 fixture tests passed; native App driver skipped.
- Lint, strict source/e2e typecheck, dependency boundaries, Knip, formatting,
  version/compatibility checks and `git diff --check` passed.
- `npm run package -- --skip-build` passed validation/packing/auditing using the
  existing universal runtime build. No runtime/native/build script changed, so
  no new production build was needed. No harness, test artifact or report ships.
- Existing golden fixtures, browser baselines, production records/capabilities,
  identities, defaults and consent semantics are unchanged. Browser tests were
  not rerun because this checkpoint changes only tests and documentation.

The existing Swift peer self-fixture still compiles/signs and examines only its
own process/private socket during the ordinary suite. This is not native App
validation. No App/core/Rex/agent was launched, inspected or contacted. Nothing
was installed, restarted, linked, uploaded or pushed for this checkpoint.

## Pending native evidence

Source provenance and the no-updater attestation need human review before a
separately authorized disposable GUI run. The harness does not establish its
native isolation assumptions merely by existing or passing fixtures. Its first
run covers two local spaces; native window/screen, restart/reconnect, dialogs,
hidden/minimized/full-screen behavior, release updater isolation, physical deck
and clean-Mac checks remain. A source-build result cannot approve a different
release binary. App/core terminal binding, keyboard ownership, Zoom, provider
input and mods remain outside this checkpoint. `APP_FOCUS_RECORDS` stays empty
and Herdr App production capabilities stay empty.
