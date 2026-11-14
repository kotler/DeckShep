# Agent controls for the focused Herdr App pane

**Author** DeckShep Goldfish review  
**Date** 2026-11-13  
**Status** Experimental proposal for owner review

## Overview

Click a working Codex pane in Herdr and row 3 should show its working controls. Click a Claude pane asking a question and the same row should show its answer keys. Switch to another macOS application and the deck should still control that Claude session while DeckShep can verify the pane, session and question. A press captured on one agent must never act on the next one. This extends the experimental App navigation profile. [Current App guide](../../HERDR-APP.md) · [Previous navigation brief](../../../concepts_brief.md)

**The first experiment should prove that a stale press has zero effects.** In the reviewed interfaces, the App can report its selected pane and Core can report a terminal’s foreground process. Neither observation connects that pane to the exact Core instance the App is using. Even with that connection established, Core can hold a key after DeckShep’s final check and write it after a dialog changes. These are two independent blockers for controls. [Parity research](../HERDR-APP-REX-PARITY-RESEARCH.md) · [ADR 0007](../../adr/0007-herdr-app-0.1.14-source-review.md)

## Analysis

### Which pane the keys follow

The dot on row 1 marks Herdr’s reported selection. **On deck** marks a local choice. If Herdr shows A and the user taps B with focus consent off, row 3 still belongs to A. Acknowledgement of a consented request to focus B is also insufficient. A fresh App observation of B can change the display, and verified B-specific evidence can arm its controls. Manual clicks work the same way across tabs and spaces. Page only changes the visible bank. One UX proposal is to reveal the focused tile’s bank once on an actual App focus change, while allowing the user to browse other banks afterward. Off-bank control target visibility is an open design choice. [Selection reader](../../../src/terminals/herdr-app/selection.ts) · [Controller](../../../src/app/herdr-app-controller.ts) · [Tile markers](../../../src/app/herdr-app-view.ts)

“Herdr is in the background” means another macOS application is active. The foreground process **inside Herdr’s terminal** must still be the intended CLI. Its provider state can be ready, working, asking or awaiting approval. The Codex **Bg task** row has a separate meaning: that chat has verified background terminals and no active reply. Losing macOS activation alone should neither select that row nor raise Herdr. Keep the last verified App pane in memory for the same window and connection. Re-read and validate the action-specific facts even in the background. If the pane becomes a shell, an overlay takes the relevant input, a target is remote or ambiguous, or observation continuity is lost, disarm affected keys. The previous agent and Herdr’s fallback shown agent are both unsafe substitutes. [App observation](../../../src/terminals/herdr-app/selection.ts) · [Rex state mapping](../../../src/domain/layout.ts)

### What the interfaces can establish

| Source | Evidence available | Missing for an actionable key |
| --- | --- | --- |
| Herdr App control socket | Matching `status / ls / status` reads supply space, tab, model-selected pane and a local terminal address. Known overlays, floats and inconsistent views can be rejected. | Actual terminal keyboard ownership, a trustworthy change sequence and the App’s active Core connection. A click away and back can leave the same final snapshot. |
| Herdr Core CLI/API | `hc get` / `terminal.get` and Core events supply terminal records, program-reported status and sampled foreground process facts. `hello` identifies the Core on that connection. A complete screen read with `lines:0` can supply visible text. | A Core-local address such as `t7` names a different terminal on another Core. Core’s protocol generation is not a connection lifetime. Process start time, CLI root session, App focus, dialog ownership and composer cursor/edit mode need independent evidence. |
| Provider and OS | For a proven local terminal, verify foreground PID, owner, start time and executable. Then bind the provider identity and the exact setting, turn, request, selection or composer the operation uses. | Matching titles, folders, labels or process names can recur. A shared daemon can serve several chats. The existing Codex hook route includes Rex-specific ownership checks. Claude hook evidence binds root sessions and lifecycle changes; native actions still need their individual guards. |

These limits refer to the reviewed App 0.1.14 and Core 0.1.18 sources. The App keeps per-screen focus out of its shared layout document. Its richer mod snapshots are cached and lack a proven connection/revision barrier. The earlier signed App 0.1.14 / Core 0.1.19 containment run covered plain focus requests on disposable panes. The owner’s physical walkthrough on the installed App covered tile selection, Next and revoked focus consent. Neither exercised provider controls. [Pinned App window](https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/window.rs) · [Pinned Core schema](https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/schema/hc.openrpc.json) · [Signed calibration](../../validation/2026-11-08-herdr-app-release-calibration.md) · [Codex identity](../../CODEX-HOOKS.md) · [Claude identity](../../CLAUDE.md)

