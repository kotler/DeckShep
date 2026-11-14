# Design Critique

**Stage** 7  
**Target** [Herdr App agent controls design](../../HERDR-APP-AGENT-CONTROLS-DESIGN.md), feature lines 1–153  
**Date** 2026-11-14

Design, Structural and Style reviewers completed in separate fresh contexts. Design and Structural applied the Feature Specification standard. Style applied its persona without an additional standard. One Major finding and two Nits were reported. No required read failed.

## D1 — Major — Recipient ordering omits local authorization invalidation

Affected lines 79–85, 112 and 150–152.

The design requires hiding a key or revoking consent to invalidate a capture, including delayed work. It explicitly rechecks consent at final client I/O. Recipient coordination describes App focus, process/session, ready state and expiry, but does not explain how the receiver learns a subsequent DeckShep consent, visibility or presentation change.

A valid request can pass the last client check and wait at the receiver. The owner then disables input consent while focus, session and readiness remain unchanged. Releasing that request before expiry still permits the first effect under the enumerated receiver conditions. Hidden/remapped keys and scope changes have the same gap.

Add DeckShep authorization and presentation lifetime to the recipient contract. Specify how invalidation and committing an effect are ordered, the revocation linearization point, disconnection behavior and acknowledgements. Carrying a captured revision alone does not communicate a later revocation. Name the required coordination as a capability dependency. Add a held request with revocation after the last client check, followed by receiver release.

Evidence includes target lines 81 and 83, recipient coordination at 150–152, later captured visibility evidence at 166 and the acceptance promise at 252. Existing `src/app/delivery.ts` at 140–178 checks consent and visibility on the client. `src/guards/pipeline.ts` at 108–125 consumes before transport. The pinned Core input excerpt at 121–162 shows work occurring after dispatch.

## S1 — Nit — Bank-following behavior belongs in the feature contract

Affected lines 22, 35–39 and 138.

The feature says Page browsing does not change the control target but leaves visible-bank behavior implicit. The implementation at line 193 chooses to reveal the App-selected pane’s bank once, then allow local browsing without identical polls pulling it back. The brief had identified off-bank visibility as open.

Summarize the chosen bank behavior in Goals or the focus-observation subsection. This moves an existing user-visible decision into the feature contract.

## S2 — Nit — Integration paragraph retains an outdated planning dependency

Affected line 106.

The statement that the implementation plan will enumerate files after delivery selection suggests the whole plan is pending. The document already enumerates passive tracking and both candidate evaluations. Only production adapter details remain conditional on a demonstrated receiver contract.

Update the paragraph to describe the existing staged file plan and its narrower outstanding adapter dependency.

## Feature Style result

No findings. The reviewer judged the feature clear and calibrated to its evidence. It distinguishes passive presentation, fixture results, proposed recipient guarantees and native qualification. Caveats identify concrete decisions about arming Model, route selection, partial completion or fresh user action. No caveat warranted DROP, CALIBRATE or RELOCATE.

## Read provenance

Design fully read its persona, standard and target feature range, AGENTS, App guide, profiles, ADR 0002, controls brief and evaluation, App selection types/reader, Core reader and guard pipeline. It consulted ADR 0007, delivery lines 128–190, the pinned Core README/input and later target definitions to resolve the captured condition. No inaccessible files.

Structural fully read its persona, standard, feature range, reading list, AGENTS, App guide, profiles, ADR 0002/0007, controls brief/evaluation and App selection types. It consulted the remaining target only for definitions and searched App controller/view/reader sources. Initial output truncation was recovered through smaller reads. No unavailable files.

Style fully read its persona, feature range, reading list, controls brief/evaluation, App guide and ADR 0002. It consulted partial ADR 0007 and symbol searches in Codex native/daemon settings. Context excerpts were partial where recorded. No access failures.

This was a report-only stage. No reviewer changed files, ran tests or live probes, retrieved chat history or read earlier review reports. Design remediation and convergence audits have not run.
