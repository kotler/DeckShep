# DeckShep standing instructions

Read [the refactor plan](docs/plans/REFACTOR-PLAN.md) before each refactor phase.
The baseline is plugin 1.3.4 at `0262267`, tagged `v1.3.4-pre-refactor`.

## Commands

Use Node 22.13+ (`.nvmrc` selects 22) and macOS Command Line Tools.
The installed plugin retains its existing Stream Deck Node runtime.

- `npm ci`: install the locked root workspace (`com.kotl3r.deckshep.sdPlugin`, `tools`).
- `npm test`: run every isolated `node:test` group, including the ported Node distribution checks.
- `npm run test:golden`: baseline layouts, routing, native transport traces and refusals.
- `npm run test:coverage`: c8 reports in ignored `coverage/`; baseline in `docs/plans/coverage-baseline.json`.
- `npm run typecheck`: strict TypeScript and domain contracts; no type-error suppressions.
- `npm run lint`: recommended ESLint rules, with documented legacy-only TODOs.
- `npm run format:check` / `npm run format`: format JS/TS/HTML/JSON/YAML; golden JSON stays byte-stable.
- `npm run knip`: unused-file/dependency scan; confirm findings with `rg` before removal. Dynamic CommonJS exports, VM imports, fixture lookup and icon names need manual verification.
- `npm run deck:preview`: print an owned random loopback URL for the synthetic 15-key browser deck.
- `npm run e2e:install`: one-time pinned Chromium headless-shell download; no full browser/system dependencies.
- `npm run test:e2e`: exact SVG/label/trace checks plus six deck-only visual smoke checks.
- `npm run test:e2e:update`: deliberately regenerate OS-specific smoke images; review and justify changes.
- `npm run build` (or `npm run build -- --universal`): portable Node/Swift build; never installs or restarts anything.
- `npm run clean`: delete only generated `dist/` and `coverage/`; preserve all backups.

No Python installer is required.
Do not run `scripts/install.mjs`, `streamdeck restart`, optional setup, or any live command
as a verification shortcut. Fixture tests may inspect only their own process and
create private sockets/files under a temporary directory.

## Frozen behavior and compatibility

This is a refactor, not a feature release. Retain every identity/process guard,
stale-press refusal, focus check, digest/cursor check, generation/visibility gate,
opt-in and privacy rule. Add a test before questioning a guard; do not delete it.
Golden snapshot changes require a written justification.

Never change plugin UUID `com.kotl3r.deckshep`, action UUID
`com.kotl3r.deckshep.key`, `PROFILE_IDS`/`PAGE_IDS`, per-key UUID5 ActionIDs,
`profileScope`, global-settings v2/v1 migration, or config-key semantics as a
routine refactor. The owner explicitly approved the prelaunch identity reset on
2026-11-08; the new DeckShep identities are now fixed. Older previews require
fresh profiles and explicit removal/reapplication of integrations, not silent
conversion. See docs/IDENTITY.md. Same-identity upgrades preserve settings.
The owner approved profile labels Rex / Herdr. On 2026-11-10 the owner limited the
first release to the Rex profile: default/release builds package only
`RELEASE_BACKENDS` (`scripts/profiles.mjs`), and Herdr TUI/App stay in source
behind `experimental.herdr` / `experimental.herdrApp` (both default false; package
audits refuse either). Do not delete Herdr code or tests. Keep their existing UUIDs and key
identities after this reset; product branding is DeckShep. The owner selected Apache-2.0 with
NOTICE for the software. The DeckShep name and original key-and-crook branding
are reserved and forks must rename; see TRADEMARKS.md. Pinned LobeHub provider
SVGs retain their MIT code license. OpenAI/Anthropic trademark permission remains
pending; do not infer clearance or permission to publish from these decisions.

Fresh clipboard/visible-pane consent, Herdr title identity, Claude native controls
and Claude hooks stay off. Fewer setup steps never imply consent. Hook paths
must stay stable or have an explicitly tested migration/removal path.

Never start, stop, restart, attach to or send input to a developer's existing Rex,
Herdr, Codex daemon or agent. Never run live tests without `ASW_LIVE=1` **and**
explicit current authorization. Rex additionally needs `ASW_LIVE_REX=1` and PID
ownership proof. Live scenarios must use isolated temporary sockets/repos,
test-owned PIDs, and before/after global-settings hashes; never run them in CI.
Historical validation logs are evidence, not permission to reuse scratch agents.

