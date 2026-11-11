# Key-state test plan (Stream Deck MK.2, Rex profile)

Written 2026-11-11 against commit `30ccde2`. The physical MK.2 Result cells are open. Section 11 records the separate disposable Rex runs. Expectations are taken from the code
(`src/domain/layout.ts`, `src/app/key-face.ts`, `src/app/controller.ts`,
`src/app/session.ts`), not from hardware.

This is a manual plan for the owner's own deck and sessions. It needs real Rex,
Codex and Claude sessions, so an agent must not run it without explicit current
authorization (see `AGENTS.md`). Use disposable chats in a scratch repository.

For every key and state it gives three things:

- **Shows**: what the key must display.
- **Press**: what a press must do.
- **Must not**: the inverse, what must never be displayed or sent in that state.

## 1. Key numbering

| | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |
| --- | --- | --- | --- | --- | --- |
| Row 1 | K1 Agent | K2 Agent | K3 Agent | K4 Agent | K5 Agent |
| Row 2 | K6 Next agent | K7 Page | K8 Collapse | K9 (always blank) | K10 Attention |
| Row 3 | K11 | K12 | K13 | K14 | K15 |

## 2. How to read a key

| Look | Meaning |
| --- | --- |
| Coloured surface, name, folder, glyph + status word | Live agent (row 1) |
| White dot, top right | The agent Rex is showing; row 3 acts on it |
| Dark surface, dashed ring, "No agent" | Slot never used |
| Dark surface, plain ring, "Closed" | Slot's agent is gone; Collapse clears it |
| Ring with slash, "Rex offline" | Rex could not be read this refresh |
| Icon, caption, coloured rail | Available control |
| Grey text, grey rail | Control exists but is unavailable now |
| Fully blank, no rail | No control in this state |
| Small coloured corner, top right | Key has a hold action |
| Green surface for 2.5 s | Press succeeded (result caption) |
| Red "Unavailable" + reason for 10 s, plus the alert mark | Action failed. Record the reason and visible terminal outcome; the alert alone cannot establish whether input reached the pane. |

Agent status glyphs: disc Ready, triangle Working, half disc Bg task, `?` Asking,
`!` Approve, check Done, cross Error, ring with dot Unknown.

## 3. Setup variants

Run the row-3 sections once per variant that applies to you.

| Variant | Visible-pane checks | Claude native controls | Claude hooks | Codex hooks |
| --- | --- | --- | --- | --- |
| V0 fresh install | off | off | not installed | not installed |
| V1 Rex consent | on | off | not installed | not installed |
| V2 Claude keyboard | on | on | not installed | either |
| V3 Claude hooks | on | on | installed | either |

Record before starting: plugin version shown in Stream Deck, variant, Rex
version, `codex --version`, `claude --version`.

## 4. Row 1: agent keys (K1-K5)

Each state applies to Codex and Claude alike unless noted. Name is the Rex pane
title, then the Rex session label, then `Codex` / `Claude Code`. Folder is the
last segment of the working directory.

| ID | State to create | Shows | Press | Must not | Result |
| --- | --- | --- | --- | --- | --- |
| A1 | No agent ever in this slot | Dashed ring, `No agent`, dark | Nothing sent; alert mark | A name, a status word, a dot | |
| A2 | Agent idle at its prompt | Green, disc, `Ready` | Rex focuses that pane; dot moves here; row 3 switches to this agent | Pulse; `Unknown`; a second dot elsewhere | |
| A3 | Agent mid-turn | Blue, triangle, `Working`, slow pulse | Focus only | Any keystroke into the pane; `Ready` | |
| A4 | Codex turn ended, background terminals still running | Teal, half disc, `Bg task` | Focus only | `Working` pulse | |
| A5 | Agent asks a question | Amber, `?`, `Asking`, slow pulse | Focus only | `Approve`; an answer being sent | |
| A6 | Agent asks for permission | Amber, `!`, `Approve`, slow pulse | Focus only | `Asking`; the request being accepted | |
| A7 | Turn finished, agent not yet looked at | Bright green, check, `Done`, pulses about 15 s | Focus; after the agent stays selected 2 s it becomes `Ready` | Turning `Ready` while it was never selected | |
| A8 | Agent reported an error | Red, cross, `Error` | Focus only | `Ready` | |
| A9 | Agent with no status record yet (see I1) | Grey-blue, ring with dot, `Unknown` | Focus only | Controls in row 3 acting | |
| A10 | Agent's pane closed or agent exited | Plain ring, `Closed`, dark; K8 shows the gap | Nothing sent; alert mark | The old name or status staying on the key | |
| A11 | Quit Rex | Every row-1 key: ring with slash, `Rex offline` | Nothing sent | Stale agent names; any dot | |
| A12 | Click a different agent pane in Rex with the mouse | Dot moves to that agent within one refresh (about 2 s) | n/a | Dot staying on the old agent; two dots | |
| A13 | Click a shell pane in Rex | No dot anywhere; row 3 shows `Select agent` | n/a | Dot on the last agent | |
| A14 | Start a new agent while five slots are full | Existing keys do not move; K7 Page appears | n/a | Agents reshuffling between slots | |
| A15 | Start an agent in the background (not focused) | New key appears; dot does not move | n/a | Selection jumping to the new agent | |

