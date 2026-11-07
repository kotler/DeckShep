# Agent Switchboard standing instructions

Read [the refactor plan](docs/plans/REFACTOR-PLAN.md) before each refactor phase.
The baseline is plugin 1.3.4 at `0262267`, tagged `v1.3.4-pre-refactor`.

## Commands

Use Node 22.13+ (`.nvmrc` selects 22), Python 3 and macOS Command Line Tools.
The installed plugin retains its existing Stream Deck Node runtime.

- `npm ci`: install the locked root workspace (`com.local.rexagents.sdPlugin`, `tools`).
- `npm test`: run every isolated `node:test` group, including the eight legacy Python distribution checks.
- `npm run test:golden`: baseline layouts, routing, native transport traces and refusals.
- `npm run test:coverage`: c8 reports in ignored `coverage/`; baseline in `docs/plans/coverage-baseline.json`.
- `npm run lint`: recommended ESLint rules, with documented legacy-only TODOs.
- `npm run format:check` / `npm run format`: format JS/TS/HTML/JSON/YAML; golden JSON stays byte-stable.
- `npm run knip`: unused-file/dependency scan; confirm findings with `rg` before removal. Dynamic CommonJS exports, VM imports, fixture lookup and icon names need manual verification.
- `npm run build` (or `npm run build -- --universal`): legacy portable build; never installs or restarts anything.
- `npm run clean`: delete only generated `dist/` and `coverage/`; preserve all backups.

Keep nested dependency installation until bundling replaces the legacy builder.
Do not run `install.py`, `streamdeck restart`, optional setup, or any live command
as a verification shortcut. Fixture tests may inspect only their own process and
create private sockets/files under a temporary directory.

## Frozen behavior and compatibility

This is a refactor, not a feature release. Retain every identity/process guard,
stale-press refusal, focus check, digest/cursor check, generation/visibility gate,
opt-in and privacy rule. Add a test before questioning a guard; do not delete it.
Golden snapshot changes require a written justification.

Never change plugin UUID `com.local.rexagents`, action UUID
`com.local.rexagents.key`, `PROFILE_IDS`/`PAGE_IDS`, per-key UUID5 ActionIDs,
`profileScope`, global-settings v2/v1 migration, or config-key semantics as a
routine refactor. Existing keys, profiles and settings must upgrade in place.
Names remain Rex Agents / Herdr Agents until the owner explicitly decides.

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
The formatter commit is listed in `.git-blame-ignore-revs`.

PRs state phase/scope, behavior change (normally none), golden changes and why,
tests/coverage delta, documentation and follow-ups/open questions. Do not merge
to main, push, publish, choose a license/artwork policy or change display names
without owner direction. Record uncertain native behavior and continue work
that does not depend on it; verify against existing evidence or ask the owner.

Use named functions, descriptive variables and comments explaining why guards
exist. Target functions under about 60 lines and moved files under about 400.
Maintain these instructions as commands and architecture evolve.
