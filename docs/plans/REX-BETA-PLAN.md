# Rex public beta plan

**Checkpoint, November 12, 2026.** The checkout declares DeckShep 1.4.0. It includes working-tree changes beyond commit `8ad9504`, including Codex footer parsing and streaming Interrupt. Version alone cannot identify which build a tester used. The release build packages Rex. Herdr TUI and Herdr App remain experimental source backends. [Profiles](../PROFILES.md) · [Release backend declaration](../../scripts/profiles.mjs)

Current execution results, including runtime checksums, physical key observations and native teardown outcomes, are in the [November 12 qualification record](../validation/2026-11-12-rex-beta-execution.md).

## Beta scope and acceptance criteria

The beta covers the whole 15-key Rex profile. Codex CLI and Claude Code share the agent bank, navigation and state-driven actions. The intended layout exception is the separate Codex Mode key. Claude exposes Plan through Permissions. Qualify each shared action independently on both CLIs. If a shared action works on only one, record the missing behavior as a parity gap. [Key map](../PROFILES.md) · [Detailed test cases](../validation/KEY-STATE-TEST-PLAN.md)

### Row 1 — agent bank (keys 1–5)

Start with an idle Codex and an idle Claude in separate panes. Each gets a stable slot showing its identity and state. Tap each in turn. Rex must focus that pane, the white dot must follow it, and row 3 must switch to its controls. Selecting a working or waiting agent must leave its turn or request intact. Switch focus from inside Rex as well.