### Rex parity by state

Use the Rex row layout, captions and provider-specific behavior as the comparison. A position on the deck can show a disabled or informational key. Arm a mutation only where the experimental backend can prove the same user-visible operation, including its prerequisites. Today row 3 defaults to empty, saved settings overrides are inactive and the public package ships Rex only. [Profile map](../../PROFILES.md) · [Rex layout](../../../src/domain/layout.ts) · [Key faces](../../../src/app/key-face.ts) · [Capability policy](../../adr/0003-capability-gated-controls.md)

| Agent state | Expected Rex behavior in columns 1–5 | What the App must prove for an active control |
| --- | --- | --- |
| Ready, including eligible done/error states | Model, Effort, Permissions, Codex Mode, inactive Interrupt. Claude leaves Mode empty and includes Plan in its Permissions cycle. An open Claude effort slider shows Apply effort alone. | Exact target session and current setting or picker. Preserve session-only behavior, the existing draft, Claude opt-in and default bindings. Rex’s Codex Permissions cycle skips Full Access. The dormant App daemon prototype changes the approvals reviewer, which does not establish equivalent behavior. |
| Working | Steer, Queue, provider-dependent Permissions/information, empty, Interrupt. Hook-free working Claude can expose only Interrupt. | Steer submits the existing composer text to the current turn. Queue schedules it for the next one. Both need a stable draft digest, cursor, edit mode and turn. Interrupt needs the captured turn or a proven native busy state and cue. A replacement turn invalidates it. |
| Codex background terminals only | Empty, empty, Permissions position, empty, Stop with the terminal count. | Identify the chat, originating turn and exact set of background terminals. Test multi-terminal Stop separately because the Rex implementation performs individual terminations. |
| Question | Up, Down, Confirm, Esc, Interrupt or Claude Toggle. On a recognized Claude multi-select, the third key can change from Review to Submit. | Exact request, dialog, highlighted choice and stage, plus keyboard ownership for native keys. An old Review press cannot submit. |
| Approval | Up, Down, Confirm, Esc, Interrupt. | Matching approval request, dialog digest and selected option. A second approval in the same pane must disarm the old Confirm. |
| Unclassified or unsupported | Informational or unavailable positions. Claude auth/form waits can give keyboard or browser guidance. | A generic “blocked” report cannot distinguish a question, approval or authentication prompt. |

Rex permits some ready-state native settings without a Codex thread ID and some Claude controls without hooks. The App must establish equivalent session continuity for this requirement before offering a hook-free path. A thread-addressed write also needs evidence that its semantics match the Rex control. [Codex native settings](../../../src/agents/codex/keyboard-settings.ts) · [Daemon settings](../../../src/agents/codex/daemon.ts) · [Dormant App settings](../../../src/app/herdr-app-codex.ts) · [Background termination](../../../src/agents/codex/background.ts)

### When a press may take effect

Capture the displayed key, target and action at key-down. Preserve the existing 350 ms arming interval, two-second queue limit, visibility, build, consent, generation and single-use permit checks. Reuse one read-only observation across the five keys. At delivery require a continuous binding to the same App window and focus, Core connection, terminal process, provider session and the state required by that action. A lost observation invalidates old presses even if the same-looking pane or dialog reappears. Keep permitted terminal/provider mutations on the guarded delivery path. [Guarded delivery](../../../src/app/delivery.ts) · [Press guarantees](../../adr/0002-guard-pipeline-and-single-deliver.md)

A receiver would need to compare the captured revisions and apply the action as one ordered operation, or provide an equivalent guarantee across App, Core and provider. A final local check and a one-use permit prevent some errors but cannot close the interval before the receiver acts. Core’s reviewed `terminal.keys` can wait for three seconds of quiet and execute after disconnect. `terminal.send` pastes and submits supplied text. `terminal.interrupt` chooses a terminal stop key. These operations do not enforce the expected pane, session or action state. A provider method with a thread or turn ID addresses some of those facts only. [Pinned Core input](https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/input.rs) · [Pinned Core server](https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/server.rs) · [Daemon method contract](../../../src/agents/codex/daemon.ts)

For a stale press, count every externally visible effect, including activation, focus, opening a picker, moving a highlight, editing a draft, submitting input and changing a setting. Count at the receiver after queued work can drain. Local refusal feedback and passive observation can still occur. A timeout after dispatch has an uncertain outcome and must never trigger a retry. For multi-step actions, identify the first effect and every subsequent write. If a control promises all-or-nothing completion through its last step, a sequence of separately checked writes cannot establish that property. Leave the control unavailable pending an equivalent indivisible operation or an explicit decision on its scope.