Keep prompts, transcripts, tokens and home/workspace paths out of logs, errors
and distributed artifacts. Key errors are at most 15 characters; inspector
messages at most 160. Keep the package privacy/path/default/version audits.

## Architecture being implemented

Terminal backends (`rex`, `herdr-tui`, future `herdr-app`) own discovery, topology,
native focus, Zoom, reads and delivery. Providers (`codex`, `claude-code`) own
identity, state and control semantics. Only the app composes both axes. Controls
need the intersection of provider support and verified backend capabilities;
Herdr TUI has no verified composer cursor.

Target layers: `src/domain` imports nothing; `src/guards` imports only domain;
agents and terminals use domain/guard interfaces rather than concrete imports
across axes; `src/app` composes them; only `src/plugin` imports the Stream Deck SDK.
Move legacy families incrementally. Input must eventually flow through one
explicit guarded `deliver()` with a single-use token, preserving all native
preflights and no-retry semantics. Do not prematurely remove the legacy guards.

## Working conventions

One phase per PR or short PR series; keep every checkpoint mergeable. The
foundation branch is `refactor/v2-foundation`; use `refactor/<phase>-<topic>` for
follow-up phase branches. Never mix formatting, moves and logic in one commit.
Use Conventional Commits (`refactor:`, `test:`, `build:`, `docs:`, `ci:`, etc.).
Do not introduce old history when updating this checkout.

PRs state phase/scope, behavior change (normally none), golden changes and why,
tests/coverage delta, documentation and follow-ups/open questions. Do not merge
to main, push, publish, choose a license/artwork policy or change display names
without owner direction. Record uncertain native behavior and continue work
that does not depend on it; verify against existing evidence or ask the owner.

Use named functions, descriptive variables and comments explaining why guards
exist. Target functions under about 60 lines and moved files under about 400.
Maintain these instructions as commands and architecture evolve.

## Completed foundation tooling

Application source is now TypeScript under `src/`; root plugin JavaScript entries
are generated. `npm run build -- --universal` uses Node + Swift and bundles the
SDK, hook, configure helper, inspector and doctor. No Python or node_modules ships.
`npm run package` validates/packs/audits locally and never installs or uploads.
`node scripts/package.mjs --verify <zip>` verifies an existing distribution.

Use `npm run deps`, `npm run version:check`, `npm run compatibility:check`, and
`npm run test:bundled` with lint/typecheck/coverage. Only the SDK adapter and CLI
entry wrappers are excluded from c8's source gate; the subprocess fake-host test
covers the adapter independently. Do not lower thresholds to hide a regression.
Knip's explicit entries include dynamic Rollup hook/SDK-log/fixture substitutions.

`node scripts/migrate-upgrade.mjs backup` and `restore <backup> [--apply]` provide
the same-identity external backup/native-installer migration path. They do not
convert old preview identities or integration paths. Restore previews by
default and keeps a pre-restore recovery backup. Never run them against real HOME
as verification. `node scripts/install.mjs` retains the stopped-Stream-Deck
backup/config merge as an upgrade fallback. Do not run it as verification. Native installer preservation
of customized plugin-folder state has not been established. `npm run dev` links
and restarts this plugin UUID only, and is never part of automated verification.

