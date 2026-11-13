# Goldfish Annotated Review Report

Status: resolved

Applied all nine approved plan edits. Contested, escalated, declined and unaddressed findings: zero. Physical qualification remains pending.

**Target** · [Rex public beta plan](docs/plans/REX-BETA-PLAN.md), full file. Line references below identify the reviewed 64-line revision.

## Prioritized findings and proposed edits

The nine items retain the identifiers from the [consolidated review](docs/validation/rex-beta-egm/consolidated_review_report.md). G blocks a parity claim. The remaining proposals clarify qualification procedures. Approval applies to plan text; physical checks and release decisions require separate evidence.

### G. All rows · release evidence

**Severity** · Blocker for parity sign-off. **Reviewer** · Implementation readiness. **Plan lines** · 7, 39, 52, 62.

**Finding and rationale.** Record case, provider, hook state, consent, identity source, displayed keys, entry point, runtime hash, native outcome and teardown. Classify each as physical pass/fail, fixture only, direct native only, expected refusal, unsupported, or untested. Decide each open shared capability by fixing and retesting or having the owner explicitly narrow the beta claim. The release-readiness check alone cannot make that decision.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Before the release decision, add a sign-off table with one row per case, CLI and configuration. Record runtime hash, consent, hook state, identity source, displayed controls, entry point, native result and teardown. Mark each supported physical action passed, failed or untested. Record fixture coverage, direct native observations and expected refusals separately. For each missing shared capability, link a successful retest or the owner’s explicit decision narrowing the published claim.

### B. Row 2 · Page and Collapse

**Severity** · Major. **Reviewer** · Intermediate zoom-out. **Plan lines** · 20–25.

**Finding and rationale.** With the selected agent in slot six and a draft present, page to the other bank and collapse a preceding gap. Verify native focus, draft, slot order and row-3 provider after each press. Repeat with the providers swapped. Verify formerly lit Collapse and Attention clear offline.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** After the navigation table add: Select the sixth agent with a draft present. Page to the other bank, then collapse a preceding gap. Check native focus, the draft, surviving slot order and the selected provider’s row 3 after each press. Repeat with providers swapped. Take Rex offline with Collapse and Attention lit and confirm both clear.

### C. Row 2 · Attention

**Severity** · Major. **Reviewer** · Design and intermediate zoom-out. **Plan lines** · 23–25.

**Finding and rationale.** Mix Asking, Approval, Error and Done across providers and pages. Count only other agents, check ordering and ties, and keep pending requests untouched. Replace the winning pane between key-down and execution: no fallback focus or input. When hook-free Claude is focused, accept the correct gated row independently of the navigation pass.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Replace the last sentence of the Attention row: Exercise both a question and an approval across banks; both count as waiting. Verify focus, bank, selected dot and untouched request, then check row 3 against the focused provider’s current identity and consent. If the displayed target closes or is replaced before dispatch, the press must leave focus unchanged and send no input.

### D. Row 3 · Ready and pickers

**Severity** · Major. **Reviewer** · Design and structural critique. **Plan lines** · 31, 45.

**Finding and rationale.** Record Model/Effort captions before pressing, on a fresh and resumed CLI. Retest Codex specifically with session ID **first**. Verify Codex Permissions skips Full Access; Claude Permissions cycles native modes including Plan. Exercise the already-open Claude session-only picker separately from the standalone effort slider: the latter presents **Apply effort** on K12. Check highlighted selection, apply, cancel via the supported native path, and unchanged session defaults.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Add ready-state checks: Start with the Codex session ID first in the footer. Read both values before pressing. Codex Permissions skips Full Access; Claude Permissions includes Plan. Leave extra confirmation to the user. In the supported Claude session-only picker check Up, Down, Apply, Esc and inactive Interrupt. In the standalone Effort slider check K12 Apply effort and the highlighted level. Exercise apply and cancel separately and verify session defaults are preserved.

### E. Row 3 · Working

**Severity** · Major. **Reviewer** · Design and style critique. **Plan lines** · 32–33, 39.

