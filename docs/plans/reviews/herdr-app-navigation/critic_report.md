# Feature design critique

**Scope** Lines 1–117. Three independent reviewers completed this stage. Design and Structural used the feature specification standard. Style used its assigned persona.

| ID | Lens | Severity | Lines | Finding and proposed action |
| --- | --- | --- | --- | --- |
| D1 | Design | Major | 74, 86–89, 103 | Timer-driven polling can overlap fresh checks. Define queue ordering and original expiry; pause a poll before key-down in both routes. |
| D2 | Design | Major | 27, 75, 86–91 | The four pane fields and provider/state can survive a process replacement. Limit identity claims to the observed pane and facts. |
| D3 | Design | Major | 21–22, 75–80 | Raw listing reorder changes the existing stamp and re-arms all keys. Define canonical guard inputs and test a reorder while a press waits. |
| D4 | Design | Nit | 75–76, 97 | Gaps accumulate until manual Collapse. State the cost of retaining historical slots, avoid repeated full scans per pane, and measure repeated closures. |
| S1 | Structural | Major | 85–91 | Becoming ready invalidates Attention, but ready agents remain valid tile and Next destinations. State the conditions per action. |
| S2 | Structural | Nit | 107–116 | The repeated author attribution adds little to the alternatives table. Preserve the reasons; if retaining attribution, tie it to the owner's approval rather than implying an upstream decision. |
| T1 | Style | Major | 52, 80 | The diagram places key-down capture on the queue. Show presentation and time captured before enqueue, consistent with the detailed plan and host code. |
| T2 | Style | Major | 85–91 | Independently identified the readiness/refusal ambiguity for tile and Next. |
| T3 | Style | Major | 33–35, 101 | State the upgrade impact in the feature section: existing Model, Effort and Permissions controls become inactive, even with prior opt-ins and saved overrides. |
| T4 | Style | Nit | 15 | Attribute the physical walkthrough to the owner and distinguish it from instrumented native requests. |
| T5 | Style | Nit | 24–25 | A closed or removed pane leaves a gap. A pane reporting done can remain present and eligible for Attention. |
