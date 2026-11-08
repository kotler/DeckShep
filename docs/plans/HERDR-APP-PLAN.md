# Herdr App (desktop) as the primary first-release backend

Status: approved hand-off, 2026-11-08. The owner accepted every recommended
decision in section 2 on 2026-11-08. Owner direction: Herdr App, the desktop
app, is the main use case for DeckShep's first public release. Rex stays
supported as beta; Herdr TUI stays as is.

Implementation checkpoint, 2026-11-08: Phase 0's source review is recorded in
[ADR 0007](../adr/0007-herdr-app-0.1.14-source-review.md), pending owner review
before Phase 1. No native run or production capability has been enabled.
The exact running core build remains unestablished; the App does not bundle
core. The ordinary control socket does not expose the full focus/Zoom
read-back required by Milestone 1. `terminal.peek` opens an overlay, so it
cannot be used as a passive read. Those source findings qualify the proposed
API steps below; see the ADR's hand-back and native questions.

Read `AGENTS.md` and [ADR 0004](../adr/0004-herdr-app-backend.md) first. Every
safety rule applies. In particular: never connect to, focus, zoom, read from or
send input to the developer's running Herdr App or its agents. Live work uses
only an isolated app home, test-owned processes, `ASW_LIVE=1` and explicit
current authorization. Never change plugin/action UUIDs, profile/page IDs,
key ActionIDs or consent defaults.

## 1. Starting point

- `src/terminals/herdr-app/backend.ts` is a read-only skeleton: no production
  transport, discovery only for the exact `fixture:herdr-app:0.1.13` version,
  every input refused. `tests/contract/herdr-app.test.js` covers it.
- The `experimental.herdrApp` config flag (default false) adds a hidden
  preview profile with inactive keys. Its profile/page IDs are already reserved
  in `scripts/profiles.mjs`. Preferences v3 (`src/app/experimental-preferences.ts`)
  migrates from v1/v2 and has a tested `rollbackV2`.
- ADR 0004 inspected herdr-app source at 0.1.13. **The installed app is now
  0.1.14** (`dev.herdr.app`), so the source review is already one version old.
- Source surfaces from ADR 0004: a per-home `herdr-app.sock` control socket
  (`ls`, `status`, `do`, `commands`), App actions `agent.focus`, `pane.focus`,
  `pane.zoom`, `terminal.peek`, and herdr-core JSON-RPC 2.0 (hello with
  generation/version/features, terminal list/input/read, event subscriptions).
- The App binary references `HERDR_APP_HOME` (and `HERDR_CORE_DIRS`). This
  may relocate the App's control socket, but **it is not established that it
  isolates herdr-core**, which ADR 0004 records as a separate endpoint. Until
  Phase 0 proves otherwise, assume a test App could attach to the developer's
  running core.
- The v3 preferences codec does not support Herdr App settings yet: the
  `herdr-app` profile accepts only an empty object, and `preferenceCodec`
  routes `profileConfig`/`update` through `rollbackV2` and the v2
  implementation, which does not know the `herdr-app` scope.
- The App supports remote machines ("Add machine"). The first release covers
  **This computer only**.
- The controller's delivery kernel (`src/app/delivery.ts`) still parses legacy
  Rex/Herdr TUI commands. Herdr App should be the first backend built directly
  on the guarded `deliver()` with single-use permits, not on legacy argv.

## 2. Owner decisions (confirmed 2026-11-08)

All six are confirmed as written. H3 is the owner's approval of the
"Herdr App" display name. H6 is an owner action that has not happened yet;
do not contact anyone, and do not wait on it.

