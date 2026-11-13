# Rex beta candidate qualification — November 12, 2026

DeckShep 1.4.0, working tree based on `8ad95040175c0ba3908348c1d4e3685a31355f8b`. Local checks used Node 26.13.0; the CI workflow specifies Node 22. This is a local private-review build.

| Item | SHA-256 |
| --- | --- |
| Installed MK.2 plugin runtime | `9e432c799aa00c2169248cc2571a1ab7f6248145b35157c15aa1296be473b85c` |
| Universal packaged plugin runtime | `a7b9c2a70068f7b0042aa9100572a52d07043650e85063a9a3c90cb28f6c7f4e` |
| Private-review beta ZIP | `e22d6dd0753171d6c57fd27df0cc815b0ce3ba6b0ed545c16fdabdd37f74a71a` |

The runtime diff contains one changed line, the embedded peer-helper digest. Physical observations below refer to the installed runtime. Packaged-artifact installation and physical smoke remain separate checks.

## Physical MK.2

| Case | Provider and setup | Owner observation | Result |
| --- | --- | --- | --- |
| C1 / Model and Effort captions | Idle Codex in Rex, session ID first in footer | Before either press, the keys matched Rex: GPT-6-Luna and medium. | Display regression passed on installed runtime. |
| C10 / Model | Same setup | First press showed GPT-6-Sol. | First change and restoration confirmed. |
| C11 / Effort | Same setup | First press showed high. | First change and restoration confirmed. |
| C18 / Interrupt while printing | Disposable Codex Luna | Owner answered yes to the first-press stop check. Exact early-press caption was not supplied. | Stop reported. |
| C18 / Interrupt after scrolling | Separate disposable Codex Luna reply | One physical press interrupted output; key showed “not running.” | Scrolled-output retest passed. |
| A2, B1 / Mixed-provider focus | Idle disposable Codex and Claude on Rex | Agent taps, Next tap and Next hold moved native focus, the sole dot and bottom row together. K14 showed Codex Mode and was blank on Claude. | Physical selection and mixed Next/previous passed. |
| D12 / fresh-launch Model | Hook-free Claude, Fable 5.2 selected | Pressing Model showed the warning icon. | Failed physical check; cause pending. |

## Automated evidence

Lint, formatting, typecheck, dependency layering, version and compatibility checks passed. Marketplace media generation and verification passed. The universal build, Elgato validation, packaging and archive audit passed. The release readiness check still reports pending version-specific launch validation, public Issues verification and support-email verification.

The coverage run passed 655 tests and skipped four gated tests (zero failures). Coverage was 95.44% lines, 87.94% branches and 91.96% functions. Synthetic hooks passed 61/61 and no-hooks passed 35/35. Bundled golden tests passed 4/4, and all 50 virtual-deck browser tests passed. The standalone archive verifier accepted the ZIP. The installed Codex 0.167.1 schema exposed all ten required methods and parameters. The production dependency audit reported zero vulnerabilities; the full audit reported two low and thirteen moderate findings.

## Disposable Rex evidence

Each matrix used a separate owned server, Luna and Haiku, with signed-in access isolated by the harness. The hook variant installs Claude hooks in its temporary home. Each matrix selected the five core cases per provider plus early and scrolled Codex streaming Interrupt. The Claude effort variants that launch a default model or Sonnet were omitted to honor the requested model constraint.

| Route | Native outcome | Isolation outcome |
| --- | --- | --- |
| Claude hooks off | Codex Permissions and both streaming Interrupt cases passed. Mode, ordinary Interrupt, Queue and Choice stopped at the idle prompt preflight. All five Haiku cases passed. | No teardown failure reported. |
| Claude hooks on | Same control results. | Regular Claude state-file fingerprint changed. Writer unknown. |
| Separate hooks-enabled picker run | Luna picker and both Haiku picker open/cancel cases passed. Model application was outside these assertions. | Regular Claude state-file fingerprint changed. Writer unknown. |
| Codex Mode, ordinary Interrupt and Queue, one fresh private server per case | All three passed their native assertions. | All three passed teardown. |
| Codex Choice, fresh private server | Native choice and acknowledgment passed. | Regular Claude state-file fingerprint changed during this Codex-only run. Writer unknown. |

The two full matrices reproducibly refused four Codex cases after the first case; the fresh-server reruns reached all four actions. This localizes the refusal to the combined setup without identifying its cause. Native Queue and Choice exercise CLI shortcuts. Neither proves the corresponding MK.2 key was available. The physical walkthrough was active during part of the native qualification.

## Open evidence

Use the [beta plan](../plans/REX-BETA-PLAN.md) for the case matrix and the [previous walkthrough](2026-11-11-rex-beta-walkthrough.md) for earlier build observations. Independent clean-account install, customized same-identity upgrade and removal, Intel execution and owner release decisions remain outstanding.

## Replacement candidate — Claude Model and Effort

