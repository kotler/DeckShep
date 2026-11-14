# Initial zoom-out review

**Scope** Entire Herdr App navigation design, lines 1–156. **Reviewers** Zoom Out and Inventive Catalyst, in independent contexts. Both used the repository reading list and the pinned Core README.

| ID | Severity | Design lines | Finding and proposed action |
| --- | --- | --- | --- |
| Z1 | Major | 29, 74–75, 128, 134 | The controller chooses its verified source when the helper and records exist. A runtime build mismatch can erase an otherwise usable local roster. Specify when a fresh read-only observer takes over, invalidate presentations from the old source, and test a mismatch with zero focus writes. |
| Z2 | Major | 13, 76, 128, 148 | The current stamp includes raw listing order. A reorder can restart the arming delay or expire Next despite an unchanged destination. Define the stamp in stable slot order and exercise a queued press across a reorder. |
| Z3 | Major | 27, 86–91, 122, 130 | A retained terminal can host a new process with the same provider and state. App observations identify the displayed pane and its reported facts. Narrow the “same agent” guarantee to those observable facts. |
| Z4 | Major | 84–87, 130, 149–150 | A periodic observation can already be running when the press arrives. The reader rejects overlap. Coordinate the pending poll and the press's own fresh check within the original expiry. Cover both local and verified routes. |
| I1 | Major | 86–89, 130 | Independently identified the poll collision. Include both the success case after a short poll and expiry after a long one. |
| I2 | Major | 68, 97, 114 | A Core title can take precedence over the App pane's name even when two cores have matching address, provider and state. That can label an actionable tile with another task's name. Use the App name for the destination and test conflicting titles. |

Source anchors include `src/app/herdr-app-controller.ts` (observation source and stamp), `src/app/controller.ts` (periodic refresh), `src/terminals/herdr-app/selection.ts` (single pending read), `src/app/herdr-app-view.ts` (title precedence) and the [pinned README](herdr-core-README.md).