| # | Decision | Confirmed |
| --- | --- | --- |
| H1 | First-release scope | **Release gate = Milestone 1** (discovery, status, verified selection, Zoom, banks/Next/Collapse). **Milestone 2** (native keys for questions, approvals, Interrupt, Model/Effort) ships only if its validation passes in time; otherwise it follows in 1.x. Staged Send/Steer/Queue stay unavailable unless the App exposes a verified composer cursor |
| H2 | Default profile | Herdr App becomes the first and recommended profile for new installs. Existing Rex/Herdr profiles stay, with the same IDs |
| H3 | Profile label | "Herdr App" (already reserved). Keep "Herdr" for the TUI |
| H4 | Version policy | Read-only capabilities (discovery/status) accept versions that pass the hello/feature check and strict schema validation on **both** the App and core. Focus, Zoom and input require an exact match against a **verification record** (section 2.1) |
| H5 | Preferences | Graduate v3 out of the experimental flag in this release, with v1/v2 → v3 migration and the v2 rollback kept tested |
| H6 | Upstream contact | Ask Herdr maintainers for a stable focus/identity and composer API, or for guidance on a Herdr mod. Owner only |

### 2.1 Verification records (H4)

The backend combines App actions with a separately versioned core protocol, so
an App version alone cannot be the allowlist key. Each record, stored as data
(for example `src/terminals/herdr-app/verified.ts`) and rendered into the
generated `docs/COMPATIBILITY.md`, contains:

- App version and build identifier
- core version, protocol version and the exact advertised feature set
- the capabilities and the individual controls actually validated (for
  example `focus`, `zoom`, `questionPrev`, `questionNext`; see Phase 1a),
  never "all"
- a link to the dated validation record in `docs/validation/`

A mutating capability is granted only when the live App **and** core tuple
match one record exactly, and only for the capabilities that record lists.
Any mismatch on either side leaves read-only capabilities (if their schema
checks pass) and removes everything else. Fixtures must cover: App changed
with core unchanged, core changed with App unchanged, a feature added or
removed, a known App paired with an unknown core and the reverse, and a
version change during a connection (generation bump and refusal).

## 3. Milestones and phases

### Phase 0: Refresh the source review (docs only)

1. Pin herdr-app and herdr-core commits matching the installed 0.1.14 release.
   Re-read `src/control.rs`, `src/commands.rs`, `src/window.rs`, `src/mods.rs`
   and core's `schema/` / `hc.openrpc.json`. Do not run or connect to the app.
2. Add a dated ADR 0004 revision (or ADR 0007) recording, per method: request
   and response shapes, focus authority (App window vs core terminal), how
   foreground PID/argv and agent status appear, event streams, reconnect and
   generation behavior, remote-machine records, and what changed since 0.1.13.
3. **Trace isolation from source.** Record how the App resolves its control
   socket and its core endpoint (`HERDR_APP_HOME`, `HERDR_CORE_DIRS`, XDG and
   default paths), whether it starts its own core or attaches to an existing
   one, and its single-instance behavior (second launch, existing window,
   URL/IPC handoff). Deliver either a concrete isolation recipe that gives a
   test App its own App socket **and** its own core, or a finding that this is
   not possible. If it is not possible, no live Herdr App test runs until the
   owner decides how to proceed.
4. Record how the App and core report version, build and features, as inputs to
   the verification records (section 2.1).
5. List open questions that only native validation can answer (see section 5).

### Phase 1: Transport and fixtures (read-only)

1. `src/terminals/herdr-app/transport.ts`: control-socket and core JSON-RPC
   clients. Resolve the socket from the App home (default and `HERDR_APP_HOME`),
   refuse symlinks, require the current user as owner and private permissions,
   bound line/frame sizes, add timeouts, and never log payloads.
2. Zod schemas in `src/schemas` for every message used (ADR 0006).
3. Synthetic fixtures for 0.1.14 under `tests/fixtures/backends/herdr-app/`
   (shapes only; no real titles, paths, prompts or PIDs), including malformed,
   oversize, version-changed, reconnecting and remote-machine cases.
4. Contract tests against a fake socket server in a temp directory.

### Phase 1a: Per-control verification gates

Today every control except Zoom requires the same `sendKeys` capability
(`src/domain/capabilities.ts`), so a record could not validate question keys
without also enabling Interrupt, Model and Effort. Add a per-control layer
without changing Rex or Herdr TUI behavior:

1. Backends report a set of verified controls alongside capabilities. For Herdr
   App it comes from the matching verification record (section 2.1), using
   control IDs (for example `questionPrev`, `questionNext`, `approvalUp`,
   `approvalDown`, `approvalConfirm`, `approvalEscape`, `interrupt`, `model`,
   `effort`, `zoom`). Rex and Herdr TUI report all their currently supported
   controls, so their layouts and golden JSON stay byte-identical.
2. A control is available only if its capability requirements **and** its
   verified-control entry are both present.
3. Enforce it at **rendering** (`C.layout` and the controller's mapping,
   including custom key overrides in `k.settings.action`, which bypass the
   layout today) and again at **delivery**: the press context and the input
   action carry the control ID, and the delivery kernel refuses before issuing a
   permit when that control is not verified for the current record. A
   rendered key never authorizes input on its own.
4. Tests: a record that validates only question navigation renders inactive
   keys for approval Confirm/Esc, Model, Effort and Interrupt, and the delivery
   kernel refuses each of them, including via custom key overrides and presses
   captured before a record change. Rex and Herdr TUI golden layouts are
   unchanged.

### Phase 1b: Herdr App preferences and consent (before any panel wiring)

1. Define the `herdr-app` profile settings in v3: the App consent fields that
   focus checks and (later) input need, each defaulting to false, plus any App
   home selection. Add Zod schemas for them.
2. Give v3 a native codec for the `herdr-app` scope: `profileConfig` and
   `update` handle it directly instead of going through `rollbackV2` and the v2
   implementation. Rex and Herdr scopes keep their current behavior.
3. Profile routing: `profileScope: 'herdr-app'` reaches the Herdr App
   controller, and only it.
4. Migration tests: v1/v2 → v3 keeps every existing Rex and Herdr opt-in
   exactly and grants **no** Herdr App consent; v3 round-trips; `rollbackV2`
   drops App settings without touching others; a corrupt or unknown App
   profile fails closed; with the flag off, the v2 wire shape stays
   byte-identical.
5. Phase 4's graduation then only changes defaults; it does not introduce the
   settings model.

### Phase 2: Milestone 1 (discovery, status, selection, Zoom)

1. Map core terminals to `AgentSnapshot`: local machine only; provider from
   foreground process (Codex, Claude Code), project from cwd basename; status
   from agent status/labels, cross-checked with the providers' own state
   (Codex daemon, Claude hooks) where available.
2. Subscribe to events instead of polling where the API allows. Any reconnect,
   generation change or version change bumps the backend generation and
   invalidates captured presses (existing guard rules).
3. **Focus** through the App action, followed by a read-back of the App's
   focused view. A press that cannot be proven to have focused the right
   terminal reports a refusal and is never retried.
   Phase 0 found that this view is an in-process mod snapshot, not the ordinary
   socket response. Resolve the read-back surface in ADR 0007 before enabling
   Focus or Zoom; neither `{ok:true}` nor saved view files replace it.
4. **Zoom is verified separately from focus**, because focus can stay correct
   while Zoom does nothing or changes a different screen:
   - before mutation: resolve the target's window, screen and pane from the App;
     require that screen's focused pane to be the target, and record that
     screen's current layout and zoom state
   - mutate only that screen's pane
   - after mutation: confirm the expected zoom state on the target screen and
     pane, and that other screens' layouts are unchanged
   - any mismatch reports a refusal; no retry and no automatic compensating
     action
   - tests: a Zoom → un-Zoom round trip restores the original split layout
     exactly; a target on screen B while screen A is focused is refused before
     mutation; a Zoom reported on the wrong screen fails the post-check; a
     no-op Zoom (state unchanged) fails the post-check
5. Wire it in: `config.backend: 'herdr-app'`, a backend factory in the
   controller, the delivery kernel using `HerdrAppBackend` via permits (no
   legacy argv), and capability-gated layouts, so unsupported controls render
   as inactive.
6. Setup panel: detect the App and its socket, show version and verification
   status, and require explicit consent where focus checks need it. Fresh-install
   defaults stay off.
7. Tests: unit and contract tests, golden layouts for a new Herdr App profile
   (new golden entries need justification; existing golden JSON unchanged),
   refusal tests (stale press, version change, reconnect, remote record, focus
   mismatch), and Herdr App scenarios in the virtual deck plan.

