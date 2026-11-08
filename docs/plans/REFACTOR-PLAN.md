> Historical foundation plan. The owner approved a prelaunch identity reset on
> 2026-11-08. Its old UUID/path freeze is superseded by [the current DeckShep
> identity contract](../IDENTITY.md); all safety and consent rules still apply.

# Agent Switchboard refactor plan (v2 foundation)

**Audience:** the implementing agent (Codex) and the human reviewer.
**Baseline:** branch `codex/claude-mixed-agent-support` at `0262267` (plugin 1.3.4). The full suite (36 JS groups plus eight Python distribution tests) passes at this baseline.
**Outcome:** the same product behavior, in a codebase that is readable, typed, layered and CI-tested, installs from one file, and has a clean extension point for a **Herdr App (desktop) backend**.

---

## 0. Ground rules for the implementer

Read this section before every phase.

1. **Behavior is frozen. Safety guards are the product.** This is a refactor, not a feature release. Every input-safety check that exists today must exist afterward, with a test that proves it: identity and process checks, stale-press refusal, focus verification, Send digest/cursor checks, generation/visibility checks, opt-in gates and privacy rules. Never remove, weaken or "simplify away" a guard. If one looks redundant, add a test that shows it and raise it in the PR description; do not delete it.
2. **Compatibility is frozen.** Keep these unchanged:
   - plugin UUID `com.local.rexagents`
   - action UUID `com.local.rexagents.key`
   - the Rex and Herdr profile IDs in `build.py` (`PROFILE_IDS`, `PAGE_IDS`)
   - the `profileScope` key setting
   - the global-settings v2 schema and its v1 migration (`preferences.js`)
   - the meaning of every `config.json` key, and the per-key `ActionID` UUID5 scheme

   Existing installs must upgrade in place with their keys, profiles and preferences intact. Any rename of a user-visible name (for example manifest `Name: "Rex Agents"` → "Agent Switchboard") is an **owner decision**: propose it, don't do it.
3. **Defaults are frozen.** Every opt-in stays off on a fresh install: clipboard/visible-pane consent, Herdr title identity, Claude native controls and Claude hooks. "Turnkey" means fewer steps, not implicit consent.
4. **Never touch the developer's live agents.** No test, script or setup step may start, stop, restart or send input to Rex, Herdr, the Codex daemon or any agent the test itself did not create. Live tests are opt-in only (Phase 8).
5. **One phase = one PR, or a short series of PRs.** Each PR is mergeable on its own, keeps the full suite green and changes one kind of thing. Never mix formatting, moves and logic in one commit.
6. **When unsure, stop and ask.** Record the question under "Open questions" in the PR description and move on to work that doesn't depend on the answer. Do not guess about native terminal or agent behavior; the existing docs record what has actually been verified.
7. Maintain `AGENTS.md` (created in Phase 1) as the standing instructions for future agent work in this repo.

---

## 1. Current state: what changes and why

| Area | Today | Problem |
| --- | --- | --- |
| Code style | ~208 KB of JS in ~2,150 lines; 160+ lines over 200 chars, hand-compressed | Guard logic can't be reviewed, which undermines the safety story |
| Structure | `core.js` (Rex bridge) imports 9 modules; `herdr-bridge.js` imports Claude modules and `core`; `plugin.js` is one `createController` closure | Terminal backends and agent providers are tangled; adding a backend means touching everything |
| Guards | `assertVisible` added by monkeypatching `bridge.focused`, `bridge.run` and `rpc.request`, with a hardcoded allowlist of input commands | A new input path skips the check silently |
| External data | Ad-hoc regexes and inline checks spread across modules | Validation rules aren't in one place and aren't easy to test |
| Tests | 36 root-level `test-*.js` chained with `&&` in `package.json` | The first failure hides every later group; no coverage report; tests clutter the root |
| Stream Deck I/O | Raw `ws` and hand-built events | Reimplements the official SDK |
| Install | `.streamDeckPlugin`, then manual profile import, then per-backend setup; `install.py` requires quitting Stream Deck; Claude hooks via CLI only | Many manual steps, two toolchains (Python and Node) |
| Paths | Rex binary hardcoded to `/Applications/Rex Beta.app/...` | Breaks if Rex is installed elsewhere or the release build is used |
| Repo | 404 MB `dist/` and 44 MB `backups/` (gitignored but inside the project folder); historical validation narrative mixed into user docs | Clutter |
| SDLC | No CI, no CHANGELOG, no AGENTS.md, no lint or typecheck, version kept in sync by hand across 3 files | No automated gate |

