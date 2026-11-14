# Implementation Readiness Review

**Stage** 9  
**Target** [Herdr App agent controls design](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md), detailed lines 154–310  
**Date** 2026-11-14

## Implementation Readiness findings

The readiness reviewer completed its persona, standard and target range. It found three Major gaps in the passive/fixture implementation’s zero-design-decision contract. It did not classify the acknowledged real-receiver dependencies alone as a new Blocker.

### R1 — Major — Evaluation contracts require protocol and state-machine choices

Affected lines 162–168, 203, 209 and 223–227.

The evidence checklist does not define executable candidate signatures, request/result discriminants or native stage representation. “Receiver-issued deadline or equivalent bounded ticket” leaves an expiry mechanism to choose. The implementer must decide how a captured operation, per-write permit, expected view and receiver deadline relate, which fields remain fixed and which advance after operation-owned transitions.

Add concrete TypeScript evaluation contracts, choose a fixture expiry/ticket mechanism, and specify the native transition table and comparison algorithm. State the fixed fields on every stage, how the next expectation is obtained and how external transitions invalidate it. The eventual upstream wire representation can remain a qualification dependency.

Existing `KeyboardPort` in `src/agents/codex/keyboard-settings.ts` at 3–9 is view-based. Its command path at 345–349 pastes and presses Enter separately. The existing pipeline binds target/generation/control/verification and supplies no operation-stage contract.

### R2 — Major — Backend and kernel construction are unspecified

Affected lines 185–187, 201–207, 217–219 and 234–238.

The App controller currently uses its navigation authority and never creates a `DeliveryKernel`. The kernel requires a custom backend constructor for App scope. The existing App backend has no verified controls and refuses delivery. The plan does not identify a concrete implementation of `TerminalBackend` that consumes authority, provides fixture capabilities and executes the kernel’s stored operation. API Model also encounters a shared Model requirement for `sendKeys` without a specified capability policy.

Assign the evaluation backend/factory to an exact file and describe its constructor and authority-consumption sequence. Specify the orchestrator’s session port, current-press reader, active context and factory wiring. Define capabilities and the verification record for both routes. Keep the production default unavailable.

Evidence includes `src/app/controller.ts` at 200–250, `src/app/delivery.ts` at 50–91, `src/terminals/herdr-app/backend.ts` at 28–36 and 95–100, `src/domain/capabilities.ts` at 123–130 and ADR 0002.

### R3 — Major — Result categories lack presentation and recovery behavior

Affected lines 168, 185–189, 195, 201 and 254–256.

The four result categories have no defined key/inspector feedback, model-evidence retention, operation-lock release or rearming behavior. Partial picker completion and lost replies require concrete handling. Existing App notices use focus-specific language.

Add an outcome table covering successful readback, pre-effect refusal, known partial completion and uncertainty. Include stale-source completion handling, evidence invalidation, lock release and fresh-observation requirements. Pin captions to the 15-character feedback limit. Test each outcome without converting an unverified result into a success.

Evidence includes the focus-specific error mapping and `finally` release in `src/app/herdr-app-controller.ts` at 620–666 and notice rendering in the App view.

## Implementation Style findings

### IS1 — Nit — Acceptance-case classification

Affected line 256. Duplicates C1. “Positive cases” includes expected refusals. Separate successful advance/wrap/recognized-picker cases from refusal cases for unsupported effort, an unknown model and nonempty or multiline drafts.

### IS2 — Nit — Calibrate package and eligibility wording

Affected line 297. Editorial action CALIBRATE.

“The package continues to qualify Herdr features only through the experimental path” conflates package inclusion with runtime eligibility. Release packages exclude Herdr. Experimental control qualification applies separately.

Suggested wording is “Release packages continue to include only Rex. Experimental Herdr Model eligibility requires the existing per-control checks and the route-specific evidence defined above.”

## Read provenance

Readiness fully read its persona and implementation standard, the complete target including feature definitions, reading list, AGENTS, delivery evaluation and ADR 0002. It fully read domain backend/selection/types/capabilities/layout, pipeline/verified-control, delivery/App view/App Codex prototype/App backend factory, terminal App backend/reader, virtual scenario dependencies/deck, plugin harness and App daemon/view tests. It consulted controller construction/lifecycle/presentation/press paths and native Codex settings. ADR 0007 was partial context due to output truncation. No access failures or missing required full reads.

Implementation Style fully read its persona, reading list, complete target and delivery evaluation. It consulted controls brief/ADR 0007 excerpts, standing instructions, Rex bank following, refresh/timeout/arming/delivery declarations, release backend configuration and release-scope documentation. No access failures. No Major or Blocker style findings.

## Codebase Details findings

### B1 — Major — Define the concrete bridge into the delivery kernel

Affected lines 162–168, 185–187, 201–209 and 234. Overlaps R2.

