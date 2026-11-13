# No status-line changes: hooks-only Claude mode and read-only Codex footer

> Historical implementation plan. DeckShep still preserves user status lines. Claude now supports hook-free Rex controls as well as optional hook-backed controls. See the [current Claude guide](../CLAUDE.md) for the requirements of each action.

Status: approved hand-off, 2026-11-08. Owner rule: **DeckShep must never change a
Claude Code or Codex status line.** Claude native controls move to a hooks-only
mode; Codex footer setup becomes read-only.

Read `AGENTS.md` first. All its rules apply: no live tests without `ASW_LIVE=1`
and current authorization, never touch the developer's running agents or real
`~/.claude` / `~/.codex` files, add a test before changing any guard, and keep
golden JSON byte-identical unless a change is justified in writing.

Branch: `codex/no-status-line` (Parts A–C may be separate PRs).

## 1. Background

What the status line gives DeckShep today, and what replaces it:

| Need | Status line (today) | Hooks-only replacement |
| --- | --- | --- |
| Session identity | `session_id` | `session_id` on every hook (already used) |
| Model | `model.display_name` | SessionStart `model` (documented as optional) and PreModelSwitch/PostModelSwitch `from_model`/`to_model` |
| Effort | `effort.level` | `effort.level`, a common hook field (reliably on tool events). No event fires on an effort-only change |
| Session name | `session_name` (includes generated titles) | `session_title` on SessionStart/UserPromptSubmit, only for `--name`/`/rename` names. Fallback: the existing short session-ID label |
| Version | `version` | Already checked from the process executable |
| Freshness | 2 s `refreshInterval` heartbeat | **None.** Replaced by press-time proof (Part A, step 4) |