---

## 2. Target architecture

### 2.1 Two independent axes

Today one module handles "which terminal app" and "which coding agent" together. Separate them:

- **Terminal backend** (where agents live): `rex`, `herdr-tui`, later `herdr-app`. It handles discovery, topology, focus, zoom, key delivery, pane reads and native focus truth.
- **Agent provider** (what is running): `codex`, `claude-code`. It handles identity binding, state/status, model/effort/mode controls, questions/approvals, prompt semantics and native dialogs.

The controller combines them: **available controls = what the provider offers ∩ what the backend can do safely**.

### 2.2 Capabilities instead of backend `if`s

Each backend declares a capability set when it connects. Controls declare the capabilities they need. The layout engine shows a control only when every requirement is met, and shows the same "Use keyboard"/Inactive keys as today otherwise.

```ts
type BackendCapability =
  | 'discover' | 'focus' | 'verifiedFocus' | 'zoom' | 'sendKeys'
  | 'readPane' | 'composerCursor' | 'paneIdentity' | 'events';

interface TerminalBackend {
  readonly id: 'rex' | 'herdr-tui' | 'herdr-app';
  readonly generation: number;                 // bumps on reconnect/config change
  connect(signal: AbortSignal): Promise<BackendInfo>;   // version + capabilities
  discover(): Promise<AgentSnapshot[]>;
  focused(): Promise<FocusTruth>;              // native truth, never deck state
  focus(target: TargetRef): Promise<void>;
  // All input goes through ONE method so the guard pipeline cannot be bypassed:
  deliver(target: TargetRef, input: InputAction, guard: GuardToken): Promise<void>;
  readPane?(target: TargetRef): Promise<PaneView>;
  zoom?(target: TargetRef): Promise<void>;
  dispose(): Promise<void>;
}

interface AgentProvider {
  readonly id: 'codex' | 'claude-code';
  matches(proc: ForegroundProcess): boolean;   // today's identify() logic
  bind(agent: AgentSnapshot, backend: TerminalBackend): Promise<Binding | null>;
  state(binding: Binding): Promise<AgentState>;
  controls(state: AgentState): ControlSpec[];  // each spec lists required capabilities
  perform(control: ControlId, ctx: PressContext): Promise<ControlResult>;
}
```

Today's Rex-vs-Herdr behavior table (Herdr's Prompts page showing "Use Herdr keyboard"; Steer/Queue omitted) should *fall out* of the capabilities, because Herdr TUI lacks `composerCursor`. The characterization tests (Phase 0) prove it.

### 2.3 One guard pipeline

Replace the monkeypatched `assertVisible` and the scattered per-press checks with one explicit pipeline that every press goes through:

```
capture (at render) → PressContext{scope, appearance, visibility, generation, backendKey, stamp, target, armedAt}
press → guards.preflight(ctx)      // generation, visibility, backendKey, setupBusy, stamp, staleness
      → provider/backend verify     // native focus, identity, chat, request digest, cursor…
      → backend.deliver(…, token)   // the token is single-use; deliver() re-checks it
      → guards.postflight(ctx)
```

`deliver()` is the **only** way to send input, so a new input method is a type error, not a silent bypass. Test: every `InputAction` variant is refused when the token is stale.

### 2.4 Directory layout

```
src/
  plugin/        Stream Deck adapter (@elgato/streamdeck): action class, events, settings I/O
  app/           controller: slots/banks/pages, selection, press pipeline, profile scopes
  domain/        pure types and logic: layout tables, slot compaction, labels, state priority
  guards/        guard pipeline + GuardToken
  terminals/
    contract/    shared backend contract test suite + FixtureBackend
    rex/         (from core.js, rex-process.js, native-input.js, visible-pane bridge)
    herdr-tui/   (from herdr-bridge.js, herdr-rpc.js, herdr-title-identity.js)
    herdr-app/   (Phase 9: skeleton only)
  agents/
    codex/       (daemon-controls, background-controls, model-controls, presets, setup-presets, setup-daemon-controls, agent-metadata)
    claude/      (claude-state, claude-controls, claude-cycle, claude-hook entry, configure-claude)
  platform/      exec wrapper (timeouts, env scrubbing), ps/process info, paths/discovery, fs helpers
  schemas/       Zod schemas for every external input
  render/        svg, visuals, signal-visuals, completion-display, palette, icons
  inspector/     property inspector (sdpi-components)
native/          visible-pane.swift (unchanged)
scripts/         build, package, dev-link, doctor, version (Node; replace the Python scripts)
tests/
  unit/ integration/ contract/ live/ fixtures/
docs/
  adr/ validation/ (historical logs moved here) plans/
```

