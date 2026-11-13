# Herdr desktop support on the Rex key map

**Author** DeckShep Goldfish review  
**Date** 2026-11-12  
**Status** Experimental proposal for owner review

## Overview

A user with a working Codex session and a waiting Claude session should be able to find Claude using the same Attention key they use in Rex. Herdr App already reports pane names, agents and state. That is enough to show whom to visit. Changing a provider setting or answering a dialog requires additional evidence about which session will receive the action. The first milestone is navigation on the 15-key deck. [Research plan](docs/plans/HERDR-APP-REX-PARITY-RESEARCH.md)

On signed App 0.1.14 the owner reported successful tile and Next presses using a private preview and separately enabled focus consent. That walkthrough covered neither Attention nor provider writes. The upstream branch in the research reported 0.1.15. Public packages ship Rex only, and ordinary experimental builds have an empty list of approved App focus records. [Signed-build walkthrough](docs/validation/2026-11-08-herdr-app-release-calibration.md) · [Build policy](scripts/profiles.mjs)

## Analysis

**A present pane can stop needing attention.** The focus sender takes a fresh App observation just before dispatch. Today it checks that the displayed pane still exists. A waiting Claude pane can recover at the same address just as another agent starts waiting. Apply the EGM *preliminary action* pattern by ranking agents when drawing the key, capturing its target at key-down, and using the preflight observation to recheck the displayed agent and its eligibility. Refuse a stale press with “Press again.” Switching to the new candidate takes a new press. This adds an occasional refusal during a state change. The local-only path also needs a fresh eligibility check. [Focus sender](src/terminals/herdr-app/focus-sender.ts) · [Attention ranking](src/domain/navigation.ts)

**A deck selection and an App selection can disagree.** The current selection accessor prefers the deck’s choice, and the renderer uses it for the App badge as well. If Herdr reports A and the user picks B with focus consent off, B should show the deck selection while A retains the App marker. With consent and a matched App build, a single acknowledged request should show “Focus requested.” Move the App marker when Herdr reports B. A lost reply after dispatch leaves the result uncertain and must never trigger a retry. None of these observations proves who owns the keyboard. [Controller](src/app/herdr-app-controller.ts) · [Tile view](src/app/herdr-app-view.ts)

**Core identity blocks existing and future writes.** Each Herdr Core can have a terminal called `t7`. The current experimental settings code can repeatedly verify a real process and chat on the configured Core even when the App displays another Core’s `t7`. The EGM *segmentation* pattern keeps App navigation usable while provider writes wait for a supported way to identify the App’s current Core connection and invalidate it on reconnect. This adds connection-lifetime checks and fixtures for each operation. If the upstream interface cannot supply that evidence, the navigation milestone stands on its own. [App/Core protocol review](docs/adr/0007-herdr-app-0.1.14-source-review.md) · [Codex settings binding](src/app/herdr-app-codex.ts)

## Goals vs. Non-Goals

| In scope for the first milestone | Outside the first milestone |
| --- | --- |
| Five stable agent slots per bank for local panes that Herdr identifies as Codex or Claude. An identified agent with missing status shows unknown. | Ordinary terminals on agent keys, remote panes, new hooks, a daemon prerequisite for navigation, or changing the public package. |
| Row two uses Next, Page, Collapse, an empty key, and Attention. Next needs two agents, Page needs multiple banks, Collapse needs a gap, and Attention needs another waiting, errored or done agent. | Backward holds. A later gesture change must dispatch once, use the key-down target and suppress the forward tap on release. |
| Deck-local selection and separately consented, peer-verified App focus requests. | Keyboard-focus claims, provider writes, terminal input, App mods and Zoom. |

Validate the complete local topology before filtering the deck’s roster. A selected ordinary shell is valid App state. Use stable agent slot order across all banks for tiles, Next and Attention. The shared ranker puts waiting before error before done, breaks ties by slot order and excludes the selected agent. Following a target on another bank should show that bank. A reordered App listing should leave the visible slots and Next order intact. [App selection reader](src/terminals/herdr-app/selection.ts) · [Rex layout](src/domain/layout.ts) · [App controller](src/app/herdr-app-controller.ts)

## Alternatives Weighed

