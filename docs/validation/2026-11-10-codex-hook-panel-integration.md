# Codex hook panel/PID observations

The owner requested integrating the hook-to-Rex registration POC into the
existing optional Codex hooks. The integration adds observation collection;
it does not treat fixture success as native client-origin proof or remove the
existing singleton-client/thread restrictions.

The installed hook entry composes the provider with a process-only Rex reader
through domain types. It honors the configured Rex binary and requires explicit
local server/session/block routing. The terminal adapter validates inputs and
replies, caps each process read at 1.2 seconds/32 KiB, disables autostart and
clears inherited server routing. There are no screen, focus or input methods.
The provider brackets the reported PID using the fixed native process helper and
compares owned process start/image and available Rex generation facts.

Lifecycle publication retains the previous report schema and ordering. It commits
before optional metadata I/O; query failure, timeout or partial observation cannot
erase the report. SessionEnd never queries a replacement foreground process.
Metadata is written separately to `<reporter-pid>-<thread-id>.panel.json`, with
setup/hook epochs, reported panel IDs, reporter/foreground facts and
`controlAuthority: false`. Server and directory values are hashes. A late
SessionEnd cannot be overwritten by this sidecar writer, and its epoch makes an
older sidecar obsolete. Production identity discovery ignores sidecar filenames.

Tests initially failed because the installed hook pipeline did not collect panel
data. The integrated fixture cases now exercise explicit routing, separate
sidecar publication, failure preserving the committed lifecycle state, later
SessionEnd, foreign owner, shell/folder mismatch, process/generation changes,
PID reuse, reporter replacement and revocation. An orphan sidecar cannot initiate
production identity reads. The terminal adapter cases check local URI validation,
bounded process-only execution, stripped reply fields and sanitized failures.
The temporary-HOME migration test first refused a newer sidecar; lifecycle-file
classification was extended so restore retains it rather than replacing it with
the backup. No production control guard was relaxed.

Validation passed: 435 isolated tests with four live suites skipped; 30 browser
checks against unchanged images; four bundled golden groups. Coverage gates
passed at 95.11% lines/statements, 87.02% branches and 90.01% functions, with
unchanged thresholds. Typecheck, lint, dependency boundaries, Knip, formatting,
version/compatibility, universal build and private package audits passed.
The build contains no POC/test fixture code. No golden or image changed for this
integration, and no native agent calibration was run.

The already approved stopped-Stream-Deck backup/installer deployed the tested
build. Private backups were retained. Installed runtime/hook/helper bytes matched
the build. Profiles, plugin configuration, Codex hooks.json/config.toml and the
active hook setup epoch matched the private pre-deployment baseline. Stream Deck
reopened on the Rex profile. Neither Codex status-line nor terminal-title
configuration was changed, and the hook commands/paths stayed the same.

After deployment, ordinary requests sent by the owner produced fresh lifecycle
reports but no panel observations. A tested diagnostic update, installed through
the same approved backup path, checkpoints fixed phase/outcome codes in separate
private `.panel-status.json` files. The next owner-generated event reached
`rex-query` with explicit valid local context, then reported `unavailable`.
No hook or input was sent to an existing agent as a verification shortcut.

The owner separately authorized one read-only process query outside Codex and
one panel-list comparison. Both targeted the saved hook IDs on the owned local
default socket; the raw inherited hook endpoint is not stored, so equality with
that endpoint has not been established. The process query failed with sanitized
`not-found` / exit 3. An initial panel-list command was rejected before connection:
the installed CLI requires one session for JSON output and refuses `--all`
with `--json`. The corrected session-scoped list also failed with `not-found` /
exit 3. These failures do not establish that the hook IDs are stale or prove
which resource could not be resolved.

The owner then authorized one session-list comparison. `session ls --json`
succeeded on that same local socket, and the saved hook session ID was absent
from its session records. This establishes that the saved session cannot be
resolved on that server. It is consistent with an inherited daemon environment
from an earlier Rex session; it does not establish equality with the hook's raw
endpoint or prove an alternative client/thread association. No active GUI pane
or matching directory was substituted. These narrow read exceptions authorize no
future live tests, focus/input or agent/daemon restart.

A separate fake-socket diagnostic verified that the installed CLI connects to
an owned temporary socket with either literal or percent-escaped spaces in its
Unix endpoint. It never contacted Rex. The configured/discovered executable
matches the executable whose static help was inspected. The owner reports
preview.14 / API revision 12 as the running server; that report introduces no
version pin or capability. No restart was requested or performed.

The next source diagnostic adds optional fixed execution-failure categories,
without changing the existing generic errors or exposing arguments/stderr.
Fixtures cover permission, missing executable, connection refusal, invalid
option, timeout, output limit, missing target and other exits. This diagnostic
revision passes 439 isolated tests with four live suites skipped; coverage gates
pass at 95.02% lines/statements, 87.05% branches and 90.12% functions. It has not
yet been installed. Typecheck, lint, dependency boundaries, Knip, formatting,
universal build, private package audits and all four bundled golden groups also
pass. No golden or browser baseline changed. Successful shared-daemon controls
remain unverified; this deployment does not solve the missing live client/thread
association.

The fixed execution-failure diagnostic revision was subsequently included in
the tested Rex-navigation deployment. Hook configuration/setup remained intact;
see [that validation record](2026-11-10-rex-navigation-independence.md). This does
not change the shared-daemon identity limitation or establish working controls.