## 5. Row 2: navigation keys (K6-K10)

Each key is blank unless its condition holds. Test both sides.

| ID | Key | Condition | Shows | Tap | Hold 450 ms | Must not | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | K6 | Two or more agents | `Next agent`, blue rail, corner mark | On release: focus next agent in slot order, wrapping; page follows | Focus previous agent | Acting on key-down; sending keys to a pane | |
| B2 | K6 | Zero or one agent | Blank, no rail | Nothing | Nothing | A caption; an alert | |
| B3 | K7 | More than five slots | `Page`, `1/2`, `N off-page`, corner mark | On release: next group of five | Previous group | Changing the dot or Rex focus | |
| B4 | K7 | Five or fewer slots | Blank | Nothing | Nothing | A caption | |
| B5 | K8 | At least one `Closed` slot, Rex online | `Collapse`, `N gap(s)` | Closed slots removed, agents shift left; green `N gaps removed` 2.5 s | n/a (acts on key-down) | Removing a live agent; sending anything to Rex panes | |
| B6 | K8 | No gaps, or Rex offline | Blank | Nothing | n/a | A caption | |
| B7 | K9 | Always | Blank | Nothing | n/a | Anything | |
| B8 | K10 | Another agent (not the selected one) is Asking or Approve | Amber `Waiting`, `N agent(s)` | Focus the first such agent in slot order; page follows; row 3 shows its question keys | n/a | Counting the selected agent; answering the request | |
| B9 | K10 | No one waiting, another agent in Error | Red `Error`, `N agent(s)` | Focus it | n/a | Showing `Done` ahead of `Error` | |
| B10 | K10 | No one waiting or errored, another agent `Done` and not yet viewed | Green `Done`, `N agent(s)` | Focus it; after 2 s selected it leaves the count | n/a | Staying lit after every Done agent was viewed | |
| B11 | K10 | Nothing needs you, or only the selected agent does, or Rex offline | Blank | Nothing | n/a | A caption | |
| B12 | K10 | A waiting agent on page 2 while page 1 is shown | Lit with the right count | Focus it and switch to page 2 | n/a | Staying on page 1 | |
| B13 | K6/K7 | Start on agent 2 of 3 (K6) or page 2 of 3 (K7); release before 450 ms | n/a | Reach agent/page 3 on release | n/a | Two steps; a backward step | |
| B14 | K6/K7 | Reset to agent 2 of 3 (K6) or page 2 of 3 (K7); hold 1 s then release | n/a | n/a | Reach agent/page 1 while held; stay there on release | A forward step on release | |
| B15 | K10 | Select a Ready agent; put an Error and a Done agent in earlier slots than an Asking agent. All three are unselected and eligible. | Amber `Waiting`, `3 agents` | Focus the Asking agent; its question controls appear | n/a | Counting only the Asking agent; focusing the earlier Error or Done agent; sending an answer | |

For B13/B14, set up three pages with at least 11 slots. In the fixture, press
down and advance the clock 449 ms: position must still be 2. Release for B13.
In a fresh B14 run, advance the extra 1 ms while held and assert position 1
before release. Check exactly one focus operation for K6 and zero for K7.

## 6. Row 3 with a Codex agent selected (K11-K15)

