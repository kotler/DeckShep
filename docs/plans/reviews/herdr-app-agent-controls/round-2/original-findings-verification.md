# Independent Verification of the Original Findings

**Date** 2026-11-14  
**Target** [Reviewed design snapshot](reviewed-design.md), lines 1–620  
**SHA-256** `5bdce7254aa05b505cd69eee53cc3cd9175694b3f8afe4272d8beb8d5efbef3b`

A separate fresh-context Codebase Details reviewer verified the [original G01–G11 findings](../consolidated_review_report.md) against the revised design and relevant source. **All 11 original findings are addressed at the design level.** The reviewer did not read the author’s resolution claims or fresh stage reports. This conclusion supplies no real receiver or native background qualification evidence, and does not imply the fresh audit has no new findings.

## Closure matrix

| Original ID | Classification | Revised lines | Independent verification |
| --- | --- | --- | --- |
| G01 | Addressed | 161–169, 475–517, 565–571 | P1 passive tracking and P2 test-owned investigation precede production authority changes. P3 requires a supported mapping. This resolves sequencing rather than merely disabling a factory after speculative integration. |
| G02 | Addressed | 82–92, 294–324, 464–471, 599–600 | Authorization ownership, closed-through revisions, retirement methods, commit ordering and acknowledgements are explicit. Unknown retirement preserves quarantine. The matrix includes revoke-after-send and commit-before-retirement. Real enforcement remains gated. |
| G03 | Addressed | 171–349, 505–517, 524–536, 601 | Concrete payload/request/result/lease/receipt/step types, original clock deadline, exact-input immutable grants, stage transitions and authority-file changes replace the prior checklist. Substitution cases are independent. |
| G04 | Addressed | 382–455, 523–552 | Service/backend construction, session adapter, provider mapping, current press, kernel callback path and backend-owned generations are explicit. Normal host-event positives precede browser expansion. The connect-return wording below is a narrower API nit. |
| G05 | Addressed | 369–380, 506–508, 514, 526–528 | Separate native/API requirements and input kinds are defined. API advertises provider settings and observation evidence without sendKeys. Route agreement, exact capability files and negative tests are specified. |
| G06 | Addressed | 351–367, 511–513 | Pure shared eligibility has a concrete discriminated result and reuses native parser policy. Both candidates consume it. The value parser is explicitly insufficient. Provider changes and draft/highlight tests are named. |
| G07 | Addressed | 273–306, 322, 427–429, 457–471, 543–552, 602–604 | Result categories, feedback, evidence clearing, lock ownership, notices, quarantine, Refresh and rearming are defined. Unknown retirement survives reconnect and old completions cannot publish or unlock new work. |
| G08 | Addressed | 34–38, 475–486, 593 | One-time bank reveal and preservation of subsequent browsing appear in the feature, implementation and tests. |
| G09 | Addressed | 111, 163–169, 497–499, 571 | The obsolete all-file-planning dependency is replaced with concrete phased files and the narrower outstanding real adapter/activation mapping. |
| G10 | Addressed | 367, 595–596 | Success and expected refusal cases are separated, with partial inspection effects called out where incompatibility is found after an earlier native write. |
| G11 | Addressed | 571, 587 | Rex-only release packaging is independent of experimental Model runtime qualification. Saved flags and package inclusion cannot grant a route or consent. |

## V2-1 — Nit — Read generation from the backend after connecting

Affected line 451, with planned report changes at line 507.

The instruction to use the generation returned by `kernel.backend.connect(signal)` does not match the current API. `BackendInfo` has no generation field. `GuardedBackend.connect` increments the backend’s generation property and returns other metadata. The planned BackendInfo change adds route metadata only.

Read `kernel.backend.generation` after awaiting connection. The intended lifecycle owner and getter are otherwise clear, so this is an API accuracy correction rather than the original unresolved architecture decision.

## Read provenance and calibration

The reviewer fully read its Codebase Details persona, Implementation Readiness standard, original consolidated report, revised target and fresh reading list. It fully read ADR 0002/0007, App guide/profiles, delivery evaluation, staged Core README/input, native settings, delivery/App controller/view/prototype/inspector/diagnostics, domain types/backend/capabilities/selection/layout, pipeline/verified-control, contract backend, selection/Core readers, Herdr schemas, keyboard fixture/plugin harness/virtual deck, App daemon tests and verified-control tests. It inspected controller construction/dispatch, daemon catalog/Model, registry schemas, inspector status, virtual dependencies/scenarios and relevant tests through bounded sections/searches.

No required input was unavailable. Truncated required passages were reread. No author-resolution or fresh stage reports, edits, tests, builds, live probes or subagents were used. Initial checks considered whether minor generation/caption details reopened the original architectural/outcome findings; final calibration judged the substantive G04/G07 gaps addressed and reported the concrete generation nit separately.
