# Optional Codex hook identity in Rex

Codex's root lifecycle hooks supply a session ID directly. DeckShep can use it
without displaying the ID in the status line, provided it can independently
verify ownership. This integration is optional and off until explicitly applied.
It does not edit Codex's status line or config.toml, start a Codex session or
restart an agent/daemon. Native calibration of this new hook route is pending;
the tests use synthetic process, Rex and daemon facts.

## Setup and removal

With the tested build installed, preview and apply the three hook entries:

```sh
node <installed-plugin>/configure-codex.js
node <installed-plugin>/configure-codex.js --apply
```

The helper honors CODEX_HOME, otherwise using the usual Codex home. It adds
SessionStart, UserPromptSubmit and SessionEnd commands to hooks.json, preserves
other hooks, and keeps an exact private backup before applying. The standalone
Node helper's absolute executable/script paths remain in the installed command.
Do not move them while the integration is installed. Reapplying the same setup
is idempotent.

Review and trust DeckShep's entries using `/hooks` in Codex. Installing the files
does not grant Codex's hook trust. A fresh root event must arrive before the
integration can identify an agent. The plugin never types a command or prompt to
produce that event. Select the agent on the deck; its setup status shows
`hook identity` when the verified metadata uses this route. The existing
**Check selected Codex agent** button remains a read-only identity check.

### Panel/PID observations

An active SessionStart or UserPromptSubmit hook also attempts two explicitly
targeted Rex `process` reads using its inherited REX_SESSION, REX_BLOCK and
REX_SERVER. Missing context, remote endpoints, malformed replies, another owner
or folder, and changed process generations discard the observation. The fixed
native helper brackets the reported foreground PID/start/image. The CLI uses
autostart=false, a bounded timeout/output limit, and only the `process` method;
it never reads a screen, changes focus or sends input. The installed helper uses
the configured Rex binary path when present.

The ordinary lifecycle report is committed before optional Rex I/O, so query
failure or timeout does not erase it. A successful observation is stored in a
separate private `<reporter-pid>-<thread-id>.panel.json` file, tied to the exact
setup and hook epochs. Server/project paths are hashed and prompt/transcript
data is absent. SessionEnd performs no Rex query and advances the lifecycle
epoch, making an older observation stale. Same-identity restore preserves newer
sidecars from running hooks.

A companion `.panel-status.json` checkpoints fixed phase/outcome codes and
whether explicit local server context was present. It includes no exception,
CLI output, prompt or path. A pending checkpoint can locate a hook that was
cancelled before completing its optional read. Status records also carry the
setup/hook epochs and `controlAuthority: false`; stale status cannot grant a
binding or override lifecycle state.
Execution failures use fixed categories such as `rex-permission`, `rex-timeout`
and `rex-target`; these are diagnostic hints and never prove a binding.

**These are observations, not control permits.** Every sidecar has
`controlAuthority: false`; production identity resolution ignores sidecar files.
`reporter-is-foreground` means the observed process generation matched the hook
reporter; otherwise `originEvidence` is `unverified`. Neither label removes the
single-client/thread checks below or proves which thread is selected in a CLI.
The native shared-daemon context still needs validation. This integration does
not change Codex, its terminal title, its status line, or their configuration.

To remove:

```sh
node <installed-plugin>/configure-codex.js --remove
node <installed-plugin>/configure-codex.js --remove --apply
```

Removal revokes the private setup epoch before removing exact owned commands.
Other hooks and config.toml are preserved. Codex may ask to review other hooks
again if their file positions change. Keep the backups. Remove hooks before
uninstalling DeckShep; the Claude inspector removal flow is separate.

## Ownership checks and limitations

The publisher discards prompt, transcript, tool and response fields. It writes
only a bounded root-session record, the reporter's native process identity,
Rex session/block IDs, a directory hash, time and random setup/report epochs.
Subagent reports cannot create a root binding. Records and backups stay in the
private plugin state directory and are excluded from distributed artifacts.

On every identity read, DeckShep requires:

1. An active setup epoch and a private, current, non-ended report.
2. Exact Rex session/block IDs and a directory hash matching the discovered agent.
3. Fresh owned CLI and daemon PID/start/image facts from a fixed native helper
   that brackets kernel reads and includes microsecond start times. It launches
   no agent, opens no socket and returns no executable path. The hook reporter must match
   the CLI itself or the daemon to which that exact CLI is connected.
4. Exactly one external Unix client of that daemon: the captured CLI. The plugin's
   own read connections are excluded; another CLI, Desktop or unrelated client
   makes the hook route ambiguous.
5. Exactly one loaded thread, matching the hook's session ID and the daemon's
   metadata-only thread read. The complete loaded set must remain unchanged.
6. Unchanged setup/report bytes, socket peer facts and native process identities
   after the read.

Two Codex agents sharing a daemon, additional loaded threads or background
subagents can therefore make this initial hook route unavailable. It does not
choose the newest thread or infer ownership from a matching project directory.
Before a press is captured, the plugin can still use the independent existing
footer verification. An action captured from a hook cannot fall back to the
footer or another hook/process generation; it refuses and needs fresh selection.

The hook route covers identity for metadata, settings, Mode and Interrupt.
All existing provider-state, visible-pane consent, native focus, stale-press,
generation/visibility and one-delivery checks remain. Message composition still
requires the existing footer placement, cursor and digest evidence; this change
does not grant a new composer capability. It applies to Rex, not Herdr backends.

## Evidence

Official hook inputs and explicit trust are documented in
[OpenAI Docs](https://learn.chatgpt.com/docs/hooks). Rex documents its
[session/block environment](https://www.superlogical.com/rex/docs/automate/cli#command-targets).
The Codex 0.167.1 source audit found that user command hooks run with a session
environment snapshot and can be spawned by the daemon, so parentage alone is
insufficient. The singleton client/thread checks deliberately address that gap.

Isolated tests exercise publication/privacy, process and socket ambiguity,
revocation and report changes, stale-epoch input refusal, settings/Mode/Interrupt
without footer reads, standalone setup/removal and upgrade preservation.
Browser fixtures cover hook-bound Interrupt and a changed epoch during a pending
press. They do not prove a particular native Rex/Codex build's hook environment
or Unix listing format, and no existing agent is used for calibration.
