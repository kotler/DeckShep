# Fresh Design Critique

**Stage** 7  
**Date** 2026-11-14  
**Target** [Reviewed design snapshot](reviewed-design.md), feature lines 1–158

Three fresh-context reviewers completed. Design and Structural read the Feature Specification standard. Feature Style used its persona without an additional standard. Design and Style each reported one Major finding. Structural reported no findings and a pass against its standard.

## D2-1 — Major — Identify the active recipient while its tile is off-bank

Affected line 38, with the background-use goal at line 24.

One-time bank reveal identifies the target until the user pages elsewhere. With App-selected A on bank 1, an editor frontmost, and the user browsing bank 2 and selecting B locally with focus consent off, row 3 continues to control A. B can display On deck while A’s dot is off-bank. Ownership and stale-input checks can all pass for this intended current operation, while the user cannot identify its recipient from the deck.

Specify a persistent visible target cue when the target is off-bank or differs from the local choice. One possible mechanism is a label and stable bank/slot location on an existing surface. Add the A-off-bank/B-local/editor-frontmost acceptance case and require that A can be identified before Model without raising Herdr.

Evidence includes the explicit bank behavior at target line 38; App view lines 125 and 146 placing local and App markers on agent tiles; and its Page face at line 155 showing the browsed bank without the control target. The reviewed concepts brief leaves off-bank target visibility open. The reviewer accepted the documented native qualification dependencies as gates rather than additional findings.

## FS2-1 — Major — Calibrate the claimed existing event subscriber

Affected line 58. Editorial action CALIBRATE.

The claim that runtime code can use the existing typed socket client for the necessary event subscription presents proposed functionality as available. `HerdrCoreClient` exposes bounded request/response reads, the request schema excludes `events.subscribe`, and `ReadOnlyLines` rejects unsolicited notifications. The paragraph depends on event continuity.

Say to reuse the typed client for hello/status/get and add a separately validated event subscriber for continuity. The staged pinned Core protocol explains that plain-mode subscriptions require a dedicated connection. Identify this as new work or a qualification dependency rather than an existing client capability.

## Structural result

No Blocker, Major or Nit findings. The feature covers the problem, phased scope, architecture, alternatives, risks and verification. Heading nesting, table and Mermaid fences are sound. The standard does not require literal risk headings. All 17 distinct feature-local link targets exist. Qualification gates and the distinctions between passive tracking, first active Model and later controls are explicit.

## Read provenance

All reviewers fully read their assigned persona and feature range. Design/Structural fully read the feature standard. Design fully read AGENTS, App guide, profiles, ADR 0002/0007, controls brief/evaluation, upstream snapshots, domain selection/navigation/layout/backend/capabilities, App view/prototype, App selection reader, native Codex settings and verified-control guard. It inspected App controller through line 466, view tests and Model formatting searches; later target sections were consulted for definitions only.

Structural fully read AGENTS, App guide, profiles, ADR 0002/0007, controls brief/evaluation, selection/capabilities/layout domain files and App selection reader. It inspected controller projection/selection, native Model and daemon selection/cycle passages, and later target definitions only.

Style fully read the reading list, controls brief/evaluation, App guide, pinned Core README, Core reader/transport/line client, App selection types/reader. It inspected ADR 0007 through line 190, App controller selection and native/daemon Model/schema sections. Required truncated reads were recovered; supporting excerpts remained scoped where recorded.

No required read failed. None opened historical/fresh review reports or authored resolution claims, changed files, ran tests/builds/live probes, or spawned subagents.
