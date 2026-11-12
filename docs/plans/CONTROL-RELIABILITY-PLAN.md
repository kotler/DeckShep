# Control reliability plan (2026-11-11)

Status: partly implemented on 2026-11-11; section 9 lists what is done and
what is still open. No live Rex, Claude or Codex session was read or driven for
this document or for the implementation: everything done has fixture coverage
only. Sources are the public docs
listed at the end, `--help` output of the installed CLIs (Claude Code 2.1.322,
Codex 0.167.1, Rex Beta), the Codex protocol schema generated offline with
`codex app-server generate-json-schema --experimental`, the bundled scripts of
the two first-party VS Code extensions (section 3), and the code at commit
`8b25379`.

## 1. Why the controls keep breaking

1. **Claude settings are closed-loop screen automation.** Model, Effort and
   Permissions open a native picker with keys, parse the screen, move, apply
   with `s` and parse again. The parsers match exact wording, glyphs and SGR
   colour sequences (`effort-slider.ts`, `keyboard-mode.ts`, `cycle.ts`,
   `controls.ts`). A Claude release that changes a colour or a row breaks them.
2. **The version pin is gone and nothing replaced it.** Since `7f3e31c` every
   Claude auto-update is an untested screen layout, and the first sign is a dead
   key on the deck.
3. **Tests check the parser against a hand-written simulator**
   (`tests/helpers/claude-keyboard-screen.ts`), not against frames Claude
   actually drew. Parser and simulator share the same assumptions, so the tests
   pass while the real screen differs. There are no recorded frames in
   `tests/fixtures`.
4. **Screen knowledge is spread over six files** (about 2,900 lines in
   `src/agents/claude`), each with its own regexes. One Claude change needs
   several fixes.
5. **Row 3 availability is a conjunction of many conditions** (`modeOf`,
   `observeFocusedSettings`, keyboard identity, consent flags). When one fails
   the key goes inert without saying which one, so every report starts with a
   code trace.
6. **Rex is polled with one CLI process per call.** A refresh runs `client ls`,
   `ls`, `session inspect`, then `process`, `program_status` and `title` per
   pane. One slow call fails the whole discovery, which is the likely cause of
   the short-lived keys in row 1.

## 2. What similar projects do

Ten projects were read (list in section 10). None changes model or effort in a
running session; DeckShep is alone there.

| Concern | What they converge on |
| --- | --- |
| Agent state | Claude Code hooks (agentsd, AgentDeck, streamdeck-agent-cockpit, agent-deck). ccmanager parses PTY output and calls it unreliable. muxboard reads only structured sources. |
| Approve / deny | agentsd holds the `PermissionRequest` HTTP hook response open and answers it from the key. Agent Vitals and ccmanager type `1`/`2`/`3` or Enter. |
| Interrupt | Keystrokes everywhere: Ctrl+C to the frontmost window (agentsd) or through `tmux send-keys` behind a confirmed hold (cockpit). |
| Permission mode | Launch flags, or Shift+Tab into a PTY the tool owns (AgentDeck). |
| Model, effort | Launch time only, or display only. |
| Guards | Mostly none. agentsd sends Ctrl+C to whatever is frontmost. muxboard fails closed on ambiguous focus. |

Two ideas are worth taking: hooks as the source of state, and answering an
approval through the hook that asked for it.

## 3. What the first-party VS Code extensions do

Both extensions were downloaded from Open VSX and their bundled scripts read:
Anthropic `claude-code` 2.1.322 and OpenAI `chatgpt` 26.51106.51428. Nothing
was installed or run. Both are proprietary and minified, so these are readings
of behaviour, not of documented interfaces.

**Neither extension controls an agent running in a terminal.** Each starts its
own agent process and speaks a structured protocol to it.

Claude Code extension:

- Panel mode starts the bundled `claude` binary in stream-JSON mode and sends
  control requests: `interrupt`, `set_permission_mode`, `set_model`,
  `apply_flag_settings` (effort) and `set_max_thinking_tokens`. Approvals come
  back as requests through `--permission-prompt-tool=stdio`. State arrives as a
  `session_state_changed` message with a small fixed set of values, including
  `idle` and `requires_action`.
