# Herdr App navigation design review

**Reviewed target** [Approved experimental navigation design](../../HERDR-APP-NAVIGATION-DESIGN.md), commit `1b987fbd041498629f32fb165ec3fc3c9b0465b0`. Feature specification lines 1–117. Implementation plan lines 118–156.

## Actions from the five stages

**Verdict: revise the design before implementation.** The review supports separating navigation from provider writes. The principal unresolved behavior is whether the destination the user sees is still the one a press can reach during feedback, a concurrent poll or a change of observation source. All five stages and ten independent reviewer assignments completed. No reviewer classified a finding as a Blocker. The readiness standard still fails where different reasonable implementations produce different user-visible or guard behavior.

Start with A1–A6 and A12: write down the visible-key, source-lifetime and action-specific rules together. Then address the inspector and older overrides, calibration, and buildable checkpoints. Each acceptance case below is a proposal, not a runtime result.

Each row groups independent findings about the same decision. The last column traces the action back to entries in the five stage reports. The priority reflects impact on this milestone. Proposed remedies are review recommendations.

| Action | Priority | Proposed revision and acceptance case | Stage findings |
| --- | --- | --- | --- |
| A1 · Bind an actionable face to its visible destination | Major | While a full-face “Focus requested” notice hides Attention's next target, make the key inert, or keep the target visible. After a successful request and the normal arming delay, a second press on a notice-only face must cause zero additional effects. Show and arm the new target before accepting another press. | M1 |
| A2 · Use App identity for actionable labels | Major | Name tiles and the Attention destination from the App's pane, with a provider fallback. Keep any secondary Core metadata visibly attributed. Test two cores whose terminal address, state and provider match but whose task titles differ. | I2, M6 |
| A3 · Coordinate polls with fresh press reads | Major | If a periodic read already owns the reader, wait only within the original press budget. Perform the press's own post-key-down observation; expire when time runs out. Test short and long paused polls for local and consented routes. | Z4, I1, D1, M5 |
| A4 · Define observer-only availability and transition rules | Major | Specify the key face and offered local action when an App is readable but a private build record fails to match. Make an explicitly fresh observer-only presentation available when safe. Losing verification after key-down expires the old focus press. Exercise both transitions and count zero focus writes. | Z1, C2, M2 |
| A5 · Specify when presentation identity changes | Major | Canonicalize guard inputs by stable slots. A harmless reorder must preserve the original Next target and arming time. Define which provider, selection, eligibility, configuration or instance changes expire each action. Test a reorder between key-down and dequeue. | Z2, D3, M3 |
| A6 · Limit target claims and separate action rules | Major | Guarantee the full App pane reference and freshly reported facts. A replacement process can produce identical facts. Only Attention specifically requires the same qualifying reason. Define the disposition of tile and Next presses if the target becomes ready, including how this interacts with the stamp. | Z3, D2, M4, C1, S1, T2, M7 |
| A7 · Specify both selection markers | Major | Set expectations for the deck marker and App badge at acknowledgement, when the App first reports the requested pane, and when it later reports a third pane. The observation does not identify who initiated a change. | C3, M8 |
| A8 · Describe preview upgrade behavior | Major | Tell preview users that Model, Effort and Permissions become inactive until App-to-Core identity is established. Test an old saved override with prior opt-ins. | C4, T3, M9 |
| A9 · Correct capture ordering in the diagram | Major | Draw key-down capture of the visible presentation and timestamp before enqueue. A later render must not supply the destination for an earlier press. | T1, M10 |
| A10 · Bound or document slot retention costs | Nit | Specify the time and memory cost of gaps that survive until Collapse. Exercise long-lived churn and measure reconciliation work as well as SVG draws and emitted frames. | D4; Stage 8 lower-priority follow-up |
| A11 · Tighten wording and attribution | Nit | Use `none` for the vacant fourth position. Clarify that removing a pane creates a gap while a listed done agent can qualify for Attention. Attribute the hardware result to its observer. Attribute alternatives to the project decision if needed. | C5, S2, T4, T5; Stage 8 lower-priority follow-up |
| A12 · Invalidate stale source and view state | Major | Bind snapshots and queued presses to the actual reader plus its endpoint generation. Reset slots, selection and bank on unproven continuity. Distinguish valid observation of a changed target from failure to validate the whole view. Test a replacement reader reusing generation 1 and the same pane IDs, and a tile press immediately after an ambiguous read. | R2, B3, R3 |
| A13 · Make overrides usable through the inspector | Major | Enable Attention and Position default in the App selector. Through the real inspector event path, assign Attention and clear an old override, then inspect the emitted settings. | B4 |
| A14 · Preserve the calibration provider distinction | Major | For plain calibration panes preserve the raw observed null. Refuse unknown strings and absent data where explicit null is required. Product navigation still requires a recognized provider. | B5 |
| A15 · Specify when a failed press burns its permit | Major | Distinguish begin (burns one press) from final write authorization. A preflight refusal must make zero focus writes and a replay with the same permit must fail. | V1 |
| A16 · Deliver buildable implementation phases | Major | Group export moves and strengthened permit contracts with all typed producers, fixture callers and consumer updates. Name the focused verification at each checkpoint. | R4 |
| A17 · Make fixture evidence measurable | Nit | Distinguish preflight reads from mutation writes, qualify synthetic host events, and specify changed key contexts, frame emissions and cache misses at closure and notice expiry. | V2, V3, V4 |

Stage 9 also independently confirmed that the hidden destination (B1 → A1), simultaneous observations (B2 → A3), and unstable presentation stamp (R1 → A5) persist in the implementation plan.

## Review record

1. [Initial zoom-out report](zoom_out_report.md) — architecture and inventive alternatives.
2. [Comprehension report](comprehension_report.md) — both independent paraphrases and all findings, using the target alone.
3. [Feature design critique](critic_report.md) — design, structure and style.
4. [Intermediate zoom-out report](intermediate_zoom_out_report.md) — checks against earlier stages and the notice-face finding.
5. [Implementation readiness report](implementation_readiness_report.md) — implementation readiness, codebase details and style.

The [reading list](reading-list.txt) contains 40 linked repository files and the [approved snapshot of the Herdr Core README](herdr-core-README.md). The upstream revision is [3965a46c](https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/README.md). Snapshot SHA-256: `b7b3a0c8028b462dffe4239d569ebe3456fba77a14d83c6b5c8062b1d1b24a52`. Each reviewer used a fresh conversation context. This is a review of the document and repository sources. Runtime checks in the findings are proposed acceptance cases.
