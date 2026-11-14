# Final Herdr App implementation review

**Date** 2026-11-14  
**Scope** Current pending navigation fixes, P1 passive controls, P2 probes and isolated virtual deck harness

Four fresh-context Goldfish reviewers inspected the implementation and revised
design. No previous review/resolution claims were supplied to the three
implementation reviewers. The independent design verifier read the eight
consolidated findings and compared the design without the authored resolution
record. Reviewers ran no tests, builds or live actions.

## Results

| Review | Result |
| --- | --- |
| Passive projection | No actionable defects. App-selected targeting, exact addresses, one-time bank following, stable polls, retirement, inert overrides and target cue were checked. |
| Navigation and delivery safety | No actionable defects in pending tracked production diffs. Endpoint/peer continuity, queued captures, closure, consent, single-use delivery and no retries were checked. |
| Native harness and claims | One Major and one Nit, both fixed and rechecked by the same reviewer. No additional activation-gating or OSC-evidence issue. |
| Independent design closure | G2-01–G2-08 addressed at design level. One Markdown table Nit was corrected by the author after the review. |

## Findings and closure

| ID | Severity | Defect and resolution | Verification |
| --- | --- | --- | --- |
| FI-01 | Major | A launched editor whose first process inspection failed could be absent from the ownership table while cleanup still reported success. `editor-launch.cjs` now sets launch-attempt and unproven-launch bookkeeping before reporting failure, preserving the evidence directory. | Two fixture tests cover post-launch ownership failure, successful registration and pre-launch gate refusal. Reviewer rechecked the wrapper and cleanup. Updated owned live run passed. |
| FI-02 | Nit | The final background Attention press followed the last zero-key-event assertion. A fresh editor sample now rechecks PID, frontmost/focused state, zero focus loss and zero key events after both Attention and consent revocation. | Reviewer rechecked both call sites. Updated owned live run passed. |
| FI-03 | Nit | A blank line detached the step-5 integration-test entry from its GFM file table. Removed the blank. | Author checked contiguous table rows. No implementation or gate changed. |

The recheck of FI-01/FI-02 found no residual issue. Runtime validation remains
the author's executed evidence, separately recorded in the
[validation record](../../../validation/2026-11-14-herdr-app-agent-controls.md).
The final live pass took 36.4 seconds. Full final coverage ran 718 tests, with
714 passing and four skipped; thresholds remained unchanged.

## Read provenance

All reviewers first read repository AGENTS and their assigned Goldfish persona.
Projection fully read its domain/controller/view modules, inspected host
routing/polling, selection/navigation, lifetime guards, frame cache/rendering,
unit/integration/browser coverage and P2 probes. Safety read all changed
production files, changed contract/integration/browser assertions, both
approved designs, ADR 0004/0007 and surrounding authority/transport/dispatch
code. Harness read the requested live/probe/browser/guide files, relevant
design sections, owned environment/processes, launcher/isolation/containment,
lease/cleanup and virtual-host lifecycle. Its recheck inspected the new launch
wrapper, regression tests, updated walkthrough and existing cleanup.

Design closure read all 637 pre-format-fix design lines and the consolidated
findings, selected frozen comparison passages, Core client/schema interfaces,
native parser/entry/command passages, backend lifecycle, cue/rendering and
browser registration. Its substantive result applied to SHA-256
`71cdafc1d0f5306f9d5110d4d9c464899bd41e1b1a87fb6a8d9ea09309d12d3a`.
The final edit only joined the detached table row. The manifest records the
resulting design hash separately from the original frozen review snapshot.

## Qualification boundary

The reviewed implementation delivers passive tracking and the compact Model
target cue. It adds reproducible comparison evidence for both delivery paths.
No active Model capability or speculative shared permit contract was enabled.
The live pane programs are OSC status fixtures, not Codex/Claude sessions.
Neither real recipient currently qualifies for P3/P4 active Model work.
