# Goldfish Annotated Resolution Report

**Target** [Herdr App agent controls design](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md), full file  
**Date** 2026-11-14  
**Revised design SHA-256** `5bdce7254aa05b505cd69eee53cc3cd9175694b3f8afe4272d8beb8d5efbef3b`  
**Status** Resolved through document edits; independent re-review pending

The owner authorized revisions addressing all 11 findings in the [consolidated review](consolidated_review_report.md). All findings were classified PROPOSE FIX and applied. Original severities are retained. There are 11 applied fixes, zero contested, escalated or declined findings, and zero remaining unapplied finding edits. Receiver feasibility and native qualification remain explicit implementation dependencies.

The original review applies to design SHA-256 `b1086bcfab27cc0d60d8afee00fc1b50e22f8790414ed8540c466d42c4f490fd`. The original stage reports and manifest retain that baseline. The links below identify replacement sections in the revised design.

## Major findings and applied edits

### G01 — Feasibility before shared authority — Major

**Classification** PROPOSE FIX, applied.

The ordered plan extended production contracts and guards before investigating the actual receiver interface. That could commit speculative revisions or lease semantics to shared code.

The [work-order boundary](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#work-order-and-feasibility-boundary) now delivers P1 passive tracking and P2 source/test-owned probes first. P3 promotion into production types and shared guard integration is conditional on a recorded supported mapping. A missing capability yields an unqualified route and preserves the independent passive deliverable. Both delivery candidates remain in the comparison.

### G02 — Recipient authorization and revocation ordering — Major

**Classification** PROPOSE FIX, applied.

Captured visibility and consent revisions did not tell a receiver about later invalidation. The design now names the committing authority, its key authorization registry and closed-through revisions, the retirement linearization point, and the acknowledgement that proves no further effects can occur.

The [recipient contract](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#recipient-clock-authorization-and-commit-ordering) serializes invalidation and individual effect commits in the fixture. Local disable immediately stops new dispatch. Unknown remote retirement is quarantined and cannot be described as cancellation. The real route must demonstrate the same zero-late-first-effect barrier. The matrix includes revoke-after-final-I/O, release-before-expiry and commit-before-retirement cases.

### G03 — Candidate protocol and exact-input/stage grants — Major

**Classification** PROPOSE FIX, applied.

The plan lacked executable types, a selected expiry mechanism and exact binding between permits, stages and low-level inputs.

The [client declarations](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#p3-client-and-fixture-contracts) define binding, observation, capture, authorization, lease, receipt, payload, step, result and port methods. The fixture uses one receiver-owned monotonic clock and the original press deadline. [Grant and stage rules](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#exact-input-grants-and-stage-progression) bind complete immutable inputs in issue/consume, include provider parameters, and specify every command/menu/effort/session transition. The file list adds the delivery-authority interface change and exact substitution tests.

### G04 — Concrete kernel bridge and generation ownership — Major

**Classification** PROPOSE FIX, applied.

The separate App navigation authority did not define a working path into `DeliveryKernel` or ownership of Model generations.

The [kernel bridge](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#kernel-bridge-and-generation-ownership) now defines the service constructor/options/methods, session adapter, bound target mapping, current-press projection, active low-level context, evaluation backend constructor and kernel callback sequence. The Model backend owns its generation. A new service connects before publishing a capture, and its source identity prevents equal numeric generations from reviving old work. A normal host event through the complete kernel/receiver is the first integration checkpoint.

### G05 — Truthful capabilities for each route — Major

**Classification** PROPOSE FIX, applied.

The shared Model requirement for `sendKeys` would force an API-only receiver to claim a keyboard interface.

The [route policy](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#route-specific-capability-policy) defines `conditionalModel`, `providerSettings`, exact native/API capability sets and the record’s Model route. API verifies read/cursor eligibility and conditional provider settings while advertising no `sendKeys`. The plan lists `src/domain/capabilities.ts` and route-specific verification tests. Mismatched routes and cross-route input refuse before transport.

### G06 — Shared pure provider eligibility — Major

**Classification** PROPOSE FIX, applied.

The API candidate could not reuse native composer/current-picker eligibility through the existing value parser.

The [eligibility section](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#shared-pure-model-eligibility) specifies `inspectCodexModelEligibility` and its three result alternatives. It reuses existing native checks and preserves their feedback. The actual native Model cycle and API adapter consume that same initial policy. The source modification and draft/highlight tests are in the file list. API catalog completeness and native-equivalent final UI remain qualification conditions.

### G07 — Outcome feedback and recovery — Major

**Classification** PROPOSE FIX, applied.

The prior result categories left presentation, value retention, lock release and recovery to an implementer.

The [outcome table](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#outcome-presentation-and-recovery) specifies pending, confirmed, refused, partial, uncertain and retired-source behavior. It pins key and inspector text, evidence clearing, notice duration, operation-lock ownership, quarantine, observation-only Refresh and 350 ms rearming. Retirement tombstones survive reconnection. Success uses the normal Model/value face. Lost replies never produce retries or fallback writes.

## Nits and applied edits

### G08 — Bank-following behavior in the feature contract — Nit

**Classification** PROPOSE FIX, applied.

Added the existing reveal-on-App-selection-change behavior to [Focus observations and row 3](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#focus-observations-and-row-3). Repeated polls preserve subsequent Page browsing. This promotes the approved behavior into the feature contract.

### G09 — Outdated planning statement — Nit

**Classification** PROPOSE FIX, applied.

Updated [Data flow and code boundaries](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#data-flow-and-code-boundaries) to describe the actual staged file plan and the narrower outstanding real adapter/activation mapping. It no longer says the entire implementation plan awaits route selection.

### G10 — Successful versus refusal cases — Nit

**Classification** PROPOSE FIX, applied.

The [common acceptance matrix](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md#common-acceptance-matrix) separates successful advance/wrap/recognized-picker cases from unsupported effort, unknown model, draft and initial-selection refusals. It also identifies partial native inspection effects when incompatibility is discovered after an earlier write.

### G11 — Package versus experimental eligibility — Nit

**Classification** PROPOSE FIX, applied.

The verification step now states that release packages include Rex and experimental Model eligibility requires the defined per-control/route evidence. It no longer presents package inclusion as runtime qualification.

## Verification of this revision

The three TypeScript declaration blocks were extracted into a private temporary file and typechecked with the repository’s TypeScript-native tool against existing referenced types. This checks declaration syntax and type consistency. It supplies no implementation or receiver evidence.

The revision also checks Markdown structure, local links and anchors, planned-file references, bounded fixed captions, G01–G11 coverage, and the distinction between passive work, test-owned experiments and qualified integration. The report records author-applied design fixes. A fresh Goldfish audit has not yet evaluated the revised design, and no native control was exercised for this revision.
