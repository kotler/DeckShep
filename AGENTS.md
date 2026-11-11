# DeckShep standing instructions

DeckShep is a macOS Stream Deck plugin (`com.kotl3r.deckshep`) for the 15-key
Stream Deck MK.2. It controls coding agents (Codex CLI, Claude Code) that are
already running in a terminal multiplexer: **Rex** (released), and **Herdr TUI**
and **Herdr App** (in source, experimental, not packaged). Most of the code is
_guards_: proof that a key press still targets the same agent, process, pane and
state it was rendered for before any input reaches a terminal.

These instructions apply to every agent working in this repository. Keep them
current when commands, architecture or owner decisions change.

## Commands

Node 22.13+ (`.nvmrc` selects 22) and macOS Command Line Tools (Swift builds the
helpers in `native/`). The root is an npm workspace
(`com.kotl3r.deckshep.sdPlugin`, `tools`); dev tools run through `scripts/tool.mjs`.

```sh
npm ci
npm test                                   # all node:test groups (tests/**/*.test.js via tsx)
node --import tsx --test tests/unit/attention.test.js                 # one file
node --import tsx --test --test-name-pattern="<regex>" <file>         # one test
npm run test:golden                        # golden layouts, routing, native traces, refusals
npm run test:coverage                      # c8; thresholds in .c8rc.json
npm run typecheck                          # strict TS, src + tsconfig.e2e.json; no suppressions
npm run lint && npm run format:check       # golden JSON must stay byte-stable
npm run deps                               # dependency-cruiser layer rules
npm run knip                               # unused files/deps; confirm with rg before deleting
npm run version:check && npm run compatibility:check
npm run build                              # or: npm run build -- --universal (never installs or restarts)
npm run test:bundled                       # tests against the built bundle
npm run package                            # validate, pack and audit locally; never uploads
npm run clean                              # removes only dist/ and coverage/
npm run deck:preview                       # synthetic 15-key browser deck on a random loopback URL
npm run e2e:install && npm run test:e2e    # Playwright virtual deck (macOS baselines)
```

CI (`.github/workflows/ci.yml`, macos-15) runs lint, format:check, typecheck,
deps, version and compatibility checks, `marketplace:media && marketplace:check`,
test:coverage, test:bundled, npm audit, commitlint, a universal build, Elgato
validate and package, plus a separate e2e job.

Regenerate golden fixtures only on purpose, with `ASW_UPDATE_GOLDEN=1` (see
`tests/fixtures/golden/README.md`), and read the diff. `npm run test:e2e:update`
regenerates the OS-specific screenshots; `tests/e2e/expected/svg-sha256.json` is
regenerated separately (see `tests/e2e/README.md`). Do either only for an
intended visual change and say so in the PR. Never lower a coverage threshold to
hide a regression.

### Never run as verification

`scripts/install.mjs`, `npm run dev`, `streamdeck restart`,
`scripts/migrate-upgrade.mjs` against the real HOME, optional setup/configure
commands, or anything in `tests/live/` (`npm run test:live`). Live tests need
`ASW_LIVE=1` **and** explicit current authorization (Rex also `ASW_LIVE_REX=1`
plus PID ownership proof; Herdr App `ASW_LIVE_HERDR_APP=1` /
`ASW_LIVE_HERDR_APP_RELEASE=1`). Never start, stop, attach to or send input to
the developer's existing Rex, Herdr, Codex daemon or agents. Fixture tests may
only touch their own process and private temp sockets and files. Historical
validation logs are evidence, not permission to rerun anything.

## Architecture

Two independent axes, composed only in `src/app` (ADR 0001):

- **Terminal backends** (`src/terminals/{rex,herdr-tui,herdr-app}`, contract in
  `src/terminals/contract`) own discovery, topology, native focus, reads and
  delivery.
- **Providers** (`src/agents/{codex,claude}`, interface in `src/agents/shared`)
  own identity, state and control semantics.
- A control is available only where provider support meets _verified_ backend
  capabilities (ADR 0003). Herdr TUI has no verified composer cursor.