| ID | Agent state | K11 | K12 | K13 | K14 | K15 | Must not | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Ready, Done or Error | `Model` + value | `Effort` + value | `Permissions` + value | `Mode` + value | `Interrupt`, `not running`, grey | Steer/Queue; a red Interrupt | |
| C2 | Working, run known | `Steer`, `typed text` | `Queue`, `typed text` | `Permissions`, grey | Blank | `Interrupt`, `running`, red | Model/Effort/Mode; live Permissions | |
| C3 | Working, run not loaded yet | `Steer`, `loading run`, grey | `Queue`, `loading run`, grey | `Permissions`, grey | Blank | `Interrupt`, `running`, red | Steer/Queue sending anything | |
| C4 | Background terminals only | Blank | Blank | `Permissions`, grey | Blank | `Stop`, `N terminals`, red | `Interrupt`; Steer/Queue | |
| C5 | Question | `Up` | `Down` | `Confirm`, `Enter` | `Esc`, `question` | `Interrupt`, `not running`, grey | Model/Effort; any key greyed among K11-K14 | |
| C6 | Approval | `Up`, `choice` | `Down`, `choice` | `Confirm`, `highlighted` | `Esc`, `choice` | `Interrupt`, grey | The option text being accepted without a press | |
| C7 | Unknown / not signed in | `Check Rex` (+ `Sign in`) | Blank | `Permissions`, grey | Blank | `Interrupt`, grey | Any live control | |
| C8 | No agent selected (shell pane) | `Select` / `agent` | Blank | `Permissions`, grey | Blank | `Interrupt`, grey | Any live control | |

In C1 the second line is read passively from the focused pane. With
visible-pane checks off (V0) the value line stays empty.

### Codex press checks

| ID | Precondition | Press | Expected result | Must not | Result |
| --- | --- | --- | --- | --- | --- |
| C10 | C1, V1+ | K11 Model | Native model picker opens, moves one entry, applies for this session; key turns green with the new model 2.5 s; caption then shows it | Enter saving a default; a prompt being submitted; change in any other pane | |
| C11 | C1, V1+ | K12 Effort | One step to the next effort level, wrapping at the top | Skipping levels; a prompt being submitted | |
| C12 | C1, V1+ | K13 Permissions | One step through the native permission profiles; Full Access is skipped | Selecting Full Access; accepting a confirmation dialog for you | |
| C13 | C1, V1+ | K14 Mode | Toggles Plan / Default once | Two toggles from one press | |
| C14 | C1, V0 | K11-K14 | Red `Unavailable` + `Enable checks`; alert mark | Any key sent to the pane | |
| C15 | C1 | K15 Interrupt | Red `Unavailable` (interrupt only while working) | Escape sent to an idle prompt | |
| C16 | C2, text typed in the composer | K11 Steer | The typed text is sent as steering now; green `Steer` + result | Sending with an empty or changed draft; sending into another pane | |
| C17 | C2, text typed in the composer | K12 Queue | The typed text is queued for after the turn | Interrupting the turn | |
| C18 | C2 | K15 Interrupt | One Escape; agent stops; row 3 returns to C1 | A second Escape; background terminals being stopped | |
| C19 | C4 | K15 Stop | The listed background terminals stop; green `Stop` + result | Stopping terminals of another chat; retry after an uncertain write | |
| C20 | C5 | K11/K12 then K13 | Highlight moves one option per press; Confirm sends Enter on the highlighted option | Confirm on an option that changed since it was drawn | |
| C21 | C5 or C6 | K14 Esc | One Escape; the dialog closes | Interrupting a running turn | |
| C22 | C6 | K13 Confirm | Accepts the option highlighted in the terminal | Accepting when the request changed (must refuse: `Press again`) | |

## 7. Row 3 with a Claude agent selected (K11-K15)

In the Rex profile Claude has two ways to become controllable. **Keyboard**
(V2): the four idle settings keys work from the foreground process and Claude's
own CLI registration, with no hooks. **Hooks** (V3): turn-specific keys (Steer,
Queue, question and approval keys, Interrupt) need a SessionStart or
UserPromptSubmit event for this session.