- Terminal mode (`claudeCode.useTerminal`) only launches `claude` in a terminal.
  The terminal session then connects to the extension over a local,
  token-authenticated WebSocket and uses editor tools such as diffs,
  diagnostics and the current selection. There is no model, mode or interrupt
  control on that channel.
- The `interrupt` reply lists messages that are still queued. An interrupt
  does not mean the agent is idle afterwards.

Codex extension:

- It starts its own `codex app-server` over stdio from a bundled binary, with
  the experimental API enabled. It does not attach to the shared daemon that a
  terminal session uses.
- Settings go through `thread/settings/update` and are confirmed by the
  `thread/settings/updated` notification. Interrupt is `turn/interrupt`.
- Several windows coordinate through an owner and follower scheme. A window
  that does not own a thread first asks who does, gets a client ID or
  `no-client-found`, and sends its request to that owner. It never writes to a
  thread it does not own. The interrupt request must carry the expected turn
  ID.
- Approvals are tracked by request ID and cleared when the server reports the
  request resolved. An answer is addressed to a request, never to a position
  on screen.
- The extension keeps one explicit list of the methods and notifications it
  uses.
- This build references methods (`thread/stop`, `turn/addUserMessage`) that the
  installed CLI 0.167.1 schema does not have. The protocol moves between
  builds.
- The follower messages travel over a private socket at `ipc/ipc.sock` in the
  Codex home, inside an owner-only folder. It is undocumented, and the
  installed CLI binary does not contain the follower message names. DeckShep
  should not use it.

What to take from them:

1. Anthropic's own extension has no control channel into a running terminal
   session. This confirms that keys are the only write path for Claude and
   that the effort belongs in reading the screen less.
2. Both vendors get reliability by shipping the exact agent binary their
   client was built against. DeckShep cannot bundle, so the tested-version
   range in P1 is the equivalent.
3. Confirm a settings change from the change notification, not from a second
   look at the same surface. For Codex that is `thread/settings/updated`; for
   Claude it is the `PostModelSwitch` hook.
4. Carry the turn ID seen at key-down into the interrupt. A press drawn for
   one turn can then never stop another.
5. Prove ownership first and refuse when no owner is found. DeckShep already
   works this way; the first-party client does too.
6. Keep one list of external methods used, and test that list against the
   installed schema.
7. Reduce agent state to a few values from one source at a time, with an
   explicit unknown.

## 4. Options per control

### Claude Code (running TUI)

There is no local, non-keystroke write path into a running interactive session.
The Agent SDK's `interrupt()`, `setPermissionMode()` and `setModel()` work only
for sessions the SDK started. Remote Control goes through claude.ai. So keys
stay; the gains are in reading less of the screen and reading state from
structured sources.

| Control | Today | Better option | Verdict |
| --- | --- | --- | --- |
| Model | `alt+p`, parse picker, arrows, `s`, parse again | Same keys. Confirm the result with the `PostModelSwitch` hook (`from_model`, `to_model`), already registered by `configure.ts`, when hooks are on | Do it (P3) |
| Effort | `/effort` slider or picker arrows, colour-matched | (a) Hook input carries `effort.level` on tool events: use for read-back. (b) Typed `/effort <level>` applies at once with no slider, but saves the level as the user default except `max` | (a) yes. (b) owner decision D1 |
| Permissions | One `shift+tab`, screen read | Hook input carries `permission_mode`; the cycle order is documented (default, acceptEdits, plan, then bypass and auto when enabled). Record the mode from hooks and show the expected next mode | Do it (P3) |
| Interrupt | One `escape` after spinner or hint check | Keep Escape (`chat:cancel`). Ctrl+C is not rebindable but exits Claude on a second press when idle | Keep |
| Approve / deny | Hook identity plus recognised dialog plus one key | Answer through the `PermissionRequest` hook: `decision.behavior` `allow` or `deny`. No screen read and no focus check, because the reply goes to the request that asked | Spike (P4), owner decision D2 |
| Questions | Recognised option list plus keys | No hook answer path is documented | Keep |
| Queue / Steer | `ctrl+x enter`, `ctrl+x ctrl+s` | These are the documented defaults (`chat:queueSubmit`, `chat:sendNow`) | Keep |
| Custom keybindings | Controls disabled | Read `keybindings.json` and map `chat:cycleMode`, `chat:modelPicker`, `chat:cancel` | Later |

