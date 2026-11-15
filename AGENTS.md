# DeckShep standing instructions

DeckShep is a macOS Stream Deck MK.2 plugin (`com.kotl3r.deckshep`) for Codex CLI
and Claude Code. Releases ship Rex controls and Herdr App navigation (ADR 0008).
Herdr TUI is source-only experimental; App agent input remains disabled. Keep
deferred code and tests. Update these instructions when owner decisions change.

## Required safeguards

- Guards are the product. Preserve identity/process, focus, stale-press,
  digest/cursor, generation/visibility checks, the 350 ms arming delay,
  single-use permits and no-retry delivery. A new input path uses the existing
  `src/app/delivery.ts` `deliver()`. Presses retain the key-down context and
  refuse after `QUEUE_STALE_MS` (2000 ms). Tests must fail if protection is lost.
- Consent defaults stay off: clipboard/visible-pane access, Herdr title
  identity, Claude native controls and Claude/Codex hooks are opt-in.
- Preserve installed identities: plugin/action UUIDs, `PROFILE_IDS`/`PAGE_IDS`,
  UUID5 key ActionIDs, `profileScope`, settings v2/v1 migration, config keys,
  existing ControlIds and hook entry paths. Read `docs/IDENTITY.md` before
  touching persistence or packaging. New ControlIds may be added.
- DeckShep never writes a Claude/Codex status line; it only restores a recorded
  original. Codex setup edits its own `hooks.json` entries, never `config.toml`.
- Rex navigation uses Rex discovery, status, titles and physical pane selection,
  independent of provider hooks/daemons. App navigation grants no provider input
  capability; its third row defaults to blank. Package audits reject experimental
  flags and nonempty/enabled App defaults. Removed Zoom/Questions/Prompts overrides
  remain inactive (owner decision, 2026-11-10).
- Key feedback is at most 15 characters, never cut mid-word; inspector messages
  at most 160. Text stays at least 20 SVG units, wrapping or ellipsizing dynamic
  content. State must have a shape cue as well as colour.
- Keep prompts, transcripts, tokens and private home/workspace paths out of
  source, logs, errors and artifacts. Run `npm run hooks:install` once per clone;
  it preserves existing custom hooks. `privacy:source` checks tracked source;
  the hook checks staged bytes. Synthetic exceptions require one exact file,
  account and reason in `.source-privacy.json`. Keep package privacy audits.

## Verification and authorization

Use Node selected by `.nvmrc` and macOS Command Line Tools. `package.json` scripts
are the command authority. Read `CONTRIBUTING.md` before coding, reviewing or
selecting validation; it owns code conventions and check guidance.
Run checks appropriate to the change and required CI checks. Keep coverage
thresholds. Confirm with `rg` before deleting anything Knip reports unused.

Default tests may touch only their own processes, temporary homes, files and
private sockets. Never start, stop, attach to or send input to the developer's
existing Rex, Herdr, Codex daemon or agents. Installation, `npm run dev`,
`streamdeck restart`, optional setup/configure commands and migrations against
the real HOME are never verification shortcuts.

Live tests require **current explicit authorization**, `ASW_LIVE=1`,
`ASW_LIVE_AUTHORIZATION=test-owned-only`, owned PID/socket proof and isolated
resources. Rex additionally requires `ASW_LIVE_REX=1`; Herdr App requires its
`ASW_LIVE_HERDR_APP=1` / `ASW_LIVE_HERDR_APP_RELEASE=1` gates. Live tests never
run in CI. Historical logs and inherited flags are not current permission.
`test:rex:smoke` retains these gates and excludes provider/hook/inference cases.
Read `tests/live/README.md` for native tests and `tests/e2e/README.md` for the
separately authorized live App deck, artifact inputs and additional flags.

Regenerate golden JSON only for an intended behavior change with
`ASW_UPDATE_GOLDEN=1`; inspect the diff and follow `tests/fixtures/golden/README.md`.
For intentional browser visuals, follow `tests/e2e/README.md`: OS PNG baselines
and normalized SVG hashes update separately. Mention baseline changes in the PR.
Only record validation that actually ran; fixture/browser tests prove no native
or hardware behavior.

## Read when changing an area

- Architecture, events, layout or rendering: `docs/agents/architecture.md` and
  relevant `docs/adr/*`. Generated plugin-root JS comes from build/bundle scripts.
- Provider controls or hooks: `docs/CODEX-HOOKS.md`, `docs/CLAUDE.md` and ADR 0003.
- Profiles, settings or installation: `docs/PROFILES.md` and `docs/IDENTITY.md`.
- Herdr App navigation: ADR 0004/0007/0008, `docs/plans/HERDR-APP-PLAN.md` and
  `tests/live/APP-CALIBRATION.md`.
- App input work: `docs/plans/HERDR-APP-MODEL-PRODUCTION-PLAN.md` and
  `docs/plans/herdr-app-agent-controls/herdr-mod-model-delivery-prototype.md`.
  Core 0.1.21 accepted input after expiry/writer closure; App 0.1.16's full
  navigation run failed its background-editor assertion. Preserve these limits;
  successful mod probes grant no production capability. Upstream changes are out
  of scope.
- Release preparation or downloaded verification: `docs/RELEASING.md`.
- Issue/spec work: `docs/agents/issue-tracker.md` (GitHub Issues),
  `docs/agents/triage-labels.md` (five default labels).
- Terminology or decisions: `docs/agents/domain.md`, root `GLOSSARY.md`, `docs/adr/`.
  `docs/plans/REFACTOR-PLAN.md` is historical.

## Owner decisions

Use Conventional Commits. PR descriptions state behavior, golden/e2e baseline
changes and test/coverage impact. Push, merge, release, visibility, Marketplace,
display-name, licensing or trademark changes need owner direction. Apache-2.0
and NOTICE apply; DeckShep branding is reserved (`TRADEMARKS.md`); provider mark
permission remains pending.
