# DeckShep architect plan (living spec)

Record of the 2026-11-11 audit/refactor pass (complete; kept for reference) on branch `claude-refactor`.
Subagents: read this file and `CLAUDE.md` first. Stay inside the files your work
package owns. Nothing here is committed, pushed or installed.

## Ground rules (all packages)

- Never run: `scripts/install.mjs`, `npm run dev`, `streamdeck restart`,
  `scripts/migrate-upgrade.mjs`, `npm run test:live`, anything in `tests/live/`,
  setup/configure commands, or anything that touches a running Rex, Herdr, Codex
  or agent session. Fixture tests only.
- Guards are the product. No package may remove or weaken a stale-press,
  identity, focus, digest, generation/visibility, permit or no-retry check.
  A new input path must go through the existing guarded `deliver()`.
- Persisted identities are frozen: plugin/action UUIDs, `PROFILE_IDS`/`PAGE_IDS`,
  per-key ActionIDs, `profileScope`, settings v1/v2 codec, config-key names,
  existing ControlId strings, hook entry paths. New ControlIds may be added.
- Do not commit, push, or edit `CLAUDE.md`, `AGENTS.md`, `.github/`, `docs/adr/`.
- Do not lower coverage thresholds, add lint suppressions or `@ts-expect-error`.
- Done means: `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run deps`, `npm test` all pass, and the package's own acceptance criteria.
  Report what ran and its real result; report anything skipped.

## Audit findings that drive the work

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | Every 250 ms tick rebuilds the SVG and base64-encodes all 15 keys, then dedupes by comparing the finished string | `src/app/controller.ts` `render()` |
| F2 | Each host frame is JSON-stringified by the app, then JSON-parsed and zod-validated by the adapter; inbound events are stringified and re-parsed too | `controller.ts` `emit`/`receive`, `src/plugin/entry.mts` `HostPort.send` |
| F3 | `render()` holds a 330-line inline label/colour table inside a 1,700-line closure; it cannot be unit-tested | `controller.ts:451-827` |
| F4 | `keyUp` is forwarded and ignored; there is no long-press | `entry.mts:65`, no consumer in `src/app` |
| F5 | Keys 8 and 9 are always blank; 5-7 are blank in simple setups | `src/domain/layout.ts` `rawLayout` |
| F6 | Agents needing attention outside the current bank are invisible, and reaching them takes Page + key | controller `bankLines`, layout |
| F7 | States differ only by colour plus 11 px text: ready/done, question/approval, working/background, closed/none/offline | `src/render/signal.ts`, `config.json` palette |
| F8 | Text is shrunk to fit (down to about 8.5 px) instead of being shortened | `signal.ts:182-201` |
| F9 | Offline empty slot emits a `<text y="undefined">` second line | `signal.ts:159-168` |
| F10 | Press errors are cut mid-word at 15 characters ("Controls updati") | `controller.ts:340`, `1217` |
| F11 | A press queued behind a slow action runs seconds after the physical press | `controller.ts` keyDown queue |
| F12 | On a Rex timeout the clipboard helper exits without restoring the user's clipboard | `native/visible-pane.swift:33-36` |
| F13 | About 1,130 `any` in `src`; pure layers still use `require`/`module.exports` and `(agent as any).state` | `src/domain`, `src/guards`, `src/render`, `src/platform`, `src/terminals` |
| F14 | Herdr TUI socket path errors can carry a filesystem path | `src/terminals/herdr-tui/rpc.ts:149` |

Audited and left alone: host disconnect exits and Stream Deck relaunches the
plugin; an offline backend is retried by the 2 s refresh and the Rex discovery
cache is cleared on failure; delivery has no retry loop by design (ADR 0002).

## Target architecture

```
Stream Deck host
   │  typed events (no JSON hop)
src/plugin/entry.mts ── HostPort.deliver(frame) / app.receive(event)
   │
src/app/controller.ts      serial press queue, runtime per profile scope
   ├─ press-gesture.ts     keyDown/keyUp → 'tap' | 'hold' (pure, injected timers)
   ├─ key-face.ts          pure: (action, view state) → KeySpec
   └─ delivery.ts          unchanged single guarded deliver()
src/render/
   ├─ spec.ts              KeySpec contract
   ├─ frame.ts             KeySpec → cached data-URI (LRU), spec-key dedupe
   └─ signal.ts/visuals.ts SVG drawing only
```

### Contract: `KeySpec` (`src/render/spec.ts`)