## Goals and scope

The target is local Codex CLI and Claude Code CLI in the experimental Herdr App profile, including operation with another Mac app active. Preserve tap-only interaction, stable identities and settings, provider opt-ins and the existing rows 1–2. Keep public packaging, Herdr TUI, remote terminals, Zoom, automatic hook installation and changes to provider-wide defaults outside this proposal. A navigation or plain-focus opt-in grants no context-input authority. [App guide](../../HERDR-APP.md) · [Persisted identities](../../IDENTITY.md)

## Alternatives weighed

| Approach | Benefit and constraint |
| --- | --- |
| Drive row 3 from deck selection or always raise Herdr before acting | Simple to implement. Local selection can disagree with a click, and raising Herdr disrupts background use. Raising a window would already count as an effect. |
| Use the existing App/Core reads and address each operation directly | Reuses existing code and can support a passive display. A same-address wrong Core, focus change between reads or delayed key write defeats the mutation guarantee. The display-only stage is independently useful. |
| Prefer a provider-addressed operation when its meaning matches Rex | Could control a verified background session without sending keyboard input. It still needs a proven App/Core binding and enforcement of the relevant focus and state conditions when applied. |
| Evaluate a supported upstream conditional operation | Could reject stale commands where they take effect. A change counter must cover every relevant authority and advance even on a switch away and back. This adds protocol coordination and version-specific validation. A new helper or mod serving a cached snapshot alone cannot provide it. |

## Key decisions and staging for next steps

All checks below are **proposed**. No software, live process or hardware was exercised in this review.

1. **Passive focus following.** With A working in Codex and B asking in Claude, click B, including across banks. Expect B’s target and question layout without a deck tap. Select A locally and page away. Expect the control target to stay B. Background Herdr while an unrelated app accepts keyboard input. Expect unchanged provider state and zero activation, focus or input. A shell or unresolved pane clears eligibility.
2. **Prove the ownership chain and stale-press contract before enabling writes.** Use two isolated Cores with `t7`, two sessions in the same directory, a reused PID with a different start time, and a replaced chat under the same CLI. Delay delivery and switch A→B→A, including between the final client check and receiver execution. Repeat across an App restart, Core reconnect, missed events, hidden profile, consent revocation and expiry. Require zero eventual effects at every possible recipient and a new press after recovery.
3. **Try one complete action.** On a verified, disposable pair, compare one ready Codex setting with Rex, first with Herdr active, then while another app remains frontmost. Require the intended session to change exactly once, no incidental configuration changes and an intact draft. An unverified route stays unavailable. Prove each remaining setting and provider separately. Verify saved overrides and copied keys through upgrade, downgrade and re-upgrade, including no implicit consent or writes.
4. **Exercise action-specific changes.** End or replace a turn during Interrupt, change the terminal set during Stop, edit or move the composer before Queue/Steer, replace a dialog under the same “blocked” status, move the highlight, open an overlay, or change Claude Review to Submit. Expect zero effects for the captured stale action. Test delayed queued input and disconnect, including after the test releases the queue. For unchanged targets positively verify the exact selection, destination turn, setting or terminal set.

Use synthetic receivers and the virtual deck first, then seek separately authorized native evidence for each candidate control. Report a refused press separately from an uncertain delivery. Fixed diagnostic reasons such as “App view changed” or “Core unbound” can explain a blank key without collecting terminal contents, prompts, process paths or private session IDs. Until both binding and delivery can be demonstrated, passive focus following is the proposed stopping point.

## Reviewer status

Seven independent fresh-context reviewers completed a source-only review. Each read its persona and assigned sources.

| Reviewer | Distinct contribution |
| --- | --- |
| Design | Count the first side effect of a picker or multistep action, and detect a switch away and back. |
| Codebase details | Follow provider-specific Rex layout exceptions and distinguish local refusal from uncertain delivery in diagnostics. |
| Zoom out | Make the App target identifiable across banks while preserving local Page browsing. |
| Comprehension | Separate the dot, On deck, Mac backgrounding and a provider’s background work in the user-facing contract. |
| Implementation readiness | Test stale targets through upgrade, rollback, reconnect, consent changes and delayed upstream delivery. |
| Structural | Reuse one layout and one set of per-action gates across rendering, overrides, dispatch and delivery. |
| Inventive catalyst | Decouple passive focus display from authority to act, and evaluate an ordered comparison at the recipient with its coordination cost explicit. |