| ID | Agent state / variant | K11 | K12 | K13 | K14 | K15 | Must not | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Just opened, no prompt sent yet (any variant) | See I1: record what you get | | | | | | |
| D2 | Idle, V0 or V1 (controls off) | `Check Rex`, `Enable Claude` | Blank | `Claude Code`, `Enable controls` | Blank | `Interrupt`, grey | Any live control; any key sent | |
| D3 | Idle, V2, pane focused | `Model` + value | `Effort` + value | `Permissions` + value | `Mode` + value | `Interrupt`, grey | `Check Rex`; `Enable Claude` | |
| D4 | Idle, V2, custom `keybindings.json` present | `Check Rex` (second line may be empty) | Blank | `Claude Code`, `Preview` | Blank | `Interrupt`, grey | Any live control | |
| D5 | Working, V2 without hooks | `Check Rex` | Blank | `Claude Code`, `Preview` | Blank | `Interrupt`, grey | Steer/Queue live; Escape sent | |
| D6 | Working, V3 | `Steer`, `typed text` | `Queue`, `typed text` | `Claude Code`, `Preview` | Blank | `Interrupt`, `running`, red | Model/Effort | |
| D7 | Question, single choice, V3 | `Up` | `Down` | `Confirm`, `Enter` | `Esc`, `question` | `Interrupt`, grey | Toggle | |
| D8 | Question, multi-select, V3 | `Up` | `Down` | `Review`, `answers` | `Esc`, `question` | `Toggle`, `Space` | Confirm submitting before Review | |
| D9 | Answer review screen, V3 | `Up` | `Down` | `Submit`, `answers` | `Esc`, `question` | `Interrupt`, grey | A press captured as Review acting as Submit | |
| D10 | V3 with fresh hook proof: open a supported model/effort picker manually in the focused Claude pane. Run D12 separately from an empty prompt. | `Up` | `Down` | `Apply`, `this session` | `Esc`, `question` | `Interrupt`, grey | Enter saving a default | |
| D11 | Approval, V3 | `Up`, `choice` | `Down`, `choice` | `Confirm`, `highlighted` | `Esc`, `choice` | `Interrupt`, grey | Allow-always chosen for you | |

### Claude press checks

| ID | Precondition | Press | Expected result | Must not | Result |
| --- | --- | --- | --- | --- | --- |
| D12 | D3, empty prompt | K11 Model | Native picker opens, next concrete model selected, applied with `s` (this session only) | Enter (saves a default); typed draft lost; an inference request | |
| D13 | D3, empty prompt | K12 Effort | Next effort level, wrapping to Low at the top | Change persisting to a new session | |
| D14 | D3, empty prompt | K13 Permissions | One Shift+Tab step of Claude's permission-mode cycle | Accepting an extra confirmation (it stays open for you) | |
| D15 | D3, empty prompt | K14 Mode | One Shift+Tab step | Two steps | |
| D16 | D3, text typed in the prompt | K13 or K14 | Refused: `Unavailable` + reason | Shift+Tab sent over a draft | |
| D17 | D2 | K11, K13 | Nothing: these are information keys | An alert; any key sent | |
| D18 | D6, text typed | K11 Steer / K12 Queue | Steer sends now (Ctrl+X Ctrl+S path); Queue sends Ctrl+X Enter | Sending when the composer is not the recognised bordered one | |
| D19 | D6 | K15 Interrupt | One Escape, only while the interrupt hint is visible | A second Escape in the same turn | |
| D20 | D8 | K15 Toggle | Space toggles the highlighted checkbox | Submit | |
| D21 | D11 | K13 Confirm | Accepts the highlighted native choice | Acting after the dialog was redrawn (must refuse) | |

## 8. Stale presses, refusals and uncertain delivery

On hardware, record the key caption and what visibly changed in the terminal. Use a fixture transport trace to count writes, including writes with no visible effect.

| ID | Do this | Expected | Result |
| --- | --- | --- | --- |
| N1 | Select agent A; click agent B's pane in Rex; press a row-3 key at once | Refused (`Reselect agent`) or, after the dot has moved, acts on B only | |
| N2 | Press Steer in the instant the turn ends | Refused (`Press again`); nothing typed into the idle prompt | |
| N3 | Press a row-3 key within about a third of a second of the row changing | Refused (`Press again`) | |
| N4 | While a Model cycle is still running, press Effort; let it wait over 2 s | Second press refused (`Press again`) | |
| N5 | Press K11 twice quickly | At most one change; a second press is refused or applies one more step, never two from one press | |
| N6 | Hold K6, switch Stream Deck profile before 450 ms, switch back | Nothing fired | |
| N7 | Press any key while Rex is quit | No input; row 1 `Rex offline`; keys recover within two refreshes after Rex returns | |
| N8 | Close the selected agent's pane, then press K11-K15 | Refused or blank; nothing typed into whatever pane took focus | |
| N9 | Replace the agent in the same pane (exit, start a new one), press a key drawn before the swap | Refused: the process changed | |
| N10 | Turn visible-pane checks off in the inspector, press K11, then reselect the Ready Codex agent and press K11 again | First press shows the cleared selection (`Select agent`). After reselection, Model refuses with `Enable checks`. Neither K11 press sends input | |
| N11 | Press a blank key (K9, or K14 while working) | Nothing at all: no alert, no caption | |