**Dependency rules** (enforced by `dependency-cruiser` in CI): `domain` imports nothing. `guards` imports only `domain`. `agents/*` and `terminals/*` never import each other's concrete modules, only `domain` and `guards` interfaces. Only `app` composes them. Only `plugin` imports the Stream Deck SDK.

---

## 3. Recommended stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, `strict` | Migrate via `checkJs` first (Phase 2) |
| Stream Deck | `@elgato/streamdeck` (official SDK) | Removes the `ws` dependency and the hand-built protocol code |
| Bundle | Rollup (Elgato template setup) | Single bundled `bin/plugin.js`; no `node_modules` shipped |
| Validation | Zod | Rex CLI JSON, Herdr RPC frames, Claude hook/status-line payloads, `config.json`, global settings |
| TOML | Keep `@iarna/toml` (or `smol-toml` if smaller/maintained; justify in PR) | |
| Tests | `node:test` + `c8` coverage | No Jest/Vitest needed |
| Lint/format | Prettier, ESLint + typescript-eslint (`no-floating-promises`, `switch-exhaustiveness-check`), dependency-cruiser | |
| Inspector | sdpi-components | Native-looking settings fields |
| Helper | Swift (unchanged) | |
| Scripts | Node (TS via `tsx` or plain ESM) | One toolchain; port `package.py` audits faithfully |
| CI | GitHub Actions, `macos-14` | |

Keep the runtime dependency count at or below today's (two). Every new runtime dependency needs a line of justification in its PR.

---

## 4. Phases

Each phase lists its **scope**, **deliverables** and **definition of done (DoD)**. Phases run in order; 6 and 7 can overlap once 5 lands.

### Phase 0: Safety net (do first, change no behavior)

- Create branch `refactor/v2-foundation` from the baseline; tag the baseline `v1.3.4-pre-refactor`.
- **Characterization ("golden") tests** using the existing `test-plugin-harness.js` approach:
  - For each agent state × backend × provider × page (Ready/Working/Background/Question/Unknown; Rex/Herdr; Codex/Claude; Home/Questions/Prompts): record the **action mapping** for all 15 keys, as JSON snapshots.
  - For each control press in those states: record the exact sequence of backend calls (CLI args / RPC methods / keys) and the outcome (result label or refusal message).
  - For each known refusal path (stale press, changed backend, changed profile, focus mismatch, changed chat, edited draft, expired picker, missing identity): assert that **zero** input calls are made.
- Store snapshots in `tests/fixtures/golden/`. These are the contract the refactor must preserve; snapshot updates in later phases need a written justification.
- Write `docs/plans/test-inventory.md` mapping each of the 36 existing groups to the behaviors it covers. This drives the Phase 1 move.

**DoD:** the golden suite passes on the baseline and runs in under 30 s. No source changes outside `tests/`.

### Phase 1: Hygiene, formatting and test runner

Separate commits, in this order:

1. **Formatting only:** add Prettier and `.editorconfig`; run it once over all JS/HTML/JSON. Add the commit to `.git-blame-ignore-revs`. The diff must be whitespace/punctuation only (check with `git diff -w --stat` and the tests).
2. **Test runner:** move `test-*.js` → `tests/unit|integration/*.test.js`, convert to `node:test` (`describe`/`test`), and keep every assertion. Root `npm test` runs `node --test` across everything, so a failure no longer hides later groups. Add `c8` and record the baseline coverage number (no threshold yet).
3. **Root workspace:** a root `package.json` with npm workspaces (`plugin`, `tools`), so `npm ci && npm test` at the root does everything.
4. **ESLint:** ESLint with recommended rules; fix only mechanical issues; disable noisy rules with a TODO rather than rewriting logic here.
5. **Cruft removal**, each item verified unused first (`knip` plus grep):
   - Unused icons and branches (e.g. `grok` in `visuals.js` and `icons/grok.svg`, if no provider uses them).
   - `dist/` and `backups/` stay ignored; add a `scripts/clean` and document it. Change the installer backup location (until Phase 6 removes it) to `~/Library/Application Support/AgentSwitchboard/backups/`, outside the repo.
   - Move the historical validation narratives (dated sections in `BETA-CHECKLIST.md`, `HERDR.md`, `CLAUDE.md`) to `docs/validation/<date>-<topic>.md`. User docs keep only current setup, capabilities and limits, linking to the validation record.
6. **AGENTS.md** at the root: commands (`npm ci`, `npm test`, `npm run lint`, `npm run build`), the ground rules from §0, the architecture summary (§2), "never run live tests without `ASW_LIVE=1`", and the commit/PR conventions (§5).

**DoD:** the full suite is green under `node --test`; the golden suite is green; `npm run lint` passes; the root has no `test-*.js` files.

### Phase 2: Types without a rewrite

- `tsconfig.json` with `allowJs`, `checkJs` and `strict`; add `// @ts-check` per file.
- Write `src/domain/types.ts`: `AgentSnapshot`, `TargetRef`, `AgentState`, `PressContext`, `ControlId`, `ControlSpec`, `BackendCapability`, `Preferences` (v2), `Config`. Annotate existing modules with JSDoc against those types.
- Add `npm run typecheck` to CI.

**DoD:** zero type errors (allow up to 20 justified `@ts-expect-error` comments listed in the PR); no runtime changes; golden suite green.

### Phase 3: Restructure into layers (the core of the refactor)

Do it incrementally, **one module family per PR**, converting moved files to `.ts` as they move:

1. `platform/`: one `exec()` wrapper (timeouts, `maxBuffer`, env scrubbing as `core.js` `cli()` does today), process info (`ps` parsing from `claude-state.js`/`rex-process.js`, which are currently duplicated) and path discovery.
2. `domain/` + `render/`: pure functions (layout tables, slot compaction/Collapse, labels, state priority, SVG). Easiest to unit-test.
3. `guards/`: the pipeline from §2.3. Port `context-controls.js` (stamp/snapshot/assertContext) and the plugin's `capture`/`press` checks into it. Delete the monkeypatching in `plugin.js` `makeBridge`.
4. `terminals/contract/`: the backend contract test suite. Every backend runs the same tests: discovery stability, focus truth, generation bump on reconnect, `deliver` refusing stale tokens, no input on any refusal, timeout behavior. Add `FixtureBackend`.
5. `terminals/rex/` from `core.js`, `rex-process.js`, `native-input.js`. **Replace the hardcoded Rex path** with discovery: config override → `mdfind kMDItemCFBundleIdentifier` → known `/Applications` and `~/Applications` names (Beta and release). Refuse cleanly if not found.
6. `terminals/herdr-tui/` from `herdr-bridge.js`, `herdr-rpc.js`, `herdr-title-identity.js`. Remove its direct imports of Claude modules; the Claude-on-Herdr behavior moves behind the `AgentProvider` interface.
7. `agents/codex/` and `agents/claude/`. Consolidate the `presets.js` / `setup-presets.js` / `model-controls.js` overlap here.
8. `app/`: the controller (slots, banks, pages, selection, per-profile scope state) as a class with injected `backendFactory`, `providers`, `clock` and `renderer`, so no `vm` sandbox is needed to test it. `plugin.js` becomes a thin adapter.

Rules: one move or extract per commit, then a separate commit for any cleanup. Golden snapshots must not change. Keep functions under ~60 lines and files under ~400 lines (ESLint `max-lines` warning).

**DoD:** dependency-cruiser rules pass; the old root-level plugin modules are gone; every backend passes the contract suite; golden and full suites green; coverage ≥ baseline.

### Phase 4: Validate external inputs at the boundaries