Herdr App's production capabilities remain empty. Experimental v3 preferences
and its preview profile require the explicitly enabled config flag; default
builds retain v2 and the Rex profile. Read ADR 0004 before changing this.
The read-only App/core clients in `src/terminals/herdr-app/transport.ts` are not
wired into production discovery. The one exception is `AppCoreStatusReader`
(`core-status.ts`): with the separate read-back consent and an explicit core
socket, its bracketed `terminal.list` supplies display-only key labels. A label
applies only to one live local address whose App/core status and app words
agree; it never becomes a target, permit, PID or provider identity. They use plain JSON lines, enumerate reads,
and forbid history reads, attachments and mutations. Their tests create only
private temporary fake sockets. See ADR 0007 for the unresolved focus/Zoom
read-back and native isolation requirements; a passing transport fixture does
not verify an App/core build or grant a control capability.
Herdr App verified-focus, Zoom and provider-input paths require a verified control ID and the
exact record key captured by the press. Keep the checks in mapping, provider
dispatch, the delivery kernel, permit consumption and the backend. Local deck
navigation never grants native authority. Existing Rex/Herdr TUI engines retain
their native guards and exact golden behavior.
The owner amended this on 2026-11-08 for **daemon-only Codex controls** and
**read-only discovery**. Without an approved App record, `AppSelectionReader`
may list App panes and agent/Next keys select locally only. Model, Effort and
Reviewer (`src/app/herdr-app-codex.ts`) need App input consent, read-back
consent, an explicit core socket, `daemonControls`, and a deck/App-selected
pane both App and core report as a ready Codex pane. They bind through core
`foreground` facts plus the existing title-identity recipe, re-bind at every
DaemonControls check, and make exactly one `thread/settings/update` per press
after a fresh stale-press/consent guard. They never send keys. Blocked panes
show "Answer in Herdr". Interrupt, approvals, questions, Zoom and any
`terminal.keys`/`terminal.interrupt` use stay unavailable; this amendment does
not cover them or relax the focus-request record requirement.
The owner amended Herdr App's first release on 2026-11-08 to discovery/status
and plain focus requests (including Next), with local banks/Collapse. No Zoom,
contextual input or mod installation. Implement a separate request-only control;
do not weaken the verified-focus/input path or invent process identity from App
pane records. Exact App build/action, endpoint/target identity, consent and stale
press guards still apply. This scope approval grants no native-test permission
or production capability; see H1/H4 in docs/plans/HERDR-APP-PLAN.md.
`AppSelectionReader` brackets `ls` with `status` reads and returns
App-model selection only (`verifiedFocus:false`), with a 1,000 ms total budget.
Its pane references contain no fabricated PID/chat/core identity and grant no
delivery authority. Keep selection feedback distinct from native focus proof.
`GuardedAppFocusSender` accepts only `requestFocus` and a
separate single-use `AppFocusPermit`. It requires an explicit App home, exact
request-build record, socket-bound peer proof, fresh local topology and explicit
request consent in its supplied current state. It never grants verified focus
or provider input authority. The dedicated experimental `HerdrAppController`
routes selection/Next and local banks/Collapse without provider/legacy dispatch.
`APP_FOCUS_RECORDS` stays empty, so no production setting can activate a sender.
Preserve the read-only
transport's mutation refusals and all existing verified-control guards.
The new native peer probe inspects only inherited descriptor 3, using the macOS
audit token, PID version/start identity and dynamically validated signing CDHash.
It launches/connects to nothing and sends no socket bytes. It is packaged at
the fixed plugin-owned `bin/herdr-app-peer` path, with both architectures checked
for universal packages. Preferences cannot select a different helper. Contract tests may compile/sign a temporary
fixture that inspects only itself; this grants no live App/core authorization.
Passing a socket to the peer helper as stdio pauses Node's reader. The one-shot
probe restores an originally flowing reader after helper exit; protocol-2
sessions restore at capture-ready while the helper stays alive. Preserve explicit
pause. A session retains the original kernel token privately, freshly revalidates
its image after the reply, pins reviewed helper bytes and burns on any failure.
Never replace these checks with a cached PID/verdict or renew request budgets.
The original native blocker and the later passing source calibration are recorded
in `docs/validation/2026-11-08-herdr-app-peer-session.md`. That evidence approves
no production build or native-focus/input capability.
The private hardware preparer under `tests/live/app-calibration/` substitutes a
test-only backend and keeps production records empty. Its runner-owned peer lease
needs a fresh ownership heartbeat; no normal config/env knob selects it. Package
audits reject the hardware test marker. Preparation never installs/restarts a
plugin. See `docs/HERDR-APP-HARDWARE-TEST.md`; native/hardware runs still require
current explicit authorization and the live flags.
The test-only App calibration harness is under `tests/live/app-calibration/`.
It additionally requires `ASW_LIVE_HERDR_APP=1` and separately authorized source
artifacts; invoke only `tests/live/herdr-app.test.js` for that calibration.
It never approves production records. Its fixture tests inject process/peer
effects and use private in-process sockets; they never launch an App/core.
See `tests/live/APP-CALIBRATION.md` for artifact attestations and remaining gates.
With the experimental flag on, v3 has an independent App home/core socket,
read-back consent, separate focus-request consent, input consent and Claude-control
opt-in. All App consents default off; older v3 stores also gain no request consent.
Rollback drops only the App profile. App consent revocation must bypass the
ordinary event queue and invalidate pending requests immediately. App-reported
status and local deck selection never imply keyboard focus. Setup/doctor reporting
is passive and App-only; it must not inherit Rex/TUI discovery, provider metadata
readers or integration setup. Default builds still use v2 and only the Rex profile.

