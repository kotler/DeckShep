# Fresh Intermediate Zoom Out Review

**Stage** 8  
**Date** 2026-11-14  
**Target** [Reviewed design snapshot](reviewed-design.md), lines 1–620

The fresh reviewer completed the full target, persona, Zoom Out standard and all three preceding fresh stage reports. It found no additional independent architecture issue. It corroborated two Major findings and one Nit, without classifying a Blocker.

## M2-1 — Major — Persistent recipient identity during browsing

Corroborates D2-1. Affected lines 24, 38, 459–463 and 593–595.

One-time bank reveal allows later Page browsing to hide A while B is marked On deck. The Model/value face does not identify A with the editor frontmost. Correct ownership guards do not resolve the user’s recipient ambiguity. Specify a bounded persistent cue on an existing visible surface when the control target is off-bank or differs from local choice. Preserve browsing and test identification before Model in that situation.

The earlier zoom-out pass accepted explicit bank behavior. That does not by itself settle persistent identity after subsequent browsing. Source evidence includes App marker placement and the Page caption, plus preservation of local choice across unchanged App observations.

## M2-2 — Major — Event subscription requires new adapter work

Corroborates FS2-1. Affected line 58, with related feasibility requirements at 497–499.

The existing Core client supplies bounded request/response reads. Its schema omits subscription and line client rejects unsolicited traffic. Preserve reuse for reads and explicitly identify a separately validated event subscriber, schemas and lifecycle as new work after P2 establishes the real mapping. Plain-mode Core events require a dedicated connection. Core events alone still do not establish App focus authority.

## M2-3 — Nit — Preserve both native footer cases

Corroborates C2-1 with a clarification to the suggested remedy. Affected lines 336, 349, 365, 512 and 595.

The composer model/status footer can be absent under the current Rex parser. The picker interaction footer is required. Explicitly preserve both the empty-composer/absent-model-footer path and the recognized current-model-picker path. Missing required picker chrome remains a refusal. The earlier comprehension recommendation alone could narrow the former supported case.

Evidence includes native settings lines 76–89 and 98–116 accepting an empty composer footer, lines 377–392 validating picker entry, and lines 440–455 recovering effort through current-model inspection.

## Assessment and read provenance

The staged feasibility and reuse choices remain appropriate. Lease, deadline and retirement machinery follows the approved zero-late-effect requirement. No evidence justifies weakening it into polling or selecting a route before qualification.

Fully read the assigned persona/standard, target, reading list and all three fresh reports; AGENTS, README, App guide, ADR 0002/0007, controls brief/evaluation, staged Core README/input, App controller/view/prototype/diagnostics/inspector, domain selection/navigation/backend/types/capabilities/layout, delivery/pipeline/verified-control, guarded backend, App selection/Core reader/transport/line client, Herdr schemas and panel/frame-cache context. Profiles were inspected and root controller/daemon searched. Optional context was not exhaustively traversed. Required truncation was recovered. One guessed optional filename was absent and replaced by reading the actual transport files. No required access failed.

No historical review/resolution or independent verification report was opened. No edits, tests, builds, live probes or subagents ran.