Layers. `npm run deps` (`.dependency-cruiser.cjs`) enforces that domain imports
nothing, guards import only domain, agents and terminals never import each
other, app or plugin, and only plugin imports the Stream Deck SDK; the other
rows are conventions:

| Layer | Holds | May import |
| --- | --- | --- |
| `src/domain` | types, layout tables, labels, capabilities, navigation ranking | nothing |
| `src/guards` | press pipeline, permits, context stamps | domain |
| `src/platform` | exec, paths, process info | node builtins, domain |
| `src/agents/*`, `src/terminals/*` | providers and backends | domain, guards, platform, schemas; never each other, app or plugin |
| `src/render` | `KeySpec`, frame cache, text metrics, SVG drawing | domain, platform |
| `src/app` | controllers, delivery, key faces, gestures, preferences, setup | everything except plugin |
| `src/plugin` | entry points | the only place that imports `@elgato/streamdeck` |

### Event and render flow

- `src/plugin/entry.mts` forwards host events (`willAppear`, `willDisappear`,
  `didReceiveSettings`, `keyDown`, `keyUp`, `sendToPlugin`) to
  `app.receive(event)` as objects, validated against the `hostEvent` schema.
  The app sends typed `HostFrame`s (`src/app/host-frame.ts`) through
  `HostPort.deliver`; string sockets remain for test fixtures.
- Presses run on one serial queue in `src/app/controller.ts`. A press acts on
  the context _presented at key-down_ (`k.presented`, `pressedAt`); it is never
  re-captured at execution time. A press that waited more than
  `QUEUE_STALE_MS` (2000) is refused with "Press again".
- `src/app/press-gesture.ts` turns key-down/key-up into `tap` or `hold`
  (`HOLD_MS` 450). A key with no hold action taps on key-down. A hold replaces
  only the action and passes the same guards. No holds in the `herdr-app` scope.
- Input reaches a terminal only through the guarded `deliver()` in
  `src/app/delivery.ts`, with a single-use permit and no retries (ADR 0002).
- Rendering: `render()` gathers per-key inputs, `src/app/key-face.ts` (pure)
  returns a `KeySpec` (`src/render/spec.ts`), and `src/render/frame.ts` caches
  the encoded image by spec. A tick that changes nothing builds and sends
  nothing. `src/render/signal.ts` draws the default style.
- External data is validated at the boundary with zod schemas in `src/schemas`
  (ADR 0006).

`scripts/build.mjs` and `bundle.mjs` (Rollup) bundle the TypeScript into the
plugin folder; root JS in `com.kotl3r.deckshep.sdPlugin/` (`claude-hook.js`,
`configure-claude.js`, `codex-hook.js`, `configure-codex.js`, `inspector.js`,
`preferences.js`) is **generated**.

### Key map (5×3, one page, no folders)

| | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- | --- |
| Row 1 | Agent | Agent | Agent | Agent | Agent |
| Row 2 | Next agent | Page | Collapse | | Attention |
| Row 3, ready | Model | Effort | Permissions | Mode | Interrupt |
| Row 3, working | Steer | Queue | Permissions | | Interrupt |
| Row 3, background | | | Permissions | | Stop |
| Row 3, question or approval | Up | Down | Confirm | Esc | Interrupt or Toggle |

Row 2 keys appear only when useful: Next with two or more agents, Page with
more than one bank of five, Collapse with gaps, Attention when another agent is
waiting, errored or done. Hold Next agent for the previous agent and Page for
the previous page. Rows 1-2 use Rex discovery, status, titles and physical pane
selection and must not depend on provider hooks or daemons; row 3 carries the
provider-specific identity and input guards. Zoom and the separate Questions and
Prompts pages were removed by the owner (2026-11-10); saved overrides for them
stay inactive.

