# Fresh Consolidated Goldfish Review

**Date** 2026-11-14  
**Target** [Frozen reviewed design](reviewed-design.md)  
**SHA-256** `5bdce7254aa05b505cd69eee53cc3cd9175694b3f8afe4272d8beb8d5efbef3b`  
**Result** All 11 original findings addressed at design level. Eight new consolidated findings require revision: six Major and two Nit.

Five stages ran sequentially with fresh reviewers inside each stage. A separate reviewer verified original G01–G11 closure without the author's resolution claims. No design edits or runtime probes occurred during this review. Qualification of a real active Model route remains unresolved and is an explicit implementation gate.

## Findings

| ID | Severity | Required action | Frozen lines |
| --- | --- | --- | --- |
| G2-01 | Major | Keep the focused target identifiable while Page browses another bank or a local tile says On deck. The owner selected a compact cue on Model, retaining its current model value. Add the off-bank/editor-frontmost case. | 38 |
| G2-02 | Major | Describe the existing typed Core client as request/response reads only. Treat a dedicated validated event subscriber as new work. Core events alone cannot establish App-focus authority. | 58 |
| G2-03 | Major | Reuse native recognized composer/command/picker rules. Permit a footerless initial empty composer and recognized command-time footer changes. Require picker interaction chrome. Separate hidden-composer and current-picker positive cases. | 334–336, 365, 595 |
| G2-04 | Nit | Await connection, confirm service ownership and read `kernel.backend.generation`; `connect()` returns no generation. | 451 |
| G2-05 | Major | Place ordinary-key positive validation after controller factory injection, Model mapping, captured presentation and dispatch composition. Step 4 may validate the direct service/kernel/receiver chain. | 453–455, 534–550 |
| G2-06 | Major | Include the fixed browser method-registration script in P3's allowlist and expose the declared bounded commands through it. | 558–561 |
| G2-07 | Major | Declare the exact stable recipient identity used for retirement tombstones across reconnects. Keep callback/lock ownership separate. Changing observer epochs or state revisions must not evade quarantine. | 188–199, 471, 552 |
| G2-08 | Nit | Remove duplicated retirement requirements from reconciliation and reference their canonical section. | 616 |

## Traceability and calibration

| Raw finding | Consolidated action |
| --- | --- |
| D2-1, M2-1 | G2-01 |
| FS2-1, M2-2 | G2-02 |
| C2-1, M2-3, B2-2, IS2-1 | G2-03 |
| V2-1, B2-1 | G2-04 |
| R2-1, IS2-2 | G2-05 |
| B2-3 | G2-06 |
| IS2-3 | G2-07 |
| IS2-4 | G2-08 |

B2-1's raw Blocker classification is preserved in the stage report. The independent closure reviewer classified the same phrase as Nit. Consolidation uses Nit because the intended backend lifecycle owner/getter is otherwise explicit, no existing compiled code changes in this review, and the correction requires no new API or architecture decision. It must still be fixed before P3 implementation. The footer ambiguity is consolidated with the independently reproduced native-behavior mismatch at Major severity. Preserve the existing footerless composer behavior when resolving it.

## Stage results

| Stage | Report | Outcome |
| --- | --- | --- |
| 5 — Initial Zoom Out | [Zoom out](zoom_out_report.md) | Two reviewers, no findings. Feasibility-first sequencing and both routes are appropriate. |
| 6 — Comprehension | [Comprehension](comprehension_report.md) | One Nit ambiguity, folded into G2-03. |
| 7 — Design Critique | [Critic](critic_report.md) | Two Major findings; structural reviewer passes. |
| 8 — Intermediate Zoom Out | [Intermediate zoom out](intermediate_zoom_out_report.md) | Corroborates earlier issues and protects native footerless-composer compatibility. |
| 9 — Implementation Readiness | [Readiness](implementation_readiness_report.md) | Eight raw findings across three reviewers, deduplicated above. |
| Independent closure verification | [Original findings](original-findings-verification.md) | G01–G11 addressed at design level; new generation wording Nit. |

The [manifest](review-manifest.json) records exact source hashes and read boundaries. The reviewed target and staged source hashes remained unchanged through all five stages. Read inventories and corrected exploratory failures are recorded in the individual reports. Reviewers did not run builds, fixtures, browsers or native tests. Their conclusions grant no live or hardware claim.