Use these fixture cases to distinguish where an action failed:

| ID | Injected condition | Expected transport trace | Result |
| --- | --- | --- | --- |
| N12 | Revoke visible-pane consent before a guarded Rex settings press | Preflight refuses; zero input writes to the pane | |
| N13 | In the Claude model-cycle fixture, record the session-only apply key (`s`), then fail its acknowledgement | The action reports failure; the trace contains exactly one `s` and no retry. The terminal may already have applied the selection. | |

## 9. Reported issues to pin down

### I1. Claude keys do nothing right after opening the Claude CLI

What the code does today (read, not reproduced):

1. An agent's state comes from Rex's program-status records for that process
   (`src/app/session.ts` `agent()`, `src/domain/identity.ts` `state()`). With no
   record yet, the state is `unknown`.
2. The passive settings read that makes Claude's idle keys live only runs when
   the state is idle, done or error (`src/app/controller.ts`
   `observeFocusedSettings`).
3. Without that read or hook proof, `modeOf` (`src/domain/layout.ts`) returns
   `unknown`, so row 3 is `Check Rex` / blank / `Claude Code` / blank / grey
   Interrupt, and those presses are deliberate no-ops.

So if a freshly opened Claude has no status record until its first turn, the
agent key says `Unknown` and row 3 is dead until you send one prompt. That
is one explanation for the report. The following checks capture the symptom and test that explanation.

| ID | Step | Record | Result |
| --- | --- | --- | --- |
| I1a | Open Claude in a new Rex pane, focus it, type nothing, wait 10 s | K-row-1 status word (`Unknown` or `Ready`?); K11-K15 captions | |
| I1b | Press K11 and K13 | Any caption change, alert, or key in the terminal | |
| I1c | Send one short prompt, wait for the answer | Status word and K11-K15 after it finishes | |
| I1d | Repeat I1a-I1c with a Codex pane | Same fields | |
| I1e | Repeat I1a–I1c from a fresh Claude session in each of V2 and V3 | At both checkpoints record row-1 status separately from row-3 captions and availability; record whether fresh hook proof exists if known | |

An `Unknown` → `Ready` transition after a prompt establishes the symptom. In
V3 the prompt can also produce a UserPromptSubmit hook event. To isolate the
status record, compare two fixture runs with identical foreground identity,
idle pane, consent and hook proof. Supply no Rex status record in the first
and an idle record in the second. Compare the row-1 status and the four row-3
settings keys separately. If I1a already shows `Ready` while the keys are
inactive, record the K11 second line and inspector message.

### I2. Temporary keys in the agent row while an agent runs

Candidates from the code, each with a different look:

| What you see | Likely cause | Where |
| --- | --- | --- |
| All five keys flash `Rex offline`, then return | One failed or slow Rex CLI call fails the whole refresh; the deck treats that as offline for one cycle | `session.ts` `discover()` throws; `controller.ts` `refresh()` catch |
| One agent's key flips to `Closed` and back; K8 briefly shows `1 gap` | The pane's foreground process was not recognised as the agent for one refresh (a child process in front, or the executable check raced) | `session.ts` `agent()` returns null |
| An extra agent key appears, later reads `Closed` and stays | Rex reported another terminal block running `codex` or `claude`; slots are never removed until Collapse | `session.ts` `discover()` slot push |
| Status word changes (`Approve`, `Asking`, `Done`) on the same key | Normal state changes | by design |
| A key lights in row 2, column 5 | The Attention key | by design |

| ID | Step | Record | Result |
| --- | --- | --- | --- |
| I2a | Start a long Codex turn that runs shell commands; watch row 1 for its whole length | For each odd key: column, exact caption, glyph, how long it lasted, what the agent was doing | |
| I2b | Same with Claude, including a turn that uses a subagent and one that runs a background task | Same fields | |
| I2c | Afterwards | Does K8 show gaps? Do extra `Closed` keys remain? | |
| I2d | Run `npm run doctor` after an occurrence | Its report (it contains no prompt text or home paths) | |

## 10. What automated tests already pin

