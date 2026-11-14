# Intermediate zoom-out review

**Scope** Stage 8 reviewed all 156 lines of the Herdr App navigation design. The initial zoom-out, comprehension and critic reports proposed changes. The target still contains the original design.

## Additional finding

### M1 · Major · A feedback face can conceal the destination of the next press

**Design lines 27, 76, 91, 126–130, 154.** The presentation records a destination even when a notice can replace the entire face. For example, a successful focus request moves the deck choice to Claude. Attention can now point to a different waiting agent while the key still reads “Focus requested.” With the existing 2.5-second notice and 350 ms arming delay, a second press can reach that other agent before its name appears. The view returns the notice before drawing the action, and the controller computes the presentation for that same key independently. [Current view](../../../../src/app/herdr-app-view.ts) · [Current controller](../../../../src/app/herdr-app-controller.ts)

Make the notice state part of resolving the visible action. For a full-face notice, keep the key inert until it shows a destination again. Alternatively, keep the target and action visible alongside feedback. For the first option, press Attention again while the notice is visible after arming would ordinarily have elapsed. Require zero additional writes or selection changes. Then let the notice expire and check that the visible destination can be selected after arming. This concerns the time a notice is visible. The existing expiry test counts frames only. **New finding.**

## Earlier findings checked against the full plan

| ID | Severity | Design lines | Finding, mitigation and remaining decision | Earlier findings |
| --- | --- | --- | --- | --- |
| M2 | Major | 29, 74–75, 80, 128, 134 | The plan distinguishes observer availability from peer verification and forbids changing delivery mode during a press. It leaves initial source selection on a build mismatch open. Specify when a fresh observer may supply local keys and what those keys show with consent enabled. A later loss of verification must expire a captured focus press. | Duplicates Z1 and C2 |
| M3 | Major | 21–22, 75–80, 128, 148 | Stable slots address list reordering. The existing stamp also hashes the whole snapshot, and step 4 leaves the guard inputs unspecified. Define them in stable slot order and exercise a queued press across a reorder of otherwise identical records. | Duplicates Z2 and D3 |
| M4 | Major | 27, 74–75, 86–91, 130 | The fresh check limits the destination to one full pane reference, reported provider and qualifying reason. A replacement process can report the same facts in that pane. Describe the observable guarantee and preserve the separate identity requirement for future provider writes. | Duplicates Z3 and D2 |
| M5 | Major | 74, 86–89, 130, 149–152 | The plan reuses the sender's existing preflight and retains original expiry. A timer poll already in flight can occupy the same reader, which rejects concurrent reads. Specify how the press obtains its own fresh observation after a short poll and refuses after a long one, for both delivery modes. | Duplicates Z4, I1 and D1 |
| M6 | Major | 68–70, 75–76, 97, 114, 126 | App facts determine eligibility, yet optional Core display facts can still give an actionable tile the title of a task on a different Core. Use the App-reported name or a provider fallback for the destination a user chooses. Test colliding addresses and different titles. | Duplicates I2 |
| M7 | Major | 85–91, 130, 151 | Step 5 ties the reason check to Attention. The feature text still says becoming ready causes a refusal for an unspecified target. Define the tile and Next outcome when the same pane/provider remains present and its status changes. | Duplicates C1, S1 and T2 |
| M8 | Major | 39–41, 95, 126, 130, 150 | Moving the App badge from observation and clearing the deck choice on reported selection changes are both specified. Say what each marker shows when Herdr first reports the requested pane, then a third pane. Either observation can arise without knowing who initiated it. | Duplicates C3 |
| M9 | Major | 33–35, 101, 132, 153 | Step 6 explicitly closes existing Model, Effort and Permissions writes while preserving saved overrides and preferences. Surface that upgrade impact in the feature section so a user can predict what an existing key will do. | Duplicates C4 and T3 |
| M10 | Major | 52, 80, 128 | Step 4 specifies capture before enqueue. Bring the diagram into agreement so a queued press cannot acquire a presentation first observed after key-down. | Duplicates T1 |

The remaining editorial and cost findings persist at lower priority. Four actions occupy five positions, with the fourth position mapped to `none` (C5, lines 19–25, 76, 122). Retained slots can grow with closures, and the multi-closure fixture measures rendering rather than scan cost (D4, lines 75–76, 97, 154). Alternatives repeat author attribution (S2, lines 107–116). The walkthrough's owner-observed result and instrumented checks merit separate attribution (T4, line 15). An agent reporting done stays eligible for Attention until its pane disappears or its status changes (T5, lines 24–25).

**Read confirmation.** Reviewed the Zoom Out persona and standard, the full design, all 41 entries in the supplied reading list including the pinned upstream Core README, and all three prior reports. Checked the App view, controller, reader, focus sender and shared navigation code for existing mechanisms. This was a document and source review. No live operation ran.