- `src/schemas/`: Zod schemas for Rex CLI responses, the visible-pane helper output, Herdr RPC frames (protocol 22), Codex daemon responses, Claude hook and status-line payloads, Claude private state records, `config.json` and global settings (v1 and v2).
- Parse at the boundary and pass typed data inward. Inline regexes move into the schemas (e.g. `block:` UUID format, session ID charset, control-character rejection, version formats).
- Unit tests: every schema has valid, invalid, oversized and control-character cases. Port the existing malformed-reply tests onto them.

**DoD:** no `JSON.parse` result is used without a schema; golden suite green.

### Phase 5: Official SDK and bundling

- Move to `@elgato/streamdeck`: one `SingletonAction` for `com.local.rexagents.key`, global settings through the SDK, and `setImage`/`setTitle`/`showAlert` through the action API. **Key coordinates, the profile scope and the v2 global-settings shape must stay byte-compatible**; add a migration test that loads real v1 and v2 settings captured from the baseline.
- Rollup bundle → `com.local.rexagents.sdPlugin/bin/plugin.js`; manifest `CodePath` updated; ship no `node_modules`.
- `claude-hook.js` and `configure-claude.js` remain standalone entry points (bundled separately), because Claude settings reference them by absolute path. **Keep their installed paths stable** or add migration logic in `configure-claude` (removal must still find old commands).
- Inspector moves to sdpi-components and keeps every field and its semantics.
- The Elgato CLI `streamdeck validate` runs in CI.

**DoD:** a test installs the built plugin over a 1.3.4 install (real files, in a temp `HOME`): settings, keys and profiles keep working, and the Claude hook paths resolve. Golden suite green against the bundled build.

### Phase 6: Turnkey setup

Goal: **install = double-click one file; setup = one guided panel.** Every consent remains one explicit click.

1. **Profiles inside the plugin.** Declare the Rex and Herdr profiles in the manifest `Profiles` array so Stream Deck offers them at install (check the current SDK docs for the exact fields, e.g. `DeviceType`, `Readonly`, `DontAutoSwitchWhenInstalled`, `AutoInstall`). Keep the existing profile IDs so upgrades don't duplicate them. This replaces manual `.streamDeckProfile` import and `install.py`.
2. **Setup panel** in the property inspector (first-run and on demand) showing a live checklist:
   - Stream Deck model detected (warn on anything other than 15-key)
   - Rex found (path, version) · Remote Control enabled · visible-pane consent [Enable]
   - Herdr TUI sessions found: list `~/.config/herdr/sessions/*/herdr.sock` with their protocol versions → [Use this session]; title identity [Enable] + copyable `/title thread-id` instructions
   - Codex: daemon reachable · the selected agent's metadata available → [Set up selected Codex agent] (existing flow)
   - Claude: native version supported · hooks installed? → [Preview changes] shows the exact settings diff → [Apply] (with backup) → [Undo]. The existing `configure-claude` logic runs in-process here; the CLI remains as a fallback.
   - Each row: ✅ / ⚠️ with a one-line reason and a fix action. Nothing is enabled without the click.
3. **`doctor`**: the same checks as a CLI (`node <plugin>/bin/doctor.js`) printing a support-friendly report with no secrets, prompt text or home paths.
4. **Uninstall helper:** an inspector button "Remove integrations" (Claude hooks/status line, saved records) to use before uninstalling; `docs/UNINSTALL.md` shrinks accordingly.
5. **Dev loop:** `npm run dev` = build in watch mode + `streamdeck link` + `streamdeck restart`. Replaces `install.py` for developers. Remove `install.py` and `build.py` once their behavior (profile generation, config merge) is covered by Node scripts and tests.
6. **Port `package.py` to `scripts/package.ts`** with every audit preserved: path traversal, symlinks, duplicates, private files, home/workspace path leaks, version identity, safe defaults in `config.json`. Port `tests/test_distribution.py` to `node:test`. Then remove Python from the toolchain.

**DoD:** on a fresh macOS user account, the steps are: open `.streamDeckPlugin` → accept profiles → open the setup panel → click the consents → working. That is at most 5 user actions for Rex + Codex. The steps are written in `docs/INSTALL.md` (target: half its current length). The doctor output is attached to the PR.

### Phase 7: SDLC and CI/CD

