# Architecture and key behavior

Read this reference before changing module boundaries, event handling, rendering,
key layout or backend/provider composition. Paths below are repository-relative.


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
- The Rex controller schedules focused settings reads. `src/app/rex-settings-observations.ts`
  shares pending reads for the same focus and rechecks the live roster before
  publishing. A confirmed picker change retires the old read and releases its
  waiters immediately. A brief redraw can preserve a caption for the same
  process. The next settings press still requires fresh pane evidence.
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
the previous page. In the Herdr App scope, rows 1–2 use the App's local agent
roster and stable slots. The dot follows the App report. Attention rechecks the
displayed target and reason before selection or a consented focus request.
App provider overrides stay inactive and the third row defaults to blank.
App selection changes reveal its bank once; identical polls preserve later Page
browsing. Production verifies Herdr’s publisher, live peer, helper and command
contract without a marketing-version pin. It grants no provider capability.

`src/domain/app-roster.ts` owns App slots, deck selection and bank browsing.
The controller uses one frozen roster view for key faces and press capture.
An acknowledged focus request reconciles the preflight App observation and the
deck choice together. Suspension keeps slot order for recovery, while source
retirement resets the roster. The controller owns source lifetime and fresh
press checks, including Next and Attention ranking against the captured slots.

Before extending App input, read
`docs/plans/HERDR-APP-MODEL-PRODUCTION-PLAN.md` and
`docs/plans/herdr-app-agent-controls/herdr-mod-model-delivery-prototype.md`.
The test-only mod/Model and fixed Core input-gate probes are described in
`tests/e2e/README.md`. Native evidence on Core 0.1.21 includes input after expiry
and writer closure; a successful prototype is no input qualification. The
App 0.1.16 full navigation run also failed its background-editor assertion.
Preserve that open evidence when reviewing launch readiness.

In Rex, rows 1-2 use Rex discovery, status, titles and physical pane
selection and must not depend on provider hooks or daemons; row 3 carries the
provider-specific identity and input guards. Zoom and the separate Questions and
Prompts pages were removed by the owner (2026-11-10); saved overrides for them
stay inactive.

Read before changing an area: `docs/adr/*`, `docs/IDENTITY.md`,
`docs/CODEX-HOOKS.md`, `docs/CLAUDE.md` (Claude provider capabilities),
`docs/PROFILES.md`, and for Herdr App ADR 0004/0007/0008,
`docs/plans/HERDR-APP-PLAN.md` and `tests/live/APP-CALIBRATION.md`. E2E details
are in `tests/e2e/README.md`. `docs/plans/REFACTOR-PLAN.md` is historical.
