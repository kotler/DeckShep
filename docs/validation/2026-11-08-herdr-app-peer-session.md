# Herdr App peer sessions and hardware artifact

Date: 2026-11-08. The owner authorized the next three steps in this chat:
implement persistent peer verification, rebuild/test the private source artifacts
with an isolated App/core calibration, and prepare a Stream Deck test build.
This authorization did not install/restart a plugin or approve production records.

## Runtime implementation

The [design](../plans/HERDR-APP-POST-CLOSE-PEER-DESIGN.md) is implemented as
protocol 2 behind `--session`. One native helper pins the original connected FD
and retains the full kernel audit token privately. It captures before bytes,
freshly checks the still-connected peer after App build inspection, then freshly
validates the original token's process/path/start/version and dynamic signing
image after a validated reply. A missing socket token is accepted only with HUP
on the pinned valid socket; an available different token refuses. No PID/token
is accepted from the caller. The original stateless protocol remains available
for core checks and preserves its fresh-proof refusal behavior.

The parent bridge pins exact reviewed helper bytes, rejects helper/ancestor
replacement, strictly bounds/validates frames and rejects duplicate keys. It
restores an originally flowing reader at capture-ready while preserving explicit
pause. It requires a clean final helper exit. Cancellation, expiry, malformed or
surplus frames, overlap and replay dispose/reap only the owned helper. The
sender parses the App reply before finalization and keeps all existing build,
endpoint, topology, consent, press/permit and no-retry checks. Once a write may
have begun, failure remains uncertain.

Total request/press budgets stay at 1000 ms; each helper operation has at most
500 ms or the remaining budget. Native continuous-clock checks and an independent
watchdog prevent a renewed lease. No verified focus, Zoom or input grant exists.

The universal build embeds its exact signed helper SHA-256 into the production
bundle. Source execution has no default approved helper hash; calibration
supplies the reviewed manifest explicitly. No preference selects a helper.

## Native evidence

Host: arm64 macOS 27.2, Node 26.13.0, Apple Swift 6.4.2. Both native architectures
build/typecheck for macOS 13; Intel execution remains untested. App/core source
and bytes are unchanged from the [artifact record](2026-11-08-herdr-app-source-artifacts.md).
Pinned App control source was rechecked: its serving thread reads the request,
writes the reply and closes its own stream without FD delegation.

| Evidence | SHA-256 |
| --- | --- |
| New signed universal helper | `358e58767c775833ee27af88e33485f7a3a06bac8c9b5b2801228f80e0058be5` |
| New private test manifest | `36f9388bd566a8f95f4a9c16cb7b3f0fc4a994d3bee8cce4a4d59e4a13f06c10` |
| Passing calibration report | `dd21775bb90e9785e51f2904f4bbc9b091c941d270b39c2e2ad46a515951d978` |

App/core/helper signatures and universal helper architectures were checked
before launch. The App/core source builds still have no compiled updater flag;
no source App/core patch, installed release or existing agent was used.

[Sanitized reports](2026-11-08-herdr-app-peer-session.json) retain all three runs:

| Run | Result |
| --- | --- |
| Initial protocol-2 calibration | Passed the old post-close blocker; stopped in scenarios before recorded focus requests |
| Fresh calibration with source-backed welcome/version seed | Passed; two requests acknowledged, model-selected targets matched; 352.51/339.73 ms |
| Prepared hardware launcher, immediately stopped at readiness | Passed; two requests acknowledged, reached owned hold, then revoked lease and cleaned up |

Every run proved cleanup and unchanged tracked global settings. The initial
failure's last channel label is not a precise downstream exception diagnostic.
Source review identified automatic first-run welcome/release-note windows.
The harness now seeds only its fresh private home with `frame.welcomed:"test"`
as upstream window fixtures do, plus last-run version 0.1.14. It never dismisses
an observed overlay or grants DeckShep consent; overlay refusals remain intact.
The passing run observed zero overlays/floats/errors before scenarios.

The runner used only new owned App/core copies, private homes/sockets and two
disposable `/bin/cat` panes. It checked future/reused/stale/revoked presses and
kept acknowledgements separate from App-model feedback. Settings fingerprints
cover the safety helper's existing five Codex/Claude configuration/auth files,
not every macOS preference store. No installed/running service was targeted.

## Hardware artifact boundary

The [hardware guide](../HERDR-APP-HARDWARE-TEST.md) describes the private installer
and bundled launcher. Preparation executes no App/core and changes no production
records. Its test backend is substituted only into that build, accepts the exact
runner-issued App identity in a private root, and requires a fresh heartbeat
while the runner rechecks owned App/core processes/endpoints. It refuses when the
runner stops or the lease/identity changes. Focus-request consent defaults off.

The installer was locally validated/packed, contains the existing identities and
adds the reserved Herdr App profile. Normal packaging rejects its dedicated test
marker. A no-flags launcher check refused before artifact/session creation. The
authorized native launcher check reached readiness and stopped immediately,
removing the lease and private session before reporting success. No installer
was opened, no Stream Deck process restarted and no physical key was tested.

Later follow-up: the owner installed the test build and requested a runtime
update. After the [inspector/helper corrections](2026-11-08-herdr-app-inspector-refresh.md),
the owner reported the physical Terminal/Next pane walkthrough worked. That
user-reported smoke result is distinct from the automated calibration above;
production approval and instrumented keyboard-focus verification remain absent.

Production `APP_FOCUS_RECORDS` and Herdr App capabilities remain empty. This is
source-build request-only evidence; production promotion, installed releases,
multi-window/screen behavior, keyboard focus, provider binding, Zoom and typing
remain separate gates. No upstream contact, mod installation or publication occurred.

## Repository verification

- Full isolated coverage suite: **279 tests, 276 passed, 3 live groups skipped,
  0 failures**. Live flags were unset for the full suite; only the exact App test
  file and prepared launcher were used for the separately authorized native runs.
- Coverage: 94.83% lines/statements, 90.42% functions, 86.80% branches. No gate
  was lowered or excluded and no golden snapshot changed.
- Typecheck, ESLint, formatting, dependency boundaries, knip, version and
  compatibility checks passed. Dynamic hardware bundle entries are explicit
  in knip; they remain under tests and cannot enter ordinary distribution.
- Universal build, bundled subprocess tests and local production-default
  package validation/audits passed. The private hardware installer was separately
  validated/packed; its test marker was confirmed rejected by production audit.
- Native self-fixtures exercise the actual retained-token primitive and canonical
  protocol, including repeated/out-of-order commands, extra bytes, missing input,
  altered PID version, expiry, FD reuse and same-PID self-exec. Contract fixtures
  exercise the actual bridge/sender, malformed frames, cancellation, helper/image
  replacement, parser ambiguity, uncertain outcomes and cleanup.

Hardware lease tests use synthetic peers and an injected input stream; they never
inspect an App/core or real HOME. They check stale/future/changed heartbeats,
foreign App identity, private-file guards and lease removal before cleanup.
