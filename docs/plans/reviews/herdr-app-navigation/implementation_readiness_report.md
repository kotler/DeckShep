# Implementation readiness review

**Verdict: revise before implementation.** The plan covers the happy path and identifies appropriate source files. It leaves decisions affecting target visibility, observation ownership and upgrade behavior to the implementer.

**Scope** Design lines 118–156. Three independent reviewers completed the stage. Implementation Readiness and Codebase Details used the implementation-readiness standard. Style used its assigned persona.

| ID | Lens | Severity | Lines | Finding and proposed action |
| --- | --- | --- | --- | --- |
| R1 | Readiness | Major | 122, 128, 148, 154 | Specify canonical stamp inputs and test a listing reorder during arming. An identical roster must be actionable at the original deadline. |
| R2 | Readiness | Major | 122, 128, 152 | Endpoint generations restart on new observers. Define controller-owned source identity and the reset policy for retained slots, bank, deck choice and pending presses. Test replacement with identical refs and generation 1. |
| R3 | Readiness | Major | 130, 148–152 | A failed fresh observation can leave stale local tiles armed. Distinguish a valid but changed target from an invalid or ambiguous view. Disarm or invalidate the latter and exercise a second press before a successful poll. |
| R4 | Readiness | Major | 120–140, 156 | Moving exports and changing required permit fields breaks callers in intervening steps. Group type changes with producers, JS fixtures, consumers and narrowly scoped verification to form buildable phases. |
| B1 | Codebase | Major | 126–130, 151, 154 | A full-face notice can conceal an actionable target after normal arming resumes. Test a second press before notice expiry, both after a stale press and after success. |
| B2 | Codebase | Major | 128–130, 152 | The periodic refresh runs outside the press queue. Specify who owns reads and how to reject late results; cover pending polls in both routes. |
| B3 | Codebase | Major | 122, 128, 152 | The observer factory exposes observe/dispose, and replacement readers can both start at generation 1. Tie accepted snapshots and slots to their actual source and reset when continuity cannot be proven. |
| B4 | Codebase | Major | 126, 134, 138, 140 | The App inspector disables Attention and the empty value for Position default. Permit both UI choices when appropriate and verify the actual inspector setSettings event, including clearing an existing override. |
| B5 | Codebase | Major | 122, 124, 130, 136 | Existing provider normalization maps both null and unknown strings to null. In calibration's plain-pane case, compare raw evidence and distinguish explicitly null, unknown and absent. Test null→null and null→unknown. |
| V1 | Style | Major | 124, 136 | Distinguish burning the permit at begin from consuming the lease at the socket write. A failed preflight burns the permit and makes zero focus writes; a replay cannot succeed. |
| V2 | Style | Nit | 136, 150–151 | Count preflight socket requests separately from pane.focus writes. Zero focus writes is compatible with successful preflight reads. |
| V3 | Style | Nit | 138 | Attribute synthetic events to the fixture host exercising the normal controller entry point. |
| V4 | Style | Nit | 154 | Identify exactly which faces change after a closure or notice expiry. Assert emitted frames per changed context, and count drawing separately because a cached spec can avoid an SVG build. |

Relevant baseline locations include `src/inspector/index.ts:175`, `src/app/herdr-app-controller.ts:276`, `src/app/controller.ts:1747`, `src/terminals/herdr-app/selection.ts:121`, and `src/app/herdr-app-view.ts:79`. All three reviewers confirmed reading the target, persona and supplied context including the pinned Core README.