The App controller uses `AppFocusPort` and its own authority. Its presentation targets an `AppPaneRef`, while the kernel expects a provider-bound `AgentSnapshot`, session port, guard pipeline, active press callback and explicit backend factory. The plan leaves the conversion, backend construction and generation ownership unspecified. `GuardPipeline.issue` requires matching backend/context generations, while `GuardedBackend.connect` increments independently.

An otherwise valid binding cannot execute a positive fixture press without an engineer designing that bridge. Specify exact exports, constructors, session/current-press adapters, capture conversion, lifecycle and generation owner in named files. Check a normal key event through kernel and conditional receiver before expanding the fixture journeys.

Evidence includes App controller lines 26–43, 74–103, 252–265 and 565–578; App view lines 26–43; domain press types; delivery lines 19–36 and 50–92; pipeline lines 77–87; and contract backend lines 77–87.

### B2 — Major — Define truthful API Model capabilities

Affected lines 164, 201–211, 225 and 234–238.

Shared `controlSpec('model')` requires verified focus, pane identity and `sendKeys` regardless of delivery kind. An API-only conditional settings receiver cannot pass that check without claiming a keyboard interface it does not implement. `BackendCapability` has no provider-settings or conditional-Model capability.

Specify route-aware requirements and how a route-specific verification record constrains allowed mutations. Add `src/domain/capabilities.ts` to the planned files if required. Test that API-only Model passes without keyboard capability and cannot authorize native-key input. Preserve Rex/TUI requirements.

Evidence includes `src/domain/capabilities.ts` at 113–130, `src/guards/verified-control.ts` at 16–32 and `src/domain/types.ts` at 5–14.

### B3 — Major — Native eligibility needs a reusable public provider policy

Affected lines 218–225, 256 and 295.

The API adapter must match native empty-composer/current-picker eligibility. The relevant composer/footer and picker/current-selection checks are private functions in `keyboard-settings.ts`. Public `readCodexSettings` parses settings without asserting those prerequisites. Calling the native mutation cycle to discover eligibility would itself change the UI. The plan omits a modification to that provider source.

An API adapter using the public settings parser could mutate with a nonempty draft where native Model refuses. Duplicating the parser would leave independent policy choices to the implementer. Specify a pure exported eligibility result, the exact checks it reuses and the provider file modification. Have both candidates use it, with tests for multiline drafts and picker highlights differing from the current entry.

Evidence includes native provider lines 20–35, 74–117, 205–258, 327–338 and 372–396.

### B4 — Major — Queued receivers cannot observe local invalidation as specified

Affected lines 166–168, 191, 195, 223–227 and 252. Overlaps D1/M2.

Capturing a visibility/presentation revision does not communicate its later invalidation. The candidate methods expose observation, execution and disposal without a receiver-visible revocation protocol. Backend disposal increments a local generation but does not define cancellation of accepted remote work.

Specify a shared lease or revocation mechanism, authority ownership, effect-boundary ordering, acknowledgements and failure behavior. Release a request before expiry after consent revocation, key hiding or scope change and count actual effects. Record the same mechanism as a real-receiver dependency.

Evidence includes delivery lines 140–175 and 186–195, pipeline lines 64–74 and 100–125, contract backend lines 144–147, and preferences bypassing the serial queue in controller lines 1674–1679.

### B5 — Major — Bind permits to the exact stage and low-level input

Affected lines 164, 203–209, 223 and 227. Overlaps R1.

`GuardPipeline.issue(context,target,generation)` does not receive the low-level input. Grants store target, generation, control and verification key. Consume accepts supported action kinds with those fields. A provider mutation carries a method while omitting the scoped thread/model payload. `DeliveryAuthority.issue(target)` also lacks expected input.

Two requests with the same operation/target/control/stage but different keys or API payloads cannot be distinguished by the existing grant. Specify immutable route, operation ID, stage revision and exact allowed input in issue/consume. Define the stage transition owner across command paste/Enter, quick picker, current effort inspection, model/effort movement and session apply. Enumerate changes to the delivery-authority contract. Independently test key, command, thread/model payload, route and stage substitution.

Evidence includes pipeline lines 25–40 and 77–125, domain backend lines 16–23 and contract backend lines 30–38.

## Codebase read provenance and stage outcome

The codebase reviewer fully read its persona, implementation standard and target range, with earlier definitions as context. It inspected App controller/view/prototype, domain types/contracts/capabilities/layout, guards, delivery, native and daemon Model logic, App/Core readers and schemas through full files or decisive bounded sections. It inspected plugin harness, keyboard fixture, virtual dependencies/deck/focus/scenarios/host lifecycle, controller backend fixtures, command/type/layering/coverage/Knip configurations and relevant ADRs/docs. It verified existing implementation links. Decisive truncated source ranges were reread. No read failures, earlier review reports, edits, tests, builds, native probes or subagents.

All three Stage 9 reviewers completed. Across their reports there are eight raw Major findings and two raw Nits, including overlapping items that the consolidated report deduplicates. Readiness and Codebase Details concluded that the passive/fixture plan still leaves design decisions to an implementer. Native qualification dependencies were treated as explicitly deferred scope. No remediation or convergence audit ran.