Also available and unused: Claude command hooks run as children of the Claude
process, so they should inherit `REX_SESSION` and `REX_BLOCK`. That would bind a
hook record to its pane directly. The Codex hook already reads these; the Claude
hook does not. To be verified in P0.

The Claude status line receives `model.id` and `effort.level` and reruns on
permission-mode changes. It would be the best read source, but DeckShep does not
write status lines, and this plan does not reopen that.

### Codex

Codex has a real API, and the daemon client already uses part of it.

| Control | Today | Better option | Verdict |
| --- | --- | --- | --- |
| Model, Effort, Permissions, Mode | `thread/settings/update` when thread identity is proven, keyboard pickers otherwise | Already the right call. The 0.167.1 schema confirms `threadId`, `model`, `effort`, `approvalPolicy`, `sandboxPolicy`, `collaborationMode`, `permissions`, and a `thread/settings/updated` notification | Keep, add drift check (P1) |
| Interrupt | One `escape` key | `turn/interrupt {threadId, turnId}`. The turn ID is a built-in stale guard | Do it where thread identity is proven (P5) |
| Stop background | `thread/backgroundTerminals/terminate` | Also `thread/backgroundTerminals/clean {threadId}` | Keep |
| Steer / Queue | Keys on the typed draft | `turn/steer {threadId, expectedTurnId, input}` and `thread/queue/add` exist but need the text, which lives in the composer | Keep keys |
| Approvals | Keys on the native dialog | Codex hooks include `PermissionRequest` with the Claude schema, and hook input carries `model`, `permission_mode`, `turn_id` | Spike with D2 |
| No daemon identity | Keyboard pickers | Typed `/model <model> --reasoning=<level>` and `/permissions <profile>` need no picker | Later, same trade-off as D1 |

The app-server API is marked experimental and its schema is version-specific,
so it needs a drift check as much as the Claude screens do.

### Rex

| Need | Today | Better option | Verdict |
| --- | --- | --- | --- |
| Discovery and status | CLI fan-out every 2 s | `rex events --json -s SESSION` streams NDJSON: `terminal.process_changed` (generation, foreground), `terminal.program_status_changed` / `_removed`, `terminal.title_changed`, `block_created`, `block_closed`, `session_view_changed`. Events carry a gap-free `seq` | Do it (P2) |
| API drift | None beyond `api_revision` | `rex api list --json` and `rex api describe` return input and output schemas per method | Snapshot in P0, check in doctor |
| Sending keys | `rex send-key`, `rex send` | Server API `block.event` delivers key and paste straight to the block and bypasses Lua bindings. Whether `send-key` can be intercepted by a user binding is not documented | Verify in P0 |
| Conditional send | Client-side guards | Rex documents no "send only if generation matches" | Guards stay in DeckShep |
| Status before first turn | `unknown` until a record exists | Program status is OSC 7501. The docs do not say what emits it for Claude or Codex | Verify in P0 |

## 5. Recommended work, in order

**P0. Capture facts (owner-authorized, read-only, about an hour).** Needs
explicit authorization because it reads a live Rex server and uses owned agent
processes in a private session.

- Save `rex api list --json` and note whether `send-key` passes through Lua
  bindings.
- Record what emits program status for Claude and Codex, and when the first
  record appears.
- Record one `rex events --json` stream across: agent start, first prompt,
  permission prompt, finish, pane close.
- Record real VT frames for every Claude screen the parsers read (see P1).
- Confirm a Claude hook sees `REX_SESSION` and `REX_BLOCK`.
- Confirm whether `PostModelSwitch` fires for a session-only `s` change in the
  interactive model picker.

**P1. Recorded-frame tests and drift checks.** No behavior change.

- Add a `--record` mode to the existing live harness (`tests/live/rex-picker.cjs`,
  `rex-states.cjs`) that saves sanitised frames to
  `tests/fixtures/screens/claude/<version>/`. Frames: idle composer with and
  without the effort badge, model picker, effort slider at each level, each
  permission-mode footer, working with the Escape hint, permission dialog,
  question dialog.
- Run every parser test over every recorded version. The hand-written simulator
  replays recorded frames instead of inventing them.