| Area | Where | Gap |
| --- | --- | --- |
| Row 2 and row 3 actions per state, both providers | `tests/fixtures/golden/layouts.json` | Claude rows use the hook path; the Rex keyboard path (D3) has no golden layout |
| Press routing and exact native key sequences | `tests/fixtures/golden/presses.json`, `native-traces.json` | Fixture transport only |
| Refusals send nothing | `controller-refusals.json`, `native-refusals.json` | |
| Captions, glyphs, dim, wrap | `tests/unit/key-face.test.js`, `key-drawing.test.js` | |
| Tap, hold, stale press, Attention | `tests/integration/press-input.test.js`, `tests/unit/attention.test.js` | No hardware timing |
| Whole-deck look | `tests/e2e/__screenshots__/` (idle, working, question, offline, overflow, herdr) | No approval, background, error, Attention or fresh-Claude screenshot |
| I1 | `tests/e2e/deck.spec.ts` compares missing and matching idle records for the same keyboard-only Claude pane | First status arrival and hook timing on hardware |
| I2 | Manual observations above | Transient foreground process or one failed call inside a refresh |

## 11. Disposable Rex state validation, 2026-11-11

The private Rex launcher ran each case in a fresh terminal with an owned provider
process. The following native CLI observations complement the manual MK.2 steps.

| State and control | Codex Luna | Claude Haiku |
| --- | --- | --- |
| Ready, Permissions | Reopened the permission list and verified the active profile after selection. | One Shift+Tab changed the permission badge. The reported label matched the new native badge. |
| Ready, Mode | Entered Plan and returned to the previous non-Plan mode. | One Shift+Tab changed the mode badge. The live `manual mode` label is covered by a regression test. |
| Working, Interrupt | One Escape stopped the active turn. | One Escape stopped the active turn. |
| Working, Queue | Tab queued the typed follow-up. The two answers appeared in order. | Ctrl+X Enter queued the follow-up while the first task was executing. In the private session record the tool finished and both answers appeared in order. |
| Asking, single choice | The Down key highlighted Blue. The provider answered Blue after confirmation. | The Down key highlighted Blue. The provider answered Blue after confirmation, including the review step when offered. |

See [the live runner instructions](../../tests/live/README.md) to repeat the matrix.
The virtual deck covers captions, button mapping and a pending Queue press during
turn replacement. These runs did not exercise physical MK.2 switches or GUI focus.

## 12. Provider transition regressions

The following cases use synthetic hook events, daemon replies and Rex panes.
They exercise the checkout without inference. Section 11 records the separate
native observations.

| Transition | Expected result | Automated coverage |
| --- | --- | --- |
| Choice becomes an MCP form or URL request during Confirm | A pending Confirm sends zero keys. The status key directs the user to Rex or the browser. The four adjacent action keys are blank. | `tests/unit/claude-state.test.js`, `tests/unit/claude-hooks-only.test.js`, `tests/e2e/deck.spec.ts` |
| Retry, compaction or child completion during a parent turn | The parent retains its run ID and Working controls while its turn is in progress. A recoverable Claude tool failure retains Working. | `tests/integration/background-controls.test.js`, `tests/unit/claude-state.test.js` |
| Terminal failure during Queue | The old press sends zero keys. Error becomes an Attention candidate after selection moves elsewhere. A late Claude tool result or idle reminder cannot revive the failed turn. | `tests/unit/claude-state.test.js`, `tests/e2e/deck.spec.ts` |
| Interrupted Codex turn followed by a new turn | The previous Interrupt sends zero Escapes to the replacement. Verified background terminals retain their separate Stop terminals action. | `tests/integration/background-controls.test.js`, `tests/e2e/deck.spec.ts` |
| Codex thread unloads with its Rex pane still open | Keep the pane and discard the cached chat and run binding. An observed reload invalidates older presses even if chat and turn IDs repeat. Only a fresh Queue can send Tab. | `tests/unit/agent-metadata.test.js`, `tests/integration/delivery.test.js`, `tests/e2e/deck.spec.ts` |
| Working parent with a form, error and completed turn elsewhere | Attention shows three candidates and focuses the form first. The form directs the user to Rex. Attention then shows Error and two candidates. Navigation sends only focus. | `tests/e2e/deck.spec.ts` |

Codex's read-only thread polling can report a generic wait for user input.
That flag alone gives the **Answer in Rex** hint. A browser-specific caption
requires an explicit URL/auth wait. An unload and reload entirely between
observations cannot be distinguished from a continuously loaded thread.
