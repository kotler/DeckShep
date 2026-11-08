# Refactor native calibration — November 7, 2026

The owner explicitly authorized new disposable Herdr/provider processes and model
usage, then selected existing signed-in CLI accounts with isolated test state.
This permission did not include existing sessions, a normal Rex GUI launch,
installation, restart or remote publication.

The successful expanded run passed both the main Herdr test and its Claude
subtest with no skips or failures. Native versions: Herdr TUI 0.9.5 / protocol 22,
Codex CLI 0.167.0 and Claude Code 2.1.319. Models: `gpt-6-luna` and Haiku 5.5,
with low effort. The run took about 139 seconds.

Verified through the production controller, native transports and guards:

- Selection, Next/wrap, explicit native focus, Zoom and stale-focus refusal.
- Codex Effort changes and restoration of the complete settings snapshot.
- Interrupt of the exact active disposable turn. Any remaining scoped background
  terminals are stopped before the next scenario.
- Codex Plan question navigation/confirmation and full Plan/settings restoration.
- One-time print-only Codex approval, unchanged settings and no saved rule.
- Claude single-choice navigation/confirmation through native hook state.
- One-time print-only Claude approval with unchanged private settings.
- Native pane closure leaves a stable slot; explicit Collapse removes the gap
  and preserves the surviving agent's order.

The harness creates a private temporary home/repo/socket and a private copy of the
bundled plugin for Claude hooks. Herdr's lifecycle integration is installed only
in that temporary Claude directory. It starts the Codex server in the foreground
and connects only the test TUI to that private endpoint. Every agent must descend
from a process spawned by this run. Socket identity is rechecked before writes;
version, identity, focus, visibility and stale-input checks remain enabled.

Codex's copied access cache has no shared refresh token. Claude's access token is
read into memory from the default Keychain entry. Real Codex/Claude settings and
auth files, plus the Keychain credential fingerprint, matched before/after.
Cleanup verified agent/server exit and removed the private test root. No prompt,
transcript, credential, home path or PID inventory is retained in this report.

Calibration exposed driver mistakes, which were corrected without weakening
production guards: missing private Claude onboarding/lifecycle integration,
controls attempted before a completed initial chat, stale selection after native
identity transitions, and inspecting a pending command before it became a
completed command item. The final driver verifies the native approval viewport
and the private Claude tool-input digest before confirming a print command.
A server waiting on approval also required bounded graceful shutdown followed by
termination of only previously proven test-owned descendants.

An initial Claude model selection was misdiagnosed as a quota issue: Fable 5.1
required separate usage credits. The owner's included allowance was available.
A private Haiku probe succeeded; subsequent native calibration used Haiku. No
Mythos or Fable model request was made after the owner clarified eligibility.

These results do not establish physical LCD/USB rendering, a fresh-account
installer walkthrough, Intel execution, multiple attached Herdr clients, Rex GUI
controls, or remote CI/release behavior. Use the separate
[manual smoke checklist](MANUAL-SMOKE.md) for hardware checks. Commands and
isolation requirements are in [the live harness guide](../../tests/live/README.md).