- Put every app-server method and notification `daemon.ts` uses in one
  exported list, as the Codex extension does. Add `npm run compat:codex`:
  generate the schema from the installed CLI and assert each entry and the
  fields used still exist. Verified locally that generation is offline.
- Record a tested Claude version range. Outside it the keys still work, and
  doctor and the inspector say the version is unverified. This is a warning,
  not the old hard pin.

**P2. Rex event stream.** One long-lived `rex events --json` child per session
feeds discovery; a full poll runs at start, on a `seq` gap and on disconnect.
One failed read no longer blanks the row. Slots change only on `block_created`,
`block_closed` and `process_changed`. Guard reads before a press stay as they
are.

**P3. One Claude screen recogniser and structured read-back.**

- Move all screen knowledge into one module with one entry point that returns
  `composer`, `modelPicker`, `effortSlider`, `permission`, `question`,
  `working` or `unknown`. Controls stop carrying their own regexes.
- Match on text and layout first; use colour only where the recorded frames
  show nothing else distinguishes a state.
- With hooks on, confirm results from `PostModelSwitch`, `effort.level` and
  `permission_mode` and fall back to the screen without them. Today these hook
  values only feed captions (`docs/CLAUDE.md`, hooks-only mode). Using them as
  confirmation depends on a P0 check that is still open there: whether
  `PostModelSwitch` fires for a session-only `s` change in the picker.
  `permission_mode` is not recorded from hooks yet.
- Normalise each agent to one state value from one source at a time (hooks,
  then Rex status, then screen), with an explicit unknown, instead of combining
  conditions in `modeOf`.

**P4. Diagnosable keys.** Each reason a row 3 key is unavailable gets its own
caption of at most 15 characters and a line in the inspector. Doctor keeps the
last few refusals with no prompt text or paths.

**P5. Codex interrupt by API.** Use `turn/interrupt` when thread identity is
proven; keep the Escape path otherwise. Capture the active turn ID at key-down
and send that ID, so a press drawn for one turn cannot stop a later one. Wait
for `turn/completed` with status `interrupted` before showing the agent as
stopped. Same permit, same no-retry rule.

**P6. Hook-answered approvals (spike after D2).** Fixture first: a held
`PermissionRequest` hook, a private socket to the plugin, a timeout that falls
back to the native dialog, and the existing single-use permit on the key.

## 6. Tests to add

- **Executable key-state matrix.** Turn the tables in
  `docs/validation/KEY-STATE-TEST-PLAN.md` into one data table: provider, state
  and setup variant give 15 faces and, per key, the exact delivery or the
  refusal. One test runs it through the plugin harness. The inverse rows assert
  zero `send` and `send-key` calls. Generate the document from the table.
- **Random-walk guard test.** Seeded random sequences of state changes, focus
  changes, process replacement, presses and clock advances against the
  simulator, with four invariants: input never reaches a pane other than the
  one shown at key-down; at most one delivery per press; every refusal shows a
  caption; a lit key never does nothing silently.
- **Recorded-frame parser tests** and **Codex schema check** from P1.
- **Event-stream tests** for P2: gap, disconnect, reordered start, burst.

## 7. Owner decisions

- **D1.** May Effort (and later Model) use typed `/effort <level>`, which
  removes the slider parser but saves the level as the Claude default? Today's
  rule is session-only.
- **D2.** May an approval be answered through the hook response instead of a
  key? It needs a longer hook timeout than the current 5 s and changes what the
  opt-in hook does.
- **D3.** Authorization for the P0 capture.
- **D4.** Should an unverified Claude version only warn, or also disable the
  picker-driven keys?

## 8. Not recommended

- Wrapping or launching agents in a DeckShep-owned process (AgentDeck's managed
  mode, and what both first-party extensions do). It is the only route to
  fully structured Claude control, and it breaks "agents already running in
  Rex".
- The private Codex socket at `ipc/ipc.sock`. It is undocumented and versioned
  per message.
- The Claude Agent SDK or `--input-format stream-json`. They cannot attach to a
  running TUI.
- Remote Control as a local channel. It routes through claude.ai.
- Relaxing guards to make keys feel more reliable.

## 9. Implementation status (2026-11-11)

Done, with fixture tests and no live run:

| Item | What exists |
| --- | --- |
| P1 Codex drift check | `DAEMON_CONTRACT` in `src/agents/codex/daemon.ts` lists every method and parameter sent. `npm run compat:codex` checks it against the installed CLI; a unit test checks it against the recorded 0.167.1 protocol. |
| P1 tested-version range | `src/agents/claude/tested-range.ts` (2.1.319 to 2.1.322). Setup shows the release and warns outside the range. Nothing is disabled (D4 taken as "warn"). |
| P1 frame corpus, scaffold only | `tests/helpers/screen-corpus.cjs`, `tests/fixtures/screens/README.md`, a corpus test, and an opt-in recorder in `tests/live/rex-picker.cjs`. No frames are recorded yet. |
| P2, reduced | One timed-out Rex call keeps the agent row for a cycle. The event stream is not built. |
| P4 | `src/domain/blockers.ts`: a reason on the status key and one explained line in setup. |
| P5 | `turn/interrupt` behind `daemonControls.interruptEnabled`, default off. |
| Tests | `key-state-matrix`, `guard-random-walk`, `discovery-tolerance`, `control-blockers`, `codex-protocol`, `claude-tested-range`, `screen-corpus`. |

Still open:

- **P0** has not run. It needs explicit authorization (D3).
- **P2 event stream.** The event payloads are documented by name only, so it
  waits for the recorded stream from P0.
- **P3** (one Claude screen recogniser, hook read-back, recording
  `permission_mode`, single state source). Rewriting the readers without
  recorded frames would repeat the problem in section 1, so it waits for P0
  and the corpus.
- **P5 live check.** Whether a second client may interrupt a turn owned by the
  terminal's client is unverified; keep the switch off until it is tried on an
  owned session.
- **P6**, **D1** and **D2** are owner decisions and were not taken.
- The last few refusals in doctor (part of P4) are not built.

## 10. Sources

Rex: [docs](https://www.superlogical.com/rex/docs),
[API reference](https://www.superlogical.com/rex/docs/reference/api),
[CLI reference](https://www.superlogical.com/rex/docs/reference/cli),
[events](https://www.superlogical.com/rex/docs/reference/events),
[program status](https://www.superlogical.com/rex/docs/build/program-status),
[agent skill](https://www.superlogical.com/rex/docs/automate/agent-skill).

Claude Code:
[interactive mode](https://code.claude.com/docs/en/interactive-mode.md),
[keybindings](https://code.claude.com/docs/en/keybindings.md),
[hooks](https://code.claude.com/docs/en/hooks.md),
[model config](https://code.claude.com/docs/en/model-config.md),
[permission modes](https://code.claude.com/docs/en/permission-modes.md),
[status line](https://code.claude.com/docs/en/statusline.md),
[remote control](https://code.claude.com/docs/en/remote-control.md),
[Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript.md).

Codex: [app-server](https://learn.chatgpt.com/docs/app-server.md),
[commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[hooks](https://learn.chatgpt.com/docs/hooks),
[config reference](https://learn.chatgpt.com/docs/config-file/config-reference).

VS Code extensions (bundled scripts, read only):
[Anthropic claude-code 2.1.322](https://open-vsx.org/extension/Anthropic/claude-code),
[OpenAI chatgpt 26.51106.51428](https://open-vsx.org/extension/openai/chatgpt).

Projects: [agentsd](https://github.com/paultyng/agentsd),
[AgentDeck](https://github.com/puritysb/AgentDeck),
[streamdeck-agent-cockpit](https://github.com/cskwork/streamdeck-agent-cockpit),
[Agent Vitals](https://notes.nicolasdeville.com/helpers/agent-vitals/),
[muxboard](https://github.com/mrshu/muxboard),
[claude-squad](https://github.com/smtg-ai/claude-squad),
[agent-deck](https://github.com/asheshgoplani/agent-deck),
[happy](https://github.com/slopus/happy),
[ccmanager](https://github.com/kbwo/ccmanager),
[Elgato article](https://www.elgato.com/explorer/products/stream-deck/control-claude-with-stream-deck-for-faster-workflows/).

Limits of this research: some doc pages were read through summaries; the
claude-squad and happy sources were not opened; the Rex wire framing, socket
path and `block.event` key payload are not documented on the pages read.
