# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DeckShep is a macOS Stream Deck plugin (`com.kotl3r.deckshep`) that controls coding agents
(Codex CLI, Claude Code) already running in a terminal multiplexer: **Rex** (released),
**Herdr TUI / Herdr App** (in source, experimental, not packaged). Most of the code is
*guards*: proof that a key press still targets the same agent, process, pane and state it
was rendered for before any input reaches a terminal.

## Commands

Node 22.13+ (`.nvmrc` → 22) and macOS Command Line Tools (Swift is used for native helpers in `native/`).
The root is an npm workspace (`com.kotl3r.deckshep.sdPlugin`, `tools`). Dev tools are run via
`scripts/tool.mjs`.

```sh
npm ci
npm test                                   # all node:test groups (tests/**/*.test.js via tsx)
node --import tsx --test tests/unit/collapse.test.js            # one file
node --import tsx --test --test-name-pattern="<regex>" tests/unit/collapse.test.js  # one test
npm run test:golden                        # golden layouts/routing/native traces/refusals
npm run test:coverage                      # c8; baseline docs/plans/coverage-baseline.json
npm run typecheck                          # strict TS, src + tsconfig.e2e.json; no suppressions
npm run lint && npm run format:check       # golden JSON must stay byte-stable
npm run deps                               # dependency-cruiser layer rules
npm run knip                               # unused files/deps; confirm with rg before deleting
npm run version:check && npm run compatibility:check
npm run build                              # or: npm run build -- --universal (never installs/restarts)
npm run test:bundled                       # tests against the built bundle
npm run package                            # validate/pack/audit locally; never uploads
npm run clean                              # removes only dist/ and coverage/
npm run deck:preview                       # synthetic 15-key browser deck on a random loopback URL
npm run e2e:install && npm run test:e2e    # Playwright virtual deck (macOS baselines)
```

CI (`.github/workflows/ci.yml`, macos-15) runs: lint, format:check, typecheck, deps, version/compatibility
checks, `marketplace:media && marketplace:check`, test:coverage, test:bundled, npm audit, commitlint,
universal build, Elgato validate, package; plus a separate e2e job.

`npm run test:e2e:update` regenerates OS-specific screenshots — only deliberately, with justification.
Do not lower coverage thresholds to hide a regression.

### Never run as verification

`scripts/install.mjs`, `npm run dev`, `streamdeck restart`, `scripts/migrate-upgrade.mjs` against real
HOME, optional setup/configure commands, or anything in `tests/live/` (`npm run test:live`). Live tests
need `ASW_LIVE=1` **and** explicit current authorization (Rex also `ASW_LIVE_REX=1` + PID ownership
proof; Herdr App `ASW_LIVE_HERDR_APP=1` / `ASW_LIVE_HERDR_APP_RELEASE=1`). Never start, stop, attach to
or send input to the developer's existing Rex, Herdr, Codex daemon or agents. Fixture tests may only
touch their own process and private temp sockets/files.

## Architecture

Two independent axes, composed only in `src/app` (ADR 0001):

- **Terminal backends** (`src/terminals/{rex,herdr-tui,herdr-app}`, contract in `src/terminals/contract`)
  own discovery, topology, native focus, reads and delivery.
- **Providers** (`src/agents/{codex,claude}`, interface in `src/agents/shared`) own identity, state and
  control semantics.
- A control is available only at the intersection of provider support and *verified* backend
  capabilities (ADR 0003). Herdr TUI has no verified composer cursor.

Layer rules are enforced by `.dependency-cruiser.cjs`:

| Layer | May import |
| --- | --- |
| `src/domain` | nothing (types, layout tables, labels, capabilities) |
| `src/guards` | domain only (press pipeline, permits, context stamps) |
| `src/platform` | node builtins, domain (exec, paths, process info) |
| `src/agents/*`, `src/terminals/*` | domain, guards, platform, schemas — never each other, app or plugin |
| `src/render` | key SVG |
| `src/app` | everything except plugin (controllers, delivery, preferences, setup) |
| `src/plugin` | the only place that imports `@elgato/streamdeck`; entry points |