Observe each provider through Ready, Working, Asking, Approval, Done and Error. Check the state label and shape as well as the selection dot. Also exercise unknown state, an empty slot, a closed pane, a focused shell and Rex offline. Starting a sixth agent must preserve existing slots; launching an agent in the background must preserve focus. Closing the selected agent must revoke its controls. Test background-only activity separately where the provider exposes it. [Cases A1–A15](../validation/KEY-STATE-TEST-PLAN.md#4-row-1-agent-keys-k1-k5)

With hooks off, repeat Codex → Claude and Claude → Codex through manual focus, pane closure, process replacement and Rex reconnect. Check stable slots, a single dot on the focused agent and matching row 3. Leave a selected Done agent before the two-second dwell and verify it returns to Attention. Repeat after the full dwell and verify Ready persists. Record form and authentication faces separately from Asking and Approval.

### Row 2 — agent navigation (keys 6–10)

| Key | When it appears | What a pass looks like |
| --- | --- | --- |
| 6 · Next agent | At least two agents | Tap advances one agent; hold selects the previous one. Exercise wraparound across providers and banks. Rex focus, the dot and row 3 follow. |
| 7 · Page | More than five slots | Tap or hold moves one bank forward or back. The selected pane keeps focus. |
| 8 · Collapse | A closed slot leaves a gap | One press removes the gaps and preserves live agents in order. |
| 9 · Blank | Always | Pressing it has no effect. |
| 10 · Attention | Another agent is waiting, errored or newly done | Count all eligible agents, including off-page ones. With Waiting, Error and Done present together, focus Waiting first, then Error, then Done as they clear. Ties follow slot order. Exercise a question and an approval across banks. Both count as Waiting. Verify Rex focus, bank, dot and untouched request, then check row 3 against the focused agent’s identity and consent. If the target closes or changes before dispatch, focus stays put and no input is sent. |

Select the sixth agent with a draft present. Page to the other bank, then collapse a preceding gap. After each press verify native focus, draft contents, surviving slot order and row-3 provider. Swap providers and repeat. Take the disposable Rex instance offline with Collapse and Attention lit and confirm both clear.

Check that each conditional key goes blank when its condition clears. Repeat navigation with provider hooks off and chat metadata unavailable. Rows 1 and 2 rely on Rex discovery and physical focus. [Cases B1–B15](../validation/KEY-STATE-TEST-PLAN.md#5-row-2-navigation-keys-k6-k10)

### Row 3 — controls for the selected agent (keys 11–15)

| Selected agent state | Physical controls, left to right | Acceptance check for each CLI |
| --- | --- | --- |
| Ready | Model · Effort · Permissions · Mode (Codex) or blank (Claude) · idle Interrupt | Check available native values before pressing. Cycle Model, Effort and Permissions one step, verify the applied value in the selected session, and restore it. Codex Permissions skips Full Access. Claude Permissions includes Plan. Leave any extra confirmation to the user. Exercise Codex Plan/Default separately. Idle Interrupt sends no Escape. Repeat after a fresh launch and in an existing conversation. |
| Claude session-only picker already open | Up · Down · Apply · Esc · inactive Interrupt | With verified identity, check the highlighted entry, apply to this session, then reopen and cancel. Verify the default for new sessions stays intact. |
| Claude standalone Effort slider already open | Blank · Apply effort · blank · blank · blank | Compare K12 with the native highlight and press once to apply. Reopen and cancel using the native keyboard. Verify the session default for new chats stays intact. |
| Working Claude, native controls disabled | Explanatory status | Verify the blocker and zero terminal input. |
| Working Claude, native controls enabled without hooks | Blank · blank · blank · blank · Interrupt | With verified working proof, test Interrupt on separate empty-composer turns during inference and streaming. Check for one interruption and a return to idle. |
| Working with verified turn identity | Steer · Queue · inactive Permissions (Codex) or informational Claude Code (Claude) · blank · Interrupt | On separate valid drafts, verify Steer reaches the active turn and Queue reaches the CLI after that turn finishes. Test Interrupt separately during inference and streaming with an empty composer. |
| Working Codex, missing run ID | Grey Steer and Queue showing “loading run” | Use a nonempty draft. Both presses must preserve it. Restore verified identity and repeat the positive Steer and Queue cases on separate turns. |
| Working with empty, edited or stale draft | Working controls gated at press time | Press with an empty composer, then exercise a changed draft and a changed pane after presentation. Verify zero stale input and recovery with a valid draft. |
| Waiting for a single choice | Up · Down · Confirm · Esc · inactive Interrupt | Move one choice per press, confirm only the displayed choice, and cancel a separate request. |
| Waiting for approval | Up · Down · Confirm · Esc · inactive Interrupt | Confirm the highlighted option on a disposable request. Cancel a separate approval. Replace a question or approval before dispatch and verify zero input. |
| Checkbox selection | Claude K15 Toggle and K13 Review | Toggle the highlighted item and enter Review. For Codex, record the native surface, if available, and whether the deck can operate it. |
| Answer review | Claude K13 Submit | Verify the marked answers and require a fresh press to submit. The press captured as Review must never submit. |
| Form | K11 Answer in Rex | Press the information key and verify the form remains intact. |
| Authentication | K11 Open browser | Press the information key and verify the request remains intact. |
| Turn ended with background activity | Codex background terminals: blank · blank · inactive Permissions · blank · Stop | Verify the displayed count and stop only the selected chat’s verified terminals. Record Claude background Stop as unsupported. Record that parity gap separately from foreground Interrupt. |
| Done, Error, unknown, closed, offline or no selected agent | Ready settings when an idle target is verified; otherwise status, unavailable or blank keys | Verify each transition clears the old turn or dialog actions. A focused shell has five blank keys. No press may reach a closed, replaced or unverified agent. |

**Parity evidence.** Track Codex and Claude separately for each state, with hooks off and on. Record the caption, action, native outcome and any missing prerequisite. Today Claude’s hook-free path covers ready settings and verified working Interrupt; Steer, Queue and question/approval controls require hook identity. Codex thread-bound actions need verified identity too. A refusal with missing identity tests the guard; the positive case still needs evidence. Track unsupported native dialogs, background Stop and hook-free action differences explicitly so they cannot silently count as parity passes. For a second press while an action is pending, check contextual busy feedback and a single native action. [Codex and Claude press cases and stale-press checks](../validation/KEY-STATE-TEST-PLAN.md)

## 1. Verify the installed candidate’s two open regressions

Before the first physical press, record the candidate source revision and SHA-256 of the installed plugin runtime. Identify working-tree builds explicitly.

| Control | Evidence at this checkpoint | Next observation |
| --- | --- | --- |
| Codex Model and Effort | With the session ID first in the footer, both values disappeared from the keys. The parser regression has fixture coverage and the updated plugin was installed for retest. | Select an idle Codex session with the session ID first in the footer, followed by visible model and reasoning effort. Read both keys before pressing. Cycle each setting, confirm the applied value in Rex and on the key, then restore the original values. Record footer field order and build. |
| Codex Interrupt | Earlier MK.2 presses failed intermittently. Three disposable Luna turns verified one Escape each; one later physical press stopped a streaming reply. | On separate authorized disposable turns, press once during early output and once after scrolling. Record whether output stops, the key returns to idle, and any warning appears. Record each first press, including failures. |

Keep the physical Codex Queue, Steer and Mode passes and Claude Interrupt pass with their original build attribution. Repeat affected cases and any result with unknown build attribution on the packaged runtime. [Physical and disposable test evidence](../validation/2026-11-11-rex-beta-walkthrough.md)

## 2. Complete the control and isolation evidence

Use the [key-state cases](../validation/KEY-STATE-TEST-PLAN.md) for agent selection and closure, mixed-state Attention, navigation, permissions, choices, multi-select and background controls. For each open case record provider, hook configuration, Rex build/server, expected caption, observed key feedback and native result. For a refused action verify that the target and its input stay intact.

Run the synthetic hooks and no-hooks suites separately from native testing. With current authorization, rerun both native state matrices, the hooks-enabled picker and standalone Codex Mode serially, each in an independent disposable setup. Record each native outcome and its teardown fingerprints separately. The prior overlapping runs could not identify the writer of the changed Claude state file. Preserve the physical Codex Mode pass and the standalone native run’s teardown failure as separate observations. Claude’s disposable Queue and Choice checks send direct CLI shortcuts; also exercise the production key path to qualify those actions. Use the [live harness guide](../../tests/live/README.md) and [beta checklist](../BETA-CHECKLIST.md).

## 3. Qualify the artifact

Identify the candidate commit and artifact checksum. Run the repository CI checks and package audit, then use that artifact for the [manual smoke](../validation/MANUAL-SMOKE.md). For the Rex-only smoke, verify K9 blank, K13 showing provider-native Permissions, and K14 showing Codex Mode or blank for Claude. Select both providers within Rex for the routing check. Defer cross-backend switching to a build that packages both profiles. Record a clean-account installation, explicit consent steps and the first successful Rex control. Exercise same-identity upgrade and removal with customized profiles and optional hooks. Test the Intel helper on Intel before claiming execution there. Older pre-reset previews follow the separate [identity migration procedure](../IDENTITY.md). [Install guide](../INSTALL.md) · [Release procedure](../RELEASING.md)

### Candidate sign-off record

Use one row per key-state case, provider and configuration in the candidate’s dated evidence record. Repeat a row for each entry point exercised. The example below is a pending physical check.

| Case / CLI | Hooks / consent / identity source | Installed runtime SHA-256 | Entry point | Displayed keys / press | Native outcome / teardown | Physical result / evidence |
| --- | --- | --- | --- | --- | --- | --- |
| C11 · Codex Effort | Off / visible-pane checks enabled / session-ID-first footer | Record before press | MK.2 | Record initial and final K12 captions | Record applied level, restoration and cleanup | Untested |

Distinguish fixture, direct CLI shortcut, production action and physical MK.2 evidence. Mark each supported physical case passed, failed or untested. Record expected guard refusals and unsupported actions separately. Before claiming parity, link a passing retest for each shared capability gap or record the owner’s explicit decision narrowing the published beta claim.

## 4. Make the release decision

At this checkpoint, `npm run release:check` reported three pending items for 1.4.0: owner-reviewed launch validation, a verified public Issues channel, and a verified active support email. Attach privacy-safe evidence for each, update the [readiness record](../../release/readiness.json), and rerun the check. Review provider mark permissions, Marketplace eligibility and distribution materials separately with the owner. Record remaining limitations in the release notes before seeking publication approval. [Release readiness](../RELEASE-READINESS.md) · [Marketplace preparation](../MARKETPLACE.md)

Update dated evidence as checks finish and keep the checklist in sync. The [control reliability plan](CONTROL-RELIABILITY-PLAN.md) explains design alternatives; the [foundation plan](REFACTOR-PLAN.md) and its [implementation checkpoint](IMPLEMENTATION-STATUS.md) explain how the current structure came about.