### Phase 3: Milestone 2 (native keys), behind its own gate

1. Input through core terminal input, addressed by terminal ID, gated on: exact
   verified version (H4), foreground PID and start-time match, provider identity
   (Codex daemon session or Claude hook record), verified App focus, and a fresh
   passive `terminal.read` with explicit `lines:0` and a complete screen result
   showing the expected native UI. `terminal.peek` opens an overlay and is not
   a read. The input-method design must also resolve the queued-write/timeout
   hazards recorded in ADR 0007 before any native key is enabled.
2. Controls: question/approval navigation and Confirm/Esc, Interrupt, Model and
   Effort cycles, the same set Herdr TUI supports today. Every existing
   provider guard applies unchanged.
3. Staged Send, Steer and Queue stay unavailable; the Prompts page shows
   "Use Herdr keyboard", as in the TUI.
4. One disposable, authorized live suite (`tests/live/herdr-app.test.js`),
   never in CI, built on the existing helpers: `authorization` and
   `settingsHashes` (`tests/live/safety.cjs`), `isolatedEnvironment`
   (`tests/live/environment.cjs`) and `OwnedProcesses`. It uses Phase 0's
   isolation recipe and must:
   - before every connection, verify that the App socket **and** the core
     endpoint belong to processes the test started (peer PID and start time
     in the `OwnedProcesses` tree, socket path inside the test directory)
   - refuse, rather than fall back to, default or production endpoints
     whenever an override is missing, rejected or ambiguous
   - abort before any request if a non-test App or core is the endpoint
   Before/after settings hashes stay as a damage check afterward; they are not
   the isolation mechanism.

### Phase 4: Product promotion

1. Remove the experimental build flag for Herdr App; make the profile part of
   default builds (H2/H3). Preferences v3 by default (H5), with migration and
   rollback tests from every earlier shape.
2. Docs: README controls/support tables, `docs/HERDR-APP.md` setup guide,
   `docs/COMPATIBILITY.md` (generated), `docs/PROFILES.md`, release notes, the
   Marketplace draft and media (Herdr App first), and `AGENTS.md`.
3. Update the distribution plan's support matrix: Herdr App is the advertised
   main path. Rex is listed as beta; Herdr TUI as experimental.

### Phase 5: Release validation

Add Herdr App items to `docs/BETA-CHECKLIST.md`, and run them only with
authorization, using Phase 0's isolation recipe (separate App socket and core,
endpoint ownership checked as in Phase 3) and a physical MK.2:

- discovery, status changes, banks and Collapse with Codex and Claude agents
- focus and Zoom proof across multiple windows/screens, minimized, hidden and
  full-screen windows, and App restart/reconnect
- Milestone 2 controls (if in scope), including refusals after a dialog changes
- App update while the plugin runs (version-change refusal)
- fresh install on a clean Mac, defaults off, upgrade from the previous build

## 4. Out of scope for the first release

Remote machines, composer-dependent controls without a verified cursor,
automatic acceptance of approvals or permission-mode changes, and any change to
Rex or Herdr TUI behavior beyond shared code moved by this work.

## 5. Risks and open questions

- **Version churn.** Herdr App is pre-1.0 and auto-updates (0.1.13 → 0.1.14
  already). H4 keeps read-only features working across updates; focus and input
  will turn off after each update until re-verified. Plan a re-verification
  routine per App release.
- **Two focus authorities.** App window focus and core terminal state are
  separate; screens have independent focus and zoom. Proof of focus must come
  from the App, not core alone.
- **Identity.** An initial PID is not proof of the current agent or chat.
  Foreground PID/start time plus provider identity are required for input.
- **Upstream support.** A Herdr mod or a stable focus/composer API could replace
  the riskiest inference (H6).

## 6. Hand-back

One phase per PR on `codex/herdr-app-<topic>` branches. Stop after Phase 0 for
owner review of the refreshed API findings, and again before any live run.
Report commits, check results, new tests and golden entries, and every native
question still open.