Host events (`willAppear`, `willDisappear`, `didReceiveSettings`, `keyDown`, `sendToPlugin`) go through
one serial queue; the app emits `setImage`/`setTitle`/`showAlert`/`setGlobalSettings`. Input flows through
one guarded `deliver()` with a single-use token and no retries (ADR 0002). External data is validated at
the boundary with zod schemas in `src/schemas` (ADR 0006).

The TypeScript source is bundled by `scripts/build.mjs`/`bundle.mjs` (Rollup) into the plugin folder;
root JS in `com.kotl3r.deckshep.sdPlugin/` (e.g. `claude-hook.js`, `configure-claude.js`, `inspector.js`)
is **generated**. `codex-hook.js`, `configure-codex.js`, `claude-hook.js` are stable integration entry
paths — keep them stable or provide a tested migration. `scripts/profiles.mjs` `RELEASE_BACKENDS` limits
release builds to Rex; Herdr stays behind `experimental.herdr` / `experimental.herdrApp` (default false,
package audits refuse them).

Read before changing an area: `docs/adr/*`, `docs/IDENTITY.md`, `docs/CODEX-HOOKS.md`, `docs/CLAUDE.md`
(Claude provider capabilities), `docs/plans/REFACTOR-PLAN.md`, and for Herdr App ADR 0004/0007,
`docs/plans/HERDR-APP-PLAN.md`, `tests/live/APP-CALIBRATION.md`. E2E details: `tests/e2e/README.md`.

## Safety limits

- Never start, stop, attach to or send input to the developer's running Rex, Herdr, Codex or agent
  sessions, and never run the live tests without explicit authorization (see above).
- Keep prompts, transcripts, tokens and home/workspace paths out of logs, errors and packaged
  artifacts. The package audits (privacy/path/default/version) enforce this.
- Push, merge, release, repo visibility changes and marketplace submissions need owner direction.

## Load-bearing behavior

Refactoring freely is fine, including restructuring guards, files and modules. These are things a
refactor can break without any test failing in an obvious way, so change them on purpose:

- **Guards are the product.** Stale-press, identity/process, focus, digest/cursor and
  generation/visibility checks, single-use permits and no-retry delivery stop input from reaching
  the wrong agent. Restructure them freely, but keep what they protect, and make sure a test fails if
  that protection is lost. Consent opt-ins default off.
- **Golden fixtures** (`tests/fixtures/golden/*.json`) capture layout, routing and native traces.
  Regenerating is fine when the change is intended; check the diff and mention it in the PR.
- **Persisted identities break installed users if they change**: plugin UUID `com.kotl3r.deckshep`,
  action UUID `com.kotl3r.deckshep.key`, `PROFILE_IDS`/`PAGE_IDS`, per-key UUID5 ActionIDs,
  `profileScope`, global-settings v2/v1 migration, config-key names, and the hook entry paths
  (`codex-hook.js`, `configure-codex.js`, `claude-hook.js`). See `docs/IDENTITY.md`.
- **Status lines**: DeckShep doesn't write Claude Code or Codex status lines (it only restores a
  recorded original). Tests enforce this (`tests/unit/claude-no-statusline.test.js` and a source scan
  for `/statusline`). Codex setup edits only its own entries in `hooks.json`, never `config.toml`.
- **Release scope**: release builds ship only Rex (`RELEASE_BACKENDS` in `scripts/profiles.mjs`).
  Herdr stays in source behind `experimental.herdr` / `experimental.herdrApp`; package audits
  refuse those flags.
- **Display limits**: key errors are at most 15 characters, inspector messages at most 160.

## Conventions

- Conventional Commits (commitlint runs in CI).
- PR descriptions note any behavior change, golden-fixture changes and test/coverage impact.
- Don't record validation in `docs/validation/` as passed unless it actually ran.
