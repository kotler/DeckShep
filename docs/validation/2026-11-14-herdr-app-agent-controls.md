# Herdr App passive controls validation

**Date** 2026-11-14  
**Branch** `codex/herdr-app-navigation`  
**Scope** Passive App-selected Model projection, target cue, navigation regressions and P2 delivery comparison

## Executed checks

| Check | Observed result |
| --- | --- |
| Focused projection/view/controller tests | 44 passed |
| P2 Model probes | 8 passed, including intentional counterexamples to unconditional settings delivery |
| `npm test` | Final run 714 passed, 4 skipped, 0 failed |
| `npm run test:coverage` | Final run 714 passed/4 skipped; thresholds passed unchanged. Statements/lines 95.79%, branches 88.25%, functions 92.18%. New domain projection statements/lines/functions 100%. |
| `npm run test:golden` | 4 passed; no fixture regeneration |
| `npm run test:e2e -- tests/e2e/herdr-app.spec.ts --workers=1` | 14 passed; no screenshot or SVG baseline regeneration |
| `npm run typecheck` | Passed both source and E2E configurations |
| `npm run lint`, `npm run format:check` | Passed |
| `npm run deps`, `npm run knip` | Passed |
| `npm run version:check`, `npm run compatibility:check` | Passed, version 1.4.1 unchanged |
| `npm run compat:codex` | Codex 0.169.0 offered all 10 methods and parameters in use; schema-only inspection |
| `npm run build` | Passed, nothing installed or restarted |
| `npm run test:bundled` | 4 passed |
| Current design/evaluation/runbook/guide relative links, staged whitespace check (Markdown hard breaks permitted) | Passed |

The first sandboxed controller run could not bind private temporary sockets.
The fixture tests then ran with the required process/socket permission. A
browser test initially used the existing scenario's working Codex pane where
the new positive required ready; its setup was corrected. Concurrent synthetic
and live runs shared Playwright's default output directory, causing a missing
trace-file failure after browser assertions. Live output now uses
`test-results-live/`; the complete synthetic suite then passed. These earlier
attempts are not counted as successful validation.

## Authorized native run

The current owner authorization covered live integration through the virtual
Stream Deck against test-owned instances. The separate live command ran with
all required App/release authorization flags and the reviewed signed artifact
directory. The final run passed one Playwright test in 36.4 seconds after both harness review findings were fixed.

The launcher used owned copies of Herdr App 0.1.14 and Core 0.1.19, checked their
reviewed hashes/signatures and contained the updater. Chromium drove the virtual
deck through ordinary host events on a real clock. An independent verified
peer read checked App selection. The walkthrough covered local navigation,
consented Next/Attention, consent revocation and passive Model following.

A disposable Cocoa editor registered in the launcher's owned-process table
retained macOS foreground and keyboard focus while background App selection
moved to the reported ready Codex pane. Model appeared with its target cue.
Pressing this informational face left it unchanged. The editor reported zero
key events and zero focus-loss samples/activation notifications. Returning to
the reported waiting Claude pane cleared Model. The run required verified
cleanup and unchanged tracked owner settings before reporting success.

The agent labels came from fixed OSC status programs, not real Codex or Claude
sessions. No provider account, owner daemon, real agent or hardware Stream Deck
was exercised. This establishes passive background projection for the tested
App/Core pair. It does not qualify an active Model setting operation.

The editor-launch regression tests also passed. An injected post-launch ownership
failure sets unproven-launch bookkeeping, prevents a false cleanup claim and
retains the evidence root. The final walkthrough obtains fresh editor samples
after both Attention and consent revocation.

## Qualification outcome

Neither delivery candidate meets the approved active recipient contract.
Native lacks the required binding/cursor/conditional-commit evidence; API also
has ordering/eligibility differences and an unconditioned settings application.
P1 and P2 finish at the approved feasibility gate. P3/P4 active work awaits a
supported real interface mapping. The full model value and an active press
remain unavailable rather than being inferred from App titles.

See the [evaluation](../plans/herdr-app-agent-controls/delivery_evaluation.md),
[future native runbook](../plans/herdr-app-agent-controls/native-model-validation.md)
and [fresh design review](../plans/reviews/herdr-app-agent-controls/round-2/consolidated_review_report.md).