Read before changing an area: `docs/adr/*`, `docs/IDENTITY.md`,
`docs/CODEX-HOOKS.md`, `docs/CLAUDE.md` (Claude provider capabilities),
`docs/PROFILES.md`, and for Herdr App ADR 0004/0007,
`docs/plans/HERDR-APP-PLAN.md` and `tests/live/APP-CALIBRATION.md`. E2E details
are in `tests/e2e/README.md`. `docs/plans/REFACTOR-PLAN.md` is historical.

## Load-bearing behavior

Refactoring is fine, including restructuring guards, files and modules. These
are things a refactor can break without an obvious test failure, so change them
on purpose:

- **Guards are the product.** Stale-press, identity/process, focus,
  digest/cursor and generation/visibility checks, single-use permits, the
  350 ms arming delay and no-retry delivery stop input from reaching the wrong
  agent. Keep what they protect, and make sure a test fails if that protection
  is lost. A new input path goes through the existing `deliver()`.
- **Consent defaults are off.** Clipboard/visible-pane consent, Herdr title
  identity, Claude native controls and Claude/Codex hooks are all opt-in. Fewer
  setup steps never imply consent.
- **Golden fixtures** (`tests/fixtures/golden/*.json`) capture layout, routing,
  native traces and refusal captions. Regenerate only for an intended change,
  check the diff and mention it in the PR.
- **Persisted identities break installed users if they change**: plugin UUID
  `com.kotl3r.deckshep`, action UUID `com.kotl3r.deckshep.key`,
  `PROFILE_IDS`/`PAGE_IDS`, per-key UUID5 ActionIDs, `profileScope`, the
  global-settings v2/v1 migration, config-key names, existing ControlId strings
  (saved as per-key overrides) and the hook entry paths (`codex-hook.js`,
  `configure-codex.js`, `claude-hook.js`). New ControlIds may be added. See
  `docs/IDENTITY.md`.
- **Status lines**: DeckShep never writes a Claude Code or Codex status line; it
  only restores a recorded original. `tests/unit/claude-no-statusline.test.js`
  and a source scan for `/statusline` enforce this. Codex setup edits only its
  own entries in `hooks.json`, never `config.toml`.
- **Release scope**: release builds ship only Rex (`RELEASE_BACKENDS` in
  `scripts/profiles.mjs`). Herdr stays in source behind `experimental.herdr` /
  `experimental.herdrApp` (default false; package audits refuse them). Do not
  delete Herdr code or tests.
- **Display limits**: key feedback is at most 15 characters and never cut
  mid-word (`keyMessage` in `src/domain/labels.ts`); inspector messages are at
  most 160. Key text is never drawn below 20 SVG units (10 px): fixed captions
  must fit, dynamic text wraps at a space or ends with an ellipsis. Agent state
  is shown by shape as well as colour.
- **Privacy**: keep prompts, transcripts, tokens and home/workspace paths out of
  logs, errors and packaged artifacts. The package audits
  (privacy/path/default/version) enforce this.

## Code conventions

- `src/domain`, `src/guards`, `src/platform`, `src/terminals/rex` and
  `src/terminals/herdr-tui` are strictly typed with ES imports;
  `no-explicit-any` is an error there. `src/app` and `src/agents` still carry
  untyped legacy code (`any`, `require`); type what you touch and write new
  modules without `any`.
- No `@ts-expect-error`, `@ts-ignore` or lint suppressions.
- Keep pure logic out of the controller closure: captions and colours belong in
  `key-face.ts`, ranking and layout tables in `src/domain`, drawing in
  `src/render`.
- Comments explain why a guard exists (link the ADR or validation record).
- Do not record validation in `docs/validation/` as passed unless it actually
  ran. Fixture and browser tests grant no native or hardware claim.

## Process

- Conventional Commits (commitlint runs in CI).
- PR descriptions note any behavior change, golden-fixture and e2e-baseline
  changes, and test/coverage impact.
- Push, merge, release, repository visibility changes, marketplace submissions,
  display-name changes and anything involving licensing or trademarks need owner
  direction. The software is Apache-2.0 with NOTICE; the DeckShep name and
  branding are reserved (`TRADEMARKS.md`); provider trademark permission is
  still pending.