```ts
export type AgentFaceState =
  | 'ready' | 'working' | 'background' | 'question' | 'approval'
  | 'done' | 'error' | 'unknown' | 'closed' | 'empty' | 'offline';

export interface KeySpec {
  icon: string;        // lucide glyph id, 'codex' | 'claude-code', 'blank', 'empty'
  lines: string[];     // at most 3
  color: string;       // #rrggbb surface/state colour
  pulse: number;       // 0..0.22
  badge: '' | 'selected';
  accent: string;      // #rrggbb rail/icon tint
  style: string;       // config.appearance.style ('signal' default)
  textOnly: boolean;
  agent: boolean;
  // Wave 2 fields. Absent means today's look.
  state?: AgentFaceState; // agent keys: shape-coded state glyph
  dim?: boolean;          // unavailable control: dimmed text and rail
  hold?: boolean;         // key has a long-press action: corner tick
}
```

### Contract: frame cache (`src/render/frame.ts`)

```ts
export interface FrameCache {
  /** Returns the data URI; identical specs return the cached string. */
  image(spec: KeySpec): string;
  /** Stable identity of a spec, cheap to compare per key per tick. */
  key(spec: KeySpec): string;
}
export function createFrameCache(
  draw: (spec: KeySpec) => string, // returns SVG text
  capacity?: number,               // default 256, least-recently-used eviction
): FrameCache;
```

The controller keeps `k.lastSpecKey`. A tick that produces the same spec key
does no SVG build, no base64 and no `setImage`. `setTitle('')` is sent once per
key appearance, not with every image.

### Contract: press gesture (`src/app/press-gesture.ts`)

```ts
export const HOLD_MS = 450;
export interface GesturePorts {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface PressGestures {
  /** Returns true when the key has a hold action and the tap must wait. */
  down(context: string, hasHold: boolean, fire: (kind: 'tap' | 'hold') => void): void;
  up(context: string): void;      // fires 'tap' if the hold has not fired
  cancel(context: string): void;  // willDisappear: drop without firing
}
```

- Key with no hold action: `tap` fires on keyDown, exactly as today (no added latency).
- Key with a hold action: `tap` fires on keyUp; `hold` fires at 450 ms while still held.
- The press context is always the one presented at keyDown (`pressedAt` = keyDown time).
  A hold replaces only `action`; every guard runs unchanged on that context.

### Stale queued press (F11)

`press()` refuses a press that waited more than `QUEUE_STALE_MS = 2000` between
`pressedAt` and the moment it starts executing: no input, key feedback
"Press again". Uses the same clock that stamped `pressedAt`.

## UX and key-matrix spec (MK.2, 5×3, 72×72 px; drawn at 144×144)

Single page, no folders. Row 1 is telemetry, row 2 is navigation, row 3 is the
selected agent's controls.

| | col 0 | col 1 | col 2 | col 3 | col 4 |
| --- | --- | --- | --- | --- | --- |
| Row 1 | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
| Row 2 | Next agent | Page | Collapse | (blank) | **Attention** |
| Row 3 ready | Model | Effort | Permissions | Mode | Interrupt |
| Row 3 working | Steer | Queue | Permissions | (blank) | Interrupt |
| Row 3 background | (blank) | (blank) | Permissions | (blank) | Stop |
| Row 3 question | Up | Down | Confirm | Esc | Interrupt / Toggle |
| Row 3 approval | Up | Down | Confirm | Esc | Interrupt |

Row 3 is unchanged from today (set by the owner in a5053b0). Changes:

| Key | Tap | Hold (450 ms) |
| --- | --- | --- |
| Agent 1-5 | Focus that agent | none |
| Next agent | Focus next agent | Focus previous agent (`bridge.navigate(-1)`, same guarded focus path) |
| Page | Next bank | Previous bank (local) |
| Attention (new, key 9) | Focus the first other agent that needs you | none |
| All row 3 keys | As today | none |

**Attention key** (`attention`, new ControlId, local navigation + the same guarded
focus used by agent keys):

- Candidates: every discovered agent except the selected one, in slot order,
  ranked blocked (permission or question) > error > done.
- No candidate: the key maps to `none` (blank), like Next/Page/Collapse do today.
- Face: count as the large line, kind as the caption: `2` / `WAITING`, `1` / `ERROR`,
  `1` / `DONE`. Colour follows the top candidate's state colour.
- Press: focus the top candidate, exactly as pressing its agent key would
  (`bridge.focus(display.target)` with the target captured at render), then move
  the bank to that agent's slot.

**72×72 visual rules**

1. State is never colour-only. Agent keys carry a shape glyph in the status row:
   ready ●, working ▶, background ◐, question ?, approval !, done ✓, error ✕,
   unknown/closed/empty ○. Glyphs are drawn as paths, not font characters.