| Option | Trade-off and disposition |
| --- | --- |
| Keep Herdr’s existing pane roster and coordinates | Preserves familiar behavior for current preview users but includes shells and puts the same actions on different keys from Rex. Prefer the Rex coordinates for defaults and preserve meaningful explicit overrides. |
| Re-rank Attention at dispatch and follow the new winner | Could reach an urgent agent with one press while silently choosing a different pane than the one shown. Retain the key-down target and offer the new candidate on the next render. |
| Wait for full provider parity before offering navigation | Delays a testable two-agent workflow for upstream evidence that may never exist. Stage each type of action independently. |
| Match Core by agreeing terminal address, name, state and directory | Two independent Cores can satisfy every comparison. A frontmost window, a selected pane and an acknowledged focus request also leave keyboard ownership unresolved. Keep these observations within their demonstrated scope. |
| Map Rex controls directly to Core send, keys and interrupt | Sending supplied text differs from steering existing composer text or queuing it. A terminal interrupt lacks the identity of a particular provider turn or background task. Retain operation-specific gates. |

## Key Decisions & Staging for Next Steps

| Stage | Proposed acceptance check |
| --- | --- |
| 1. App-only navigation | With hooks, daemon and Core readback off, show working Codex and waiting Claude. With focus consent off, Attention selects Claude on the deck with zero App focus requests. On a matched and consented private preview, require one request for Claude followed by an independent App observation reporting Claude selected. Revoking consent prevents further requests. Test a selected shell, six agents, an off-bank candidate, a closed slot, and the displayed candidate becoming ready before dispatch. |
| 2. App-to-Core identity and Codex settings | Apply the binding requirement at dispatch for existing Model, Effort and Permissions, including saved key overrides and existing consent. Two Cores with the same address must produce zero daemon writes. Reconnecting between key-down and write must also produce zero. On an isolated, correctly bound pair of same-directory Codex sessions, require one write to the displayed ready chat. Evaluate Mode through its own provider operation. |
| 3. Turn and composer actions | For Interrupt, bind the displayed turn. For Stop, identify the selected chat’s background work. End or replace the turn before dispatch and expect zero writes. Steer and Queue each need a fresh composer read, cursor, turn identity and demonstrated delivery semantics. |
| 4. Questions and approvals | Test each provider action separately, including Claude’s existing opt-ins. For keyboard delivery, establish keyboard ownership and compare the dialog and selection at press time. Replace the dialog or introduce an overlay while the pane still reports blocked. Expect zero terminal delivery. |

**Preview compatibility.** Keep existing profile and key identities, scope and action strings. Test a saved per-key settings override on upgrade and preserve inactivity when evidence is missing. A return to a Rex-only build also deserves an end-to-end check. The experimental v3 codec has a v2 projection, while the legacy reader rejects v3. Exercise the projection with edited shared, Rex and Herdr TUI settings through the host settings event, and verify that no App consent moves to another scope. [Profile identities](docs/IDENTITY.md) · [Preferences codec](src/app/experimental-preferences.ts) · [Legacy reader](src/app/preferences.ts)

**What to measure.** Fixture checks should count App reads, focus requests, daemon writes and SVG builds separately. One normal App observation already uses status, listing, status for the whole window. The App render loop currently encodes images before comparing them, so zero emitted frames can hide work on all 15 keys. Benchmark a steady deck and a roster with repeated closures. The inspector should count the recognized agents and distinguish successful observation from a verified App peer without logging paths, pane names or contents. Cost and latency have not been measured in this review. [Render loop](src/app/herdr-app-controller.ts) · [Inspector](src/app/herdr-app-inspector.ts) · [Doctor](src/app/herdr-app-diagnostics.ts)

## Reviewer status

Each reviewer completed an independent, fresh-context review of the research plan, its assigned persona and standard. All checks above are proposals. This review used source and historical records.

| Reviewer | Status | Main contribution |
| --- | --- | --- |
| Design | Completed | Dispatch-time Attention freshness and the scope of the settings blocker |
| Codebase details | Completed | False peer/build indication, inaccurate agent counts and work hidden by frame deduplication |
| Zoom out | Completed | Reuse the existing App observation, ranking and focus request path |
| Comprehension | Completed | Distinct deck and App markers, predictable banking, visible stale-press feedback |
| Implementation readiness | Completed | Existing settings overrides, preference rollback and separate build acceptance cases |
| Structural | Completed | Stable Next ordering and independent sources for selection and provider eligibility |
| Inventive catalyst | Completed | Rank early, verify at dispatch, and stage each operation by its required evidence |