- **GitHub Actions** `ci.yml` on PRs and `main`, on `macos-14`: `npm ci` → lint → typecheck → dependency-cruiser → `node --test` with c8 (threshold = Phase 3 coverage, ratchet only) → build (universal helper) → `streamdeck validate` → package + audit → upload the artifact.
- `release.yml` on a `v*` tag: the same build; ad-hoc sign the helper, or **Developer ID sign + notarize if the secrets are configured** (document the required secrets; skip cleanly without them); create a **draft** GitHub prerelease with the zip, `.sha256` and `SHA256SUMS`. Never auto-publish.
- **Versioning:** a single source of truth in the root `package.json`; `scripts/version.ts` writes the manifest `Version` (`x.y.z.0`), the plugin package and the lockfiles, and checks they match (as `package.py` does today).
- **CHANGELOG.md** in Keep-a-Changelog format, starting at 1.3.4; SemVer; `-beta.N` prereleases.
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `build:`, `ci:`), plus a commitlint check in CI.
- **Branch protection** (owner applies): main requires green CI + 1 review; squash or rebase merges.
- Dependabot for npm and actions (weekly); `npm audit --omit=dev` in CI fails on high severity.
- `docs/adr/`: `0001-terminal-backend-agent-provider-split.md`, `0002-guard-pipeline-and-single-deliver.md`, `0003-capability-gated-controls.md`, `0004-herdr-app-backend.md` (Phase 9), plus short ADRs for the SDK, bundling and Zod decisions.
- `SECURITY.md` with a threat model: the primary hazard is **input delivered to the wrong pane or agent**; secondary hazards are privacy (prompt/transcript leakage) and modification of a user's agent settings. List the guard that mitigates each.
- PR template: what changed, behavior-change statement ("none" expected), golden snapshot changes and why, tests added, docs updated.

**DoD:** CI is required and green; a dry-run tag produces a draft release with verified checksums.

### Phase 8: Automated control testing (no physical presses)

- `tests/integration/host/`: a **fake Stream Deck host** that launches the *bundled* plugin with the real launch arguments, completes registration, sends `willAppear`/`keyDown`/`keyUp` per coordinate and captures `setImage`/`setTitle`/`showAlert`. Record a real Stream Deck WebSocket session once (dev tool behind a flag) and compare the frame shapes to keep the fake faithful.
- These integration tests use `FixtureBackend` + fixture providers and run in CI.
- `tests/live/` (**opt-in: `ASW_LIVE=1`, never in CI**):
  - Herdr TUI: start a **dedicated headless session on a temporary socket**, launch disposable Codex/Claude agents in a temp git repo with the cheapest model and lowest effort, and run scenarios translated from `BETA-CHECKLIST.md`: selection, Next/wrap, Collapse, Interrupt, Effort cycle with restore, question/approval with print-only commands, stale-focus refusal. Assert on **native state** (daemon, RPC, Claude state records), not on LLM output text.
  - Rex: run only if `ASW_LIVE_REX=1` and the harness verifies that it only targets PIDs it spawned; otherwise skip with a message.
  - Pre-flight: snapshot hashes of the global Codex/Claude settings before the run, and fail loudly if they differ afterward.
- `docs/validation/MANUAL-SMOKE.md`: the ≤10 physical presses still needed per release (USB path, LCD rendering, profile mapping).

**DoD:** `npm run test:live` passes locally against Herdr TUI with zero changes to the user's real sessions; the manual checklist goes from ~40 items to ≤10.

### Phase 9: Herdr App (desktop) foundation

Facts as of 2026-11-07 (verify again before implementing):
- Herdr App is a native desktop app built on **herdr-core**. Herdr TUI is a separate program with its own server, and they **don't share agents**, so this must be a **separate backend `herdr-app`**, not a mode of `herdr-tui`.
- The documented programmatic surfaces are the `herdr-app` CLI (`ls`, `status`, `commands`, `do <action> [json]`), the `hc` CLI for herdr-core, and the OSC 7501 status escape. Documented actions include `agent.focus` (takes a terminal), `pane.focus`, `pane.zoom`, `terminal.peek`, `agent.next/prev`, `tab.select`.
- **Not documented:** a socket API, protocol versioning, send-keys, pane read with a cursor, agent PID/chat identity or events. The action list is generated from code and carries no stability promise. Config is in `~/.config/herdr-app/`.