## DeckShep maintenance

The repository is `kotler/DeckShep`. The software uses Apache-2.0 with NOTICE;
DeckShep branding is reserved. Keep repository visibility unchanged without owner
direction. Use `codex/` feature branches and keep claims tied to actual validation.
`npm run marketplace:media` renders synthetic examples only and never connects to
agents; resvg is development-only.

Public packaging uses `--release`, clean provenance and exact-version evidence
through `npm run release:check`. Stable tags cannot use the private-review path;
the workflow creates drafts only. Never mark pending evidence verified. Public
Issues and an active support email require owner confirmation. Keep rejected
placeholders until confirmed; never publish the owner's personal email. Use
private vulnerability reporting once enabled by the owner. Provider trademark
permission remains pending even when provenance passes.

Push, merge and release operations require owner direction. Do not enable
services, change visibility, submit listings or contact maintainers without the
corresponding explicit instruction. Marketplace AI disclosure and eligibility
still need owner review. Do not purchase email plans, change DNS, send requests
or accept Maker agreements without explicit owner instruction. Runtime hardening
belongs in a separately reviewed change; do not weaken existing guards.

## Virtual deck verification

The virtual host bundles fixtures only; its child receives a private temporary
HOME and no agent routing/auth environment. It never needs the Swift build.
Time advances explicitly; animation is disabled. Keep e2e imports under tests
and tools, never src, and preserve the production-bundle/package fixture audits.
Playwright is exactly pinned in the tools workspace. `e2e:install` fetches the
pinned headless shell plus standard FFmpeg from Playwright's CDN, outside npm's
lock-file integrity verification. The cache is `~/Library/Caches/ms-playwright`
on macOS (`~/.cache/ms-playwright` on Linux), outside the repository. Never add a
browser download to npm ci, build or package. Never ship tests, reports, browser
cache or fixture identifiers. Remove cached browsers with
`node scripts/tool.mjs @playwright/test uninstall` (or `npx playwright uninstall`
from tools). No live authorization is implied by fixture/browser testing.
See tests/e2e/README.md for control API, clock, baseline policy and native/hardware
limits. CI uses a macOS 15 browser job, version/OS/architecture-specific caching
and failure reports. An Ubuntu 24.04 trial passed both browser runs, but all six
PNG baselines differed, so macOS remains the CI platform. See the validation record.

The separate signed-release calibration runner additionally requires
`ASW_LIVE_HERDR_APP_RELEASE=1` and current authorization for its exact artifacts.
It validates whole signed bundles, synthetic Seatbelt containment and a bounded
current-version-only feed before launching owned copies. Its cat-only shell shim
interprets no shell text. See tests/live/APP-CALIBRATION.md and the signed release
validation record. The private release preview is a separate owner-approved,
test factory without a calendar cutoff carrying the distribution-denied hardware marker; normal
records stay empty. Historical live-session exceptions are narrow and do not
amend the standing no-attach rule or authorize future runs.

The owner separately approved the macOS `/Applications` container exception on
2026-11-08: canonical path only, root UID 0/admin GID 80, mode 0775, no positive
ACL grants (only no ACL or standard everyone-deny-delete). Bundle/file guards
stay strict. Preserve GID and the exceptional container's ACL-sensitive metadata
stamp, exact hashes/signatures, original peer token and all press/consent checks.
This does not permit other shared-writable ancestors or weaken endpoint privacy.
The owner's App home/socket were explicitly tightened to 0700 for the private
walkthrough; a future socket recreated with broader mode must still refuse.
herdr-core creates its socket 0755 inside an owner-only folder. The owner
approved on 2026-11-08 that, for the core socket only, an owned 0700 parent
suffices (group/world-writable sockets still refuse). App sockets stay strict.
