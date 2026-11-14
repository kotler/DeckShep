# Consolidated Goldfish Review

**Target** [Herdr App agent controls design](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md)  
**Date** 2026-11-14  
**Reviewed SHA-256** `b1086bcfab27cc0d60d8afee00fc1b50e22f8790414ed8540c466d42c4f490fd`  
**Scope** Feature lines 1–153 and detailed implementation lines 154–310

All five stages completed with ten fresh-context reviewer invocations. Twenty raw observations consolidate into **11 findings — 7 Major and 4 Nit**. No reviewer classified a finding as Blocker. The implementation plan fails the zero-design-decision readiness standard because its passive/fixture work still requires consequential interface, guard and recovery decisions.

The reviewers treated real-receiver qualification as an acknowledged dependency. The readiness findings below also identify decisions missing from work the plan describes as executable today. Both native picker and provider API delivery remain candidates. Background operation, Rex-equivalent behavior and stale-press protection remain requirements.

## Stage and reviewer completion

| Stage | Reviewer | Completion | Report |
| --- | --- | --- | --- |
| 5 — Initial Zoom Out | Zoom Out | Completed, Z1 | [Initial report](zoom_out_report.md) |
| 5 — Initial Zoom Out | Inventive Catalyst | Completed, no findings | [Initial report](zoom_out_report.md#inventive-catalyst-result) |
| 6 — Comprehension | Comprehension | Completed, C1 and full paraphrase | [Comprehension report](comprehension_report.md) |
| 7 — Design Critique | Design | Completed, D1 | [Critique report](critic_report.md) |
| 7 — Design Critique | Structural | Completed, S1–S2 | [Critique report](critic_report.md) |
| 7 — Design Critique | Feature Style | Completed, no findings | [Critique report](critic_report.md#feature-style-result) |
| 8 — Intermediate Zoom Out | Zoom Out | Completed, M1–M5 corroborate earlier findings | [Intermediate report](intermediate_zoom_out_report.md) |
| 9 — Implementation Readiness | Readiness | Completed, R1–R3 | [Readiness report](implementation_readiness_report.md) |
| 9 — Implementation Readiness | Codebase Details | Completed, B1–B5 | [Readiness report](implementation_readiness_report.md#codebase-details-findings) |
| 9 — Implementation Readiness | Implementation Style | Completed, IS1–IS2 | [Readiness report](implementation_readiness_report.md#implementation-style-findings) |

Stages ran in sequence with parallel reviewers inside applicable stages. Every reviewer completed its required persona, target range and assigned standard reads. Stage 6 received only the target and its comprehension persona, and its complete paraphrase is preserved. Source read inventories and partial context reads appear in the individual reports. No required read was reported unavailable.

## Major findings

### G01 — Establish recipient feasibility before extending shared production authority

**Raw findings** Z1, M1  
**Target lines** 156–168, 197–227 and 258–269

The plan changes shared press contexts, input actions, delivery and permit machinery before step 8 establishes the actual recipient contract. Both current routes already lack necessary capabilities. A disabled production factory prevents activation, while shared interfaces could still be built around revisions, tickets and stages the eventual supported receiver cannot provide.

Reorder the plan so passive tracking can finish independently. Investigate authoritative App/Core binding and the actual recipient interface before modifying active production authority. Keep initial experiments in test-owned helpers that reuse the existing native and daemon implementations. Define the supported contract before full active delivery/browser integration. This preserves evaluation of both routes and avoids committing speculative mechanisms to shared modules. [Initial finding](zoom_out_report.md#z1--major--investigate-recipient-feasibility-before-changing-shared-production-authority)

### G02 — Make authorization revocation visible and ordered at the recipient

**Raw findings** D1, M2, B4  
**Target lines** 79–85, 150–152, 166–168, 191–195, 223–227 and 252

A request can pass the last client check and wait remotely. Consent may then be revoked, the key hidden/remapped or the scope switched while focus/session/readiness remain unchanged. The receiver’s enumerated conditions still allow the request to execute before expiry. Capturing a presentation revision does not communicate its later invalidation.

Define the owner of the current authorization/presentation lifetime and how invalidation is ordered against effect commit. Specify the revocation linearization point, acknowledgement/failure behavior, disconnection semantics and any shared lease or cancellation mechanism. Test accepted work held at the receiver, revoke after final client I/O, then release before expiry and count effects. Record real receiver support as an additional qualification dependency. [Design finding](critic_report.md#d1--major--recipient-ordering-omits-local-authorization-invalidation)

### G03 — Specify candidate protocols, exact-input grants and native stage transitions

**Raw findings** R1, B5  
**Target lines** 162–168, 203–209 and 223–227

The evidence checklist leaves request/result types, candidate methods, expiry mechanism, immutable versus advancing fields and native stage transitions to an implementer. Existing grants bind target/generation/control/verification but do not bind the exact low-level input. The authority issues by target, and provider input names a method without its scoped thread/model payload. Two inputs with otherwise matching authority can differ in the key or setting they apply.

Write concrete evaluation interfaces and select a fixture deadline mechanism. Define operation identity, route, stage revision, expected view and exact permitted input in issue/consume. Specify who advances stage evidence after command paste, Enter, quick-picker navigation, effort inspection, model/effort navigation and session apply. Enumerate changes to the delivery-authority contract, including `src/terminals/contract/backend.ts` where needed. Test substitution of command, key, route, stage and thread/model payload independently. The eventual upstream wire representation remains a separate qualification result. [Readiness finding](implementation_readiness_report.md#r1--major--evaluation-contracts-require-protocol-and-state-machine-choices) · [Permit finding](implementation_readiness_report.md#b5--major--bind-permits-to-the-exact-stage-and-low-level-input)

### G04 — Define the concrete App controller-to-kernel bridge and generation ownership

**Raw findings** R2, B1  
**Target lines** 162–168, 185–187, 201–219 and 234–238

The App controller uses its own navigation authority and App pane addresses. The existing delivery kernel requires a provider-bound target, session port, guard pipeline, active press callback and custom App backend constructor. The supplied App backend cannot mutate. Backend and controller generations also have separate lifecycle behavior. Injecting a candidate service alone does not construct a working guarded path.

Assign the evaluation backend/factory to an exact planned file and document constructor signatures, session/current-press adapters, capture conversion, authority consumption and stored-operation execution. Choose one generation owner and define lifecycle changes on connect, replacement and disposal. Add an ordinary key-event-to-kernel-to-receiver positive checkpoint before expanding the candidate scenarios. [Bridge findings](implementation_readiness_report.md#b1--major--define-the-concrete-bridge-into-the-delivery-kernel)

### G05 — Define route-aware Model capabilities without claiming an API keyboard interface

**Raw finding** B2; related portion of R2  
**Target lines** 164, 201–211, 225 and 234–238

Shared Model requirements include `sendKeys` for both keys and provider mutations. An API-only conditional settings receiver cannot pass this check without advertising keyboard capability. The plan has no route-aware policy and omits a planned capability-policy change.

Specify requirements for each Model route and bind permitted mutation kinds to the route and verification record. Add `src/domain/capabilities.ts` and any necessary tests to the exact file list. Prove an API-only candidate can pass truthful verification while refusing native input. Preserve existing Rex/TUI requirements. [Capability finding](implementation_readiness_report.md#b2--major--define-truthful-api-model-capabilities)

### G06 — Expose and reuse native eligibility through a pure provider helper

**Raw finding** B3  
**Target lines** 218–225, 256 and 295

Exact empty-composer/current-picker eligibility is implemented in private native provider functions. Public `readCodexSettings` reads settings without asserting those conditions. Calling the native cycle would mutate the UI, while copying the private parser would create independent policy. The provider source modification is absent from the plan’s file list.

Specify a shared, pure exported eligibility result in `src/agents/codex/keyboard-settings.ts`, with the exact checks it reuses. Have native initial-stage logic and the API candidate consume it. Enumerate the provider source/test changes. Include nonempty and multiline drafts and an open picker highlighted away from the current model. [Eligibility finding](implementation_readiness_report.md#b3--major--native-eligibility-needs-a-reusable-public-provider-policy)

### G07 — Define outcome feedback, evidence retention and recovery

**Raw finding** R3  
**Target lines** 168, 185–189, 195, 201 and 254–256

Success, pre-effect refusal, partial completion and uncertainty have no specified key/inspector messages, model-evidence retention, lock release or rearming behavior. Existing App notices describe focus requests. An implementer would have to design recovery after a picker opens or an update loses its reply.

Add an outcome table specifying bounded key captions, inspector feedback, evidence invalidation, operation-lock release and fresh-observation/rearming requirements. Handle stale-source completions explicitly. Test all result categories and ensure readback is required before publishing a successful setting result. [Outcome finding](implementation_readiness_report.md#r3--major--result-categories-lack-presentation-and-recovery-behavior)

## Nits

### G08 — Include selected-bank behavior in the feature contract

**Raw findings** S1, M3  
**Target lines** 22, 35–39, 138 and 193

The implementation chooses to reveal the focused pane’s bank once on an actual App selection change and preserve subsequent local Page browsing. Summarize that existing decision in Goals or the feature focus subsection so the visible behavior can be understood without implementation details.

### G09 — Correct the outdated integration-planning statement

**Raw findings** S2, M4  
**Target line** 106

The paragraph says file planning follows delivery selection. Passive and candidate work already has an enumerated plan. Identify the narrower outstanding real-adapter/protocol/consent dependency.

### G10 — Separate successful settings cases from expected refusals

**Raw findings** C1, M5, IS1  
**Target line** 256

“Positive cases” includes unsupported effort, an absent current model and nonempty/multiline drafts. Split successful advance/wrap/recognized-picker cases from cases expected to refuse. Preserve the comprehension reviewer’s paraphrase while making this correction.

### G11 — Distinguish release packaging from experimental runtime eligibility

**Raw finding** IS2  
**Target line** 297

Editorial action CALIBRATE. Replace the statement about the package qualifying Herdr with precise statements that release packages include Rex and experimental Model eligibility requires the defined per-control and route-specific evidence.

## Traceability matrix

Every raw finding maps to a consolidated action. The intermediate stage corroborated prior findings and added no independent issue.

| Raw ID | Stage/lens | Consolidated action |
| --- | --- | --- |
| Z1 | 5 Zoom Out | G01 |
| C1 | 6 Comprehension | G10 |
| D1 | 7 Design | G02 |
| S1 | 7 Structural | G08 |
| S2 | 7 Structural | G09 |
| M1 | 8 Zoom Out | G01 |
| M2 | 8 Zoom Out | G02 |
| M3 | 8 Zoom Out | G08 |
| M4 | 8 Zoom Out | G09 |
| M5 | 8 Zoom Out | G10 |
| R1 | 9 Readiness | G03 |
| R2 | 9 Readiness | G04, with capability detail in G05 |
| R3 | 9 Readiness | G07 |
| B1 | 9 Codebase | G04 |
| B2 | 9 Codebase | G05 |
| B3 | 9 Codebase | G06 |
| B4 | 9 Codebase | G02 |
| B5 | 9 Codebase | G03 |
| IS1 | 9 Style | G10 |
| IS2 | 9 Style | G11 |

## Evidence and execution limits

The [manifest](review-manifest.json) records the reviewed target hash, ranges, stage completion and downloaded source hashes. The [reading list](reading-list.txt) contains 37 existing linked local context files and local copies of the two fixed-revision Core links. All URLs directly linked by the target were staged. The target’s self-link was excluded from additional context. Proposed files were recognized as future files.

All ten reviewers used `fork_turns="none"`. This excludes parent conversation turns. Host instruction-file exclusion was not independently verified. The comprehension reviewer received no baseline files. Stage 8 alone received prior reports to evaluate their interactions. Other reviewers were instructed to avoid prior findings and chat history.

This is one complete report-only consolidated pass through five stages. There were no repair iterations or convergence claim. No tests, live native probes or hardware actions ran during this review. The earlier 24-fixture-test result remains historical evaluation evidence. The design’s hash remained unchanged throughout the review, and all findings remain open for revision.