Deliverables (foundation only; no user-facing controls yet):
1. **Spike → `docs/adr/0004-herdr-app-backend.md`.** Read the herdr-core and herdr-app sources and document the transport (CLI vs socket), version detection, identity data available (terminal IDs, PIDs, cwd, agent kind), whether input delivery exists, and the focus truth source. List which `BackendCapability` values are achievable.
2. **`terminals/herdr-app/` skeleton:** `connect()` with **strict version gating** (unknown version → no capabilities), `discover()` and `focused()` behind a fixture, and a capability probe returning only what has been verified. It must pass the contract suite with a fixture transport.
3. **Read-only first:** the first shipped scope (a later feature PR, not this refactor) is discovery, status, selection/focus and Zoom only. Input controls stay disabled until identity binding and focus truth are validated live. This is the same staged approach the Herdr TUI backend took.
4. **Profile scope:** reserve a third scope `herdr-app` in the preferences schema (v2 → v3 migration with tests, round-trip and rollback projection like today's), a profile ID and a hidden-until-enabled profile. Ship it behind an `experimental.herdrApp` flag, off by default.
5. A provider/backend matrix in `docs/COMPATIBILITY.md`, generated from the capability declarations, so documentation can't drift from the code.

**DoD:** the ADR is merged; the skeleton passes the contract suite; with the flag off nothing changes for users.

---

## 5. Conventions

- **Branches:** `refactor/<phase>-<topic>` off `refactor/v2-foundation`; merge it into `main` after Phase 7 (or earlier, if the owner prefers trunk-based work once CI exists).
- **Commits:** Conventional Commits. A pure move or rename never shares a commit with logic changes.
- **PR description:** phase, scope, a "Behavior change: none" statement (or an explicit list), golden snapshot diffs explained, test and coverage delta, follow-ups.
- **Code:** named functions; no single-letter names outside tiny lambdas; no nested ternaries over 2 levels; comments explain *why a guard exists* (link the ADR, validation log or upstream issue).
- **Errors:** user-facing key messages stay ≤15 chars as today (`clean()`); the inspector's long messages stay ≤160 chars; an error never contains prompt text, paths under `$HOME` or tokens.

## 6. Out of scope

New controls or features; Windows/Linux; other Stream Deck models or layouts; changing any default or consent; choosing a license; artwork redistribution decisions; removing the Rex clipboard path.

## 7. Owner decisions needed (Codex: ask, don't decide)

1. Public product/display name ("Rex Agents" vs "Agent Switchboard") in the manifest and profiles; the UUID stays the same either way.
2. Project license, and how to resolve the OpenAI artwork before any public release.
3. An Apple Developer ID for notarization (enables a no-warning install).
4. Whether to merge to `main` per phase or at the end.
5. Herdr App priority relative to live validation of the Claude controls.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A refactor silently drops a guard | Golden refusal tests (Phase 0); single `deliver()` + token; reviewers check the "Behavior change" statement |
| SDK migration breaks existing installs | Byte-compatibility tests against captured v1/v2 settings; an upgrade-over-1.3.4 test in a temp HOME |
| Claude hook paths change on bundling | Stable entry-point paths, or migration inside `configure-claude`; removal tested against old paths |
| Bundled profiles duplicate existing ones | Reuse the existing profile IDs; test the upgrade path |
| Live tests touch real agents | Isolated Herdr socket; PID ownership checks; settings hash pre/post; opt-in env flags |
| Herdr App interfaces change | Strict version gating; capability probe; read-only first; ADR revisited on each Herdr release |

## 9. Suggested PR sequence (summary)

0. Golden characterization tests
1. a) Prettier · b) node:test move · c) workspaces · d) ESLint · e) cruft/docs moves · f) AGENTS.md
2. checkJs + domain types
3. a) platform · b) domain/render · c) guards · d) backend contract · e) rex · f) herdr-tui · g) codex/claude providers · h) app controller
4. Zod schemas
5. Official SDK + Rollup + inspector
6. a) manifest profiles · b) setup panel · c) doctor · d) dev loop · e) Node packaging; remove Python
7. CI, release, versioning, CHANGELOG, ADRs, SECURITY.md
8. Fake Stream Deck host + opt-in live tests
9. Herdr App ADR + backend skeleton behind a flag