**Finding and rationale.** Distinguish Claude native controls disabled, enabled without hooks, and enabled with verified hook identity. Hook-free working Claude has K11–K14 blank plus verified Interrupt; hook-bound Claude can show Steer, Queue and an informational K13. On Codex, enter a valid draft with missing run ID and verify grey “loading run” keys preserve it. Restore identity and test a real Steer and Queue separately. Test Interrupt with an empty verified composer during inference and streaming. Record unavailable shared actions explicitly.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Split Working into three cases. With Claude native controls disabled, verify the explanatory blocker and zero input. With native controls enabled and no hook identity, a verified working Claude shows K11–K14 blank and Interrupt on K15. With fresh hook identity test Steer now and Queue after the turn on separate valid drafts, plus the informational K13. In Codex use a nonempty draft with missing run ID, verify loading run and draft preservation, then restore proof and repeat. Check Interrupt on separate empty-composer inference and streaming turns.

### F. Row 3 · Waiting and background

**Severity** · Major. **Reviewer** · Design and style critique. **Plan lines** · 34–36.

**Finding and rationale.** Score ordinary choice, approval, checkbox selection, review, commit and cancel individually. Claude has K15 Toggle and distinct K13 Review/Submit presses; the Codex question layout has no equivalent K15 Toggle. Identify whether the native Codex case exists before classifying it. A form or auth request can route to “Answer in Rex” or “Open browser” with no native action. Codex verified background terminals have Stop; Claude has no equivalent deck action.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Split the waiting cases into single choice, approval, checkbox, review, form and authentication. For Claude check K15 Toggle, K13 Review and a fresh K13 Submit press. Record the actual Codex native surface and whether the deck can operate it. Check Answer in Rex for a form and Open browser for auth; pressing either must leave the request intact. Record Claude background Stop as unsupported alongside the positive Codex terminals case.

### H. Execution · candidate and smoke

**Severity** · Major. **Reviewer** · Implementation readiness. **Plan lines** · 41–48, 58.

**Finding and rationale.** Identify installed bytes before carrying forward a physical pass. Recheck affected/unattributed cases on the packaged artifact. In manual smoke use K9 blank and K13 provider-native Permissions; K14 is Codex Mode or Claude blank. Select Codex and Claude within the packaged Rex profile. Its cross-backend step belongs on an experimental build.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Before the first physical press record the installed runtime hash and candidate source revision. Preserve earlier Codex Queue, Steer and Mode and Claude Interrupt observations with their original build attribution. Rerun affected or unattributable cases on the packaged runtime. In the Rex-only smoke verify K9 blank, K13 provider-native Permissions, K14 Codex Mode or Claude blank, then select both providers within Rex. Defer cross-backend switching to a build that packages both profiles.

### J. Execution · isolation

**Severity** · Major. **Reviewer** · Codebase details and implementation readiness. **Plan lines** · 48–54.

**Finding and rationale.** The disposable Claude Queue/Choice harness writes native keys directly. It can pass while production deck keys remain gated. Run native state matrices and affected picker/Mode checks serially with fresh authorization and clean fingerprints. Preserve the independent physical Mode pass and the separate failed native teardown as distinct observations.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** Identify fixture, direct CLI shortcut, production action and physical MK.2 entry points separately. Run synthetic hook suites separately from authorized native cases. Rerun both native state matrices, the hooks-enabled picker and standalone Codex Mode serially with independent disposable setups. Record native outcome and cleanup fingerprints separately. Preserve the physical Mode pass and native teardown failure as distinct results.

### A. Row 1 · state and focus

**Severity** · Nit for the dwell clarification; broader row checks retained. **Reviewer** · Intermediate zoom-out. **Plan lines** · 11–13.

**Finding and rationale.** Repeat Codex → Claude and Claude → Codex with hooks off. Verify a single selected dot, correct native focus, stable slots and row 3 after manual focus, closure, process replacement and an offline/reconnect cycle. Check Done twice: leave the selected agent before the two-second dwell and after it. Only the latter acknowledges completion. Treat blocked forms/auth separately from questions and approvals; the renderer uses a distinct fallback for these blocked kinds.

**AI suggestion** · PROPOSE FIX.

**Proposed edit.** After the state list add: With hooks off, repeat focus changes in both provider directions through pane closure, process replacement and Rex reconnect. Check one selected dot for a focused agent, stable slots, and the matching row 3. Leave a selected Done agent before its two-second dwell and verify it returns to Attention. Repeat after the full dwell and verify Ready persists. Record blocked form and auth faces separately from Asking and Approval.
