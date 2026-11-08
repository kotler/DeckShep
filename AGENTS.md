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
The owner approved profile labels Rex / Herdr. Keep their existing UUIDs and key
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
builds retain v2 and both existing profiles. Read ADR 0004 before changing this.

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