Sources (re-read at implementation time; fields must be confirmed on the
pinned Claude Code version, see Part A step 1):
[hooks](https://code.claude.com/docs/en/hooks),
[status line](https://code.claude.com/docs/en/statusline).

Code today:

- `src/agents/claude/configure.ts`: `--statusline` installs DeckShep's wrapper
  as `statusLine` (lines ~116–131) and records `originalStatusLine`; `--remove`
  restores it.
- `src/agents/claude/hook.ts`: `--statusline` mode records metadata and chains
  the user's original command.
- `src/agents/claude/state.ts`: `metadataAt` is set only by status-line reports.
- `src/agents/claude/controls.ts` (~lines 411–460): `metadataFresh` requires a
  status-line report within 15 s; otherwise controls are disabled with
  "Wait for fresh Claude status line", except a tracked deck-opened picker or
  a paused question/permission request (5 min).
- `src/app/setup.ts` (~lines 95–149) and the inspector offer the status-line
  option.
- `src/agents/codex/setup-daemon.ts`: the Codex setup button stores a preset in
  `~/.codex/config.toml` slot 0 and drives Codex's `/statusline` picker to add
  `session-id`. `originalStatusLine` is recorded but never restored.

## Part A: Claude hooks-only mode

> **Done (2026-11-10, branch `codex/rex-only-release`).** Step 1 found the
> events on 2.1.319 (Pre/PostModelSwitch since 2.1.251), so this did not stop.
> `effort.level` (tool events only) and `session_title` (custom names only)
> have no documented minimum version, and it is unknown whether
> PostModelSwitch fires for `s`; these are Part D items. The field table is in
> `docs/CLAUDE.md` ("Hooks-only mode"). `state.setupMode` reads the private
> setup record; `hooksOnlyProof` needs `establishedBy` SessionStart or
> UserPromptSubmit on a validated record. In hooks-only mode the Model/Effort
> cycle takes the current setting from the picker and skips the status-line
> wait. Captions live in `record.caption` and show `?` after 30 minutes.
> PostModelSwitch is owned but not a doctor requirement. The native-ended
> request shortcut still needs a status line, so in hooks-only mode a blocked
> request clears on the next hook event. Tests:
> `tests/unit/claude-hooks-only.test.js` and the hooks-only case in
> `tests/unit/claude-cycle.test.js`.

1. **Confirm the hook fields first (fixtures only).** From the docs and the
   pinned native Claude Code version's documented schema, record in
   `docs/CLAUDE.md` which of `model`, `effort.level` and `session_title` appear
   on SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop,
   Notification and Pre/PostModelSwitch, and whether those events exist on the
   pinned version. Anything unconfirmed is a validation item (Part D), not an
   assumption. If PreModelSwitch/PostModelSwitch do not exist on the pinned
   version, model captions come only from SessionStart and DeckShep's own
   picker reads.
2. **Hooks to register.** Extend the owned hook set in `configure.ts` with only
   the events needed (for example PostModelSwitch and Notification
   `idle_prompt`). Keep existing hook commands and paths stable. Setup preview
   shows the exact added entries; removal deletes exactly the owned ones.
3. **Metadata from hooks.** In `state.ts`, accept `model`, `to_model`,
   `effort.level` and `session_title` from root-session hook payloads, with the
   same privacy rules: never store prompts, `last_assistant_message`, tool
   inputs/outputs or transcript paths' contents; hash request inputs as today.
   Track a separate `captionAt` per field. Captions show "last known" and
   render as stale after a documented age; stale captions never enable or
   disable a control.
4. **Press-time proof instead of the heartbeat** (a new mode beside the existing
   check; do not delete the heartbeat code while legacy installs exist):
   - process proof: PID, start time, executable path and version, and the
     pane's foreground process, all matching the record
   - lifecycle proof: the record's root session was established by SessionStart
     or UserPromptSubmit for this process, its lifecycle epoch is current, and
     no SessionEnd, `clear`/`resume` SessionStart for another session or
     invalidation has occurred since
   - pane proof: a fresh read immediately before input shows the expected
     native dialog/picker (already required by every Claude control)
   - all existing guards stay: default keybindings, focus checks,
     generation/visibility, request digests, single-use permits, no retry
   Implement as `controlsFresh = hooksOnlyProof || metadataFresh || trackedPicker
   || pausedRequest`, where `hooksOnlyProof` is only evaluated when the install
   has no DeckShep status line. Rename the user-facing error to describe what is
   missing (for example "Wait for a Claude prompt"), keeping key errors ≤15
   characters.
5. **Model/Effort keys.** They already read the native picker before changing
   anything. Keep that; after a session-only change, update the caption from
   the verified picker result (and from PostModelSwitch if it arrives).
6. **Tests first** (unit + integration with fixtures):
   - hooks-only mode enables controls with process + lifecycle + pane proof and
     no status-line report
   - each proof missing alone keeps controls disabled (process restarted,
     PID reused with a new start time, different root session, SessionEnd,
     `/clear`, stale lifecycle epoch, pane showing an unrecognized dialog)
   - captions update from SessionStart, PostModelSwitch and tool-event effort,
     go stale with age, and never affect control availability
   - prompts, assistant messages and tool payloads are never written to state
     or logs (extend the existing privacy tests)
   - existing heartbeat-mode tests still pass unchanged

## Part B: Remove the status-line option, keep legacy removal

> **Done (2026-11-10, branch `codex/rex-only-release`).** `plan()` refuses
> `statusline` unless removing (`STATUSLINE_REFUSED`); the inspector's
> "Chain the existing Claude status line" checkbox is gone. New
> `restoreStatusLine` (`--restore-statusline`, panel **Restore your original
> status line**) restores the recorded original over DeckShep's own wrapper,
> keeps hooks and sets `registry.statusline=false`, so the install becomes
> hooks-only. The button shows only when the doctor reports
> `legacyStatusLine`. Removal is unchanged: like restore, it puts the original
> back only while DeckShep's wrapper is still the status line, and leaves a
> user-changed one alone. `hook.ts --statusline` is unchanged. Guard:
> `tests/unit/claude-no-statusline.test.js` (every fixture × option, plus a
> source scan). Legacy fixtures come from `tests/helpers/claude-legacy.js`.

1. `configure.ts`, `configure-entry.ts`, `src/app/setup.ts` and the inspector:
   no path can install or modify `statusLine`. `--statusline` with `--apply`
   fails with a clear message pointing to removal.
2. Legacy installs: keep `hook.ts --statusline` working (it still chains the
   user's original command) so existing settings do not break, and keep
   `--remove` restoring the saved `originalStatusLine` with its current
   refusal when the user changed it since. The setup panel offers
   "Restore your original status line" for installs that have the wrapper.
3. Add a test that fails if any setup, apply or migration path writes or edits
   `statusLine` in a Claude settings fixture, other than restoring the
   recorded original during removal.

## Part C: Codex footer becomes read-only

> **Done (2026-11-10, branch `codex/rex-only-release`).** `setup-daemon.ts`
> exports a read-only `check`; `statusLineWithId` and
> `Setup.currentStatusLine` are removed. A footer without an ID raises
> `FOOTER_MISSING`, and Model, Effort, Reviewer, Mode and Interrupt show
> **No footer ID**. Trace: in Rex, every contextual Codex action except Zoom
> and blocked-state question/approval actions re-reads the footer
> (`needsChat`), so Interrupt, Stop terminals, prompt staging, Send, Steer and
> Queue also need it. Questions and approvals do not. Restore guidance is in
> `docs/UNINSTALL.md`. Tests: `tests/unit/read-only-footer.test.js`.

1. `setup-daemon.ts`: remove the preset write and `/statusline` picker
   automation. Setup instead checks whether the footer already shows a session
   ID and, if not, explains in the panel how the user can enable it in Codex
   themselves (DeckShep sends nothing).
2. Rex Codex controls that need the footer (Model, Effort, Reviewer,
   Plan/Default, Stop terminals) stay available only when the user-configured
   footer is readable; otherwise they render inactive with a short reason.
   Trace whether question/approval navigation and Interrupt also depend on the
   footer and document the result.
3. Existing installs: document in `docs/UNINSTALL.md` / `docs/INSTALL.md` how to
   restore the previous footer, using the recorded `originalStatusLine` (the
   doctor can print it). Do not automate the restore, since that would drive
   the status-line picker again. Leave any slot-0 preset DeckShep recorded as
   its own untouched unless the user removes it; document how.
4. Tests: setup never sends `/statusline` or writes presets; Codex controls
   in Rex become inactive without a readable footer and work with a
   user-configured one; Herdr (title identity) is unaffected.

## Part D: Docs, rules and validation

> **Docs and rules done (2026-11-10, branch `codex/rex-only-release`).**
> `AGENTS.md` carries the rule; `docs/CLAUDE.md`, `INSTALL.md`,
> `UNINSTALL.md`, `PRIVACY.md`, the README tables, the generated
> `COMPATIBILITY.md`, `CHANGELOG.md` and `RELEASE-NOTES.md` are updated, and
> `HERDR-APP-PLAN.md` Phase 3 (Milestone 2) names the identity rules. Step 4's
> live items are in `docs/BETA-CHECKLIST.md`, unchecked; they need the owner's
> explicit authorization. Herdr parts of step 4 are deferred with Herdr.

1. `AGENTS.md`: add the rule "DeckShep never changes a Claude Code or Codex
   status line; it may only restore a recorded original during removal."
2. Update `docs/CLAUDE.md`, `docs/INSTALL.md`, `docs/UNINSTALL.md`,
   `docs/PRIVACY.md`, README capability tables, `docs/COMPATIBILITY.md`
   (generated) and release notes.
3. Update `HERDR-APP-PLAN.md` Milestone 2: Claude controls use hooks-only proof;
   Codex identity uses title or daemon identity, never the footer.
4. Live validation items for `docs/BETA-CHECKLIST.md` (authorized, isolated
   config directory, disposable sessions only):
   - which hook fields arrive on the pinned version, per event
   - whether PostModelSwitch fires for a session-only (`s`) model change
   - idle sessions: controls remain available via press-time proof; `/clear`,
     `/resume` and restart correctly revoke them
   - Model/Effort cycles, questions/approvals and Interrupt in Rex and Herdr
     with no status line installed
   - legacy install: removal restores the original status line

## Hand-back

Stop after Part A step 1 if the pinned version lacks the fields Part A relies
on, and report. Otherwise one PR per part. Report commits, check results, new
tests, golden changes (expected none) and every unconfirmed hook field.
