## What this proposes

Qualify all 15 Rex keys on Codex and Claude. Check that each key shows the expected state, acts on the selected agent, and refuses input when its target or draft changes. Record positive results and refusals separately for each CLI and hook configuration. Retest the two open Codex regressions, repeat the isolation checks in disposable environments, then qualify an identifiable package through installation, upgrade and removal. The owner reviews the remaining evidence and limitations before publication.

## How the existing system works, per this document

Rex discovers agent panes and reports physical focus. The top row gives agents stable slots, the middle row navigates those slots, and the bottom row changes with the selected agent’s state. Some bottom-row actions need verified session or request identity, with different prerequisites for Codex and Claude. The release package contains Rex, while the two Herdr backends remain experimental. Several builds can share version 1.4.0 because the installed candidate includes working-tree changes.

- **Major — lines 3, 45–48, 58.** The plan calls for carrying forward physical passes and later identifying the candidate by commit and checksum. It gives no rule for crediting a pass when the historical build cannot be matched to the packaged candidate. A tester could reasonably either accept all four passes or rerun all four.
- **Major — lines 7, 35–39, 60–62.** The plan explains how to record a parity gap, including Claude’s missing background Stop, but leaves the release consequence unclear. Specify who decides which gaps block the beta and where an accepted limitation is recorded.
- **Nit — lines 13, 23.** Row 1 names Asking and Approval as distinct states. Attention calls its highest-priority group “Waiting” without explicitly saying whether both states belong to it. That affects the expected count when a question and an approval are pending together.
