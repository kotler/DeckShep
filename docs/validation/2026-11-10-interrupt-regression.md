# Interrupt failure and virtual-deck coverage

The owner reported Interrupt and other previously working controls failing after
the layout/API work. The installed inspector reported zero identified Codex chats
and `Chat metadata loading; try again`. After the owner's read-only footer check,
its result was `This Codex footer shows no session ID`. Reading the already-open
Rex window confirmed a model/folder/title footer without a session ID. The
selected Codex state was done. Claude native controls were disabled. These are
current observations, not a conclusion about why the prior binding disappeared.
No agent input, daemon attachment, configuration write or native control test was
performed by the assistant. The owner must enable the required session-ID footer;
the standing prohibition on changing provider status lines remains in force.

Three test/reporting gaps were reproduced before changing the relevant code:

- Fresh discovery snapshots lost a previously established missing-footer hint.
  `AgentMetadata.hydrate` now reapplies that hint under its existing process/folder
  cache key. A different PID cannot inherit it, and a successful read clears it.
  This changes reporting only; it does not create a chat binding or permit input.
- The virtual Bridge accepted two absent chat IDs as equal, whereas production
  refuses a missing captured ID before provider dispatch. Its fixture now makes
  the same refusal. The new missing-binding Interrupt test delivered a synthetic
  Escape before this fixture correction and refuses without input afterward.
- In the short inspector, the footer-check result was above the visible setup
  button. A browser test reproduced a correct result with zero viewport overlap.
  The button now shows progress immediately and scrolls the status message into
  view. This performs the same read-only request and changes no configuration.

New browser tests cover a successful pointer press with exactly one synthetic
Escape, idle refusal and missing-binding refusal. The pointer assertion awaits
the asynchronous trace rather than treating pointer-event completion as plugin
completion. Existing state/profile/consent/visibility refusal cases remain.
Additional integration tests retain real Rex discovery, context, footer and
active-turn verification, injecting only synthetic CLI/visible-pane/daemon
transport replies. They verify all Codex controls stop before dispatch without
a binding, and Interrupt delivers exactly one Escape after a verified active
turn. Browser and provider-transport fixtures do not establish native readiness.

No golden snapshots or screenshots are changed by this follow-up. Native
Interrupt success is still unverified pending restored session identity and an
owner-performed press while the selected agent is working.

Validation: 344 isolated tests passed, four live suites skipped; all 28 browser
tests passed against unchanged screenshots; four bundled golden groups passed.
Coverage gates passed at 95.23% lines/statements, 87.13% branches and 90.38%
functions. Typecheck, lint, formatting, dependency rules, version/compatibility
checks, universal build and private package audits passed.

Before deployment, the normal installed status changed to 1/1 identified Codex
chats, selected idle, with the owner's latest press reporting `Interrupt only
while working`. The assistant made no status-line or provider-setting changes.
The reason the earlier footer binding disappeared has not been established.
The tested reporting fixes were deployed through the already approved stopped-
Stream-Deck backup/installer path. All 73 profile files were byte-identical to
the fresh backup, the seven checked runtime/inspector/helper entry files matched
the build, and control consents matched their pre-install values. After reopening,
Stream Deck displayed the selected Codex chat's known model, effort, permissions
and mode; Interrupt displayed `not running`. This verifies installed labels and
preservation, not successful provider input. Native Interrupt during a working
turn remains unverified. A separate loopback virtual-deck preview is available
with synthetic agents only.