2. Agent key: line 1 name (26 bold), line 2 project (22), status row = glyph +
   status word (24 bold). Status words: READY, WORKING, BG TASK, ASK, APPROVE,
   DONE, ERROR, UNKNOWN.
3. Minimum drawn text size is 20 units (10 px). Text that would need to shrink
   below that is shortened with an ellipsis instead. `Stop terminals` becomes
   `Stop` / `N terminals`.
4. Unavailable controls (`dim`): text `#8f97ab`, rail `#3a4155`, no icon tint.
   Blank keys (`none`) draw no rail at all.
5. Keys with a hold action show a small corner tick (bottom-right, 10 units).
6. Offline empty slot: one centred line `Rex offline` (fixes F9).
7. Press feedback text never cuts mid-word: use the clause before `;` when it
   fits in 15 characters, else a fixed short label, else whole words plus `…`.
   Short labels: "Press again" for changed/updating/expired contexts,
   "Select agent", "Target changed".
8. Pulse is quantised to 0.02 steps so animated frames hit the frame cache.

Palette values in `config.json` are a user-facing config key and stay as they are.

## Work packages

Wave 1 (done)

- [x] **T1 Key face + frame cache**. `controller.ts` 1,723 → 1,445 lines; new
  `src/app/key-face.ts`, `src/render/spec.ts`, `src/render/frame.ts`. Zero
  visual change (e2e SVG hashes and goldens untouched). 480 pass, 0 fail.
- [x] **T2 Strict pure layers**. `any` and `require(` are 0 in `src/domain`,
  `src/guards`, `src/platform`, `src/terminals/rex`, `src/terminals/herdr-tui`;
  `no-explicit-any` enforced there. F14 fixed in `connect()` and `exchange()`.
- [x] **T3 Clipboard restore on timeout** (`native/visible-pane.swift`).
  Type-checks; not exercised (needs a live Rex).

Wave 2 (done)

- [x] **T4a Drawing primitives**. State glyphs, `dim`, `hold` tick, blank keys,
  two-line centred slots, 20-unit text floor, `attention` glyph, pulse steps.
  Lead additions: whole-word caption wrapping, real Arial widths
  (`src/render/metrics.ts`), shrink-to-fit kept for agent keys without `state`.
- [x] **T5 Input path**. Typed host bridge (`src/app/host-frame.ts`), tap/hold
  (`src/app/press-gesture.ts`), stale queued press refusal, Attention key,
  `state`/`dim`/`hold` on specs. No golden change. `navigate(-1)` was already
  safe on Rex and Herdr TUI.

Wave 3

- [x] **T4b Labels**: status words, fixed captions, `keyMessage` press feedback.
  Golden change: `controller-refusals.json`, 8 caption strings only.
- [x] **T6 Integration review** (lead): guard paths read; contact sheet and e2e
  screenshots inspected.
- [x] **T8 Docs**: `CHANGELOG.md`, `README.md` key table, `docs/PROFILES.md` key map.
- [x] **T7 Verification**: lint, format, typecheck, deps, knip, version and
  compatibility checks, 548 tests (544 pass, 0 fail, 4 skipped), golden 4/4,
  coverage 95.11 lines / 91.75 functions / 87.36 branches (thresholds pass),
  build, bundled 4/4, e2e 36/36, package. Nothing committed or installed.

## Not done in this pass (candidates for follow-up)

- `src/app` and `src/agents` still hold about 1,050 `any` and use `require`.
- `controller.ts` is still one 1,550-line closure; the inspector request
  handler and the per-scope runtime are the next extractions.
- Four hand-rolled line/stdio framers and two socket-endpoint validators remain
  separate (`herdr-tui/rpc.ts`, `herdr-app/line-client.ts`,
  `herdr-app/focus-sender.ts`, `platform/app-peer-session.ts`).
- `nextModel` exists four times across the Codex and Claude providers.
- Herdr App view captions were not reworded for the new text floor.
- The clipboard-restore fix is compiled but not exercised against a live Rex.
- Hold gestures and the Attention key have fixture coverage only; no hardware press.

## Log

- 2026-11-11: baseline green (465 pass, 4 skipped, 0 fail; lint, format,
  typecheck, deps, knip, golden, build all exit 0).
- 2026-11-11: wave 1 integrated; T2 reported 485 tests, 481 pass, 0 fail.
- 2026-11-11: waves 2 and 3 integrated; after T4b: 542 tests, 538 pass, 0 fail, 4 skipped; e2e 36/36.