The owner reported that changing Model lost the selected Effort and that switching between those controls could show “Unavailable / Agent view changed.” A controller fixture reproduced the missing effort caption after a successful Fable 5.2 → Opus 5.5 switch. The regression also delays a background read across the switch and checks that the old pane digest cannot replace the new one. The fix retains the effort observed for the applied model, marks it with “?” when the badge is hidden, and refreshes the verified view before completing the action.

Installed runtime matches the newly audited universal build byte-for-byte: `bceaa84b156c51d9032d6cdf9d905e5f1e9bdacc02c2bdf5fdb2f384ccb10ade`. The private-review ZIP SHA-256 is `7c9a63f3d53cffd00427c357146aa5f94a03e584e93f06260cbb4cbc6709f6d8`. Installation used the checkout installer with its profile backup on this development Mac. The regression, no-hooks suite (36 tests), bundled golden suite (4 tests), lint, format, typecheck, dependency rules and package verification passed.

The replacement candidate passed 656 tests in the coverage run (four gated skips, zero failures) and 50/50 virtual-deck tests. Coverage reached 95.51% lines, 88.10% branches and 91.96% functions. The physical Effort → Model → Effort retest failed. The owner observed Claude’s effort slider stay open and the Effort key later change to Apply effort. The automatic cycle did not complete.

A new fixture reproduced an opening race: after Enter, a stable repaint of the command can precede the slider. The previous action returned that frame and stopped. The new action polls for the recognized slider and sends Enter only once. The 20 focused picker and controller tests, lint, typecheck, formatting, universal build and package verification passed. The newly installed runtime matches SHA-256 `069b665da67a3a266436814f857d333bb308d308389253ab9fd65d77467298bb`. Physical attribution and retest remain open.

Physical MK.2 retest on runtime `069b665d…`: from the idle hook-free Claude prompt, one Effort press wrapped max to low and closed the slider automatically. The owner read the resulting key caption as `low?`. This passes the one-press wrap and close check. The suffix identifies the last observed level when Claude’s idle view supplies no current level. The subsequent Model → Effort handoff remains open on this runtime.

Physical Model → Effort handoff passed on the same runtime. After Model switched from Fable 5.2 to Haiku 5.5, the Effort key still showed `low?`. One Effort press advanced it to `medium?` and the slider closed automatically. Together with the preceding max → low wrap, this completes the reported Effort → Model → Effort regression case.

Claude Permissions (D14), Haiku 5.5: after one physical press the owner reported `manual mode`. The owner confirmed that Rex and the Permissions key both showed `manual mode`. Physical check passed.

Claude idle Interrupt, same Haiku pane and runtime: the owner confirmed that tapping Interrupt once left the empty prompt untouched. Physical check passed.

Claude working row and Interrupt (D5/D19), hook-free Haiku 5.5, installed runtime `069b665d…`: while the reply was printing, K11–K14 were blank. One physical press of K15 stopped the reply and the Interrupt key showed `not running`. Both the layout and first-press stop passed for this streaming turn.

Codex Permissions (C12): the owner saw a blank value, then “Ask for approval” on press, then a blank value again. The idle footer supplies no permission profile. A controller regression reproduced the value disappearing after the success feedback expired. The fix keeps the last selected or observed profile for the same focused chat and process, marks it with “?” when the idle footer cannot confirm it, and displays “Press to cycle” before an observation. The regression also covers updating from a reopened picker and clearing the caption on chat replacement. The focused and golden suites, typecheck, lint, formatting and package verification passed. The installed runtime matches `38066974975ee701c05122c9601a9d1c1984a7afa9b3a66927fa3fc8e6e6ed3a`. MK.2 retest pending.

The MK.2 showed “Press to cycle” flickering on the prior candidate. A controller fixture reproduced an intermediate blank frame when Rex rediscovered the pane before its cached Codex chat identity was restored. The replacement restores that identity before comparing observations and preserves the idle caption through a transient failed read without preserving a press-authorizing digest. The targeted controller, navigation and keyboard suites, lint, format, typecheck and package verification passed. Installed runtime SHA-256: `1c4ef1474d391d6674b29493ca94e0b395a596f39757bc97276f9506732f874c`. Physical MK.2 flicker retest passed on this runtime. With Codex Luna idle, “Press to cycle” stayed steady during the five-second observation before the press. After one press, the selected profile remained visible through the second five-second observation.

## Owner review for the 1.4.0 Rex beta

On November 12, 2026, the owner approved the existing validation for DeckShep 1.4.0 with Rex on the 15-key MK.2. The evidence includes the physical checks above and browser-driven checks with disposable Codex CLI and Claude Code sessions. Independent clean-Mac installation and Intel execution remain unverified. Herdr TUI and Herdr App remain outside this beta.

The owner selected kotler/DeckShep Issues as the sole channel for ordinary beta support. GitHub reported Issues enabled on the private repository. A signed-out request to the Issues URL returned HTTP 404. On November 12, 2026, after the owner authorized making the repository public, GitHub reported public visibility with Issues enabled. A signed-out GET returned HTTP 200 at https://github.com/kotler/DeckShep/issues with the page title “Issues · kotler/DeckShep · GitHub”.
