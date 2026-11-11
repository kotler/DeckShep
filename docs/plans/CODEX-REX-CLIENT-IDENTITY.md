# Rex panel identity with multiple Codex clients

## Scope and evidence

The owner requests current-panel hook registration with multiple unmodified
Codex clients, leaving the status line and terminal title unchanged. Existing
agents and the shared daemon must remain untouched during development. The
earlier narrow read-only diagnostic exceptions do not authorize new live reads
or launches.

The Codex `rust-v0.167.1` source audit establishes:

- `hooks/src/registry.rs`, `Hooks::new`, snapshots the executing process's
  environment with `std::env::vars_os()`. Reconfiguration retains that snapshot.
- `hooks/src/engine/command_runner.rs`, `build_command`, replays the snapshot into
  a detached hook process. A hook has no originating terminal's controlling TTY.
- The documented root hook input supplies a session ID but no requesting client
  PID or Rex panel address. Thread originator metadata records creation origin,
  independently of the current client; it is not a selected-thread mapping.
- `tui/src/app_server_session.rs`, `config_request_overrides_from_config`, forwards
  selected configuration keys to the daemon. Its allowlist excludes `hooks`.
  Merely inserting literal panel arguments into CLI `-c hooks...` overrides is
  therefore not an established shared-daemon solution for this source version.
  `shell_environment_policy` applies to tool execution; the audited hook runtime
  still uses its own environment snapshot.

The owner-authorized session-list comparison also found that the saved hook's
Rex session was absent from the queried local default server. The hook's raw
endpoint was not saved, so that read does not prove equality with its endpoint.
See the [integration record](../validation/2026-11-10-codex-hook-panel-integration.md).

Rex `process` verifies the PID in an explicitly addressed panel. It cannot add
missing causality to a daemon event. GUI focus, matching directories, the latest
event, or an otherwise valid inherited panel are not client-origin proof. Keep
the existing shared-client/thread refusals and observation-only sidecars.

## Candidate: an optional per-panel launcher

The official [CLI reference](https://learn.chatgpt.com/docs/cli/reference) and
[app-server reference](https://learn.chatgpt.com/docs/app-server) document native
app-server Unix listeners and native CLI `--remote unix://PATH` connections.
An opt-in launcher could use those interfaces without modifying Codex:

1. Capture the new launch's explicit local Rex server/session/block context.
2. Create a private unique Unix endpoint and start one owned native app-server
   with that context. Never reuse, update or stop the existing shared daemon.
3. Replace the launcher's foreground process with the unmodified native Codex
   CLI connected to that explicit endpoint. Preserve a native foreground Codex
   PID; a wrapper PID must not be mistaken for a Codex process.
4. Let the existing approved hooks publish lifecycle records. Query only their
   explicit Rex address; bracket the actual CLI and daemon generations, socket
   peers, setup/report epochs and thread metadata with existing guards.
5. Retain singleton checks per daemon. Two panels can have different daemons;
   a second external client or additional loaded thread on either daemon still
   refuses. This does not add support for multiple clients sharing one daemon.
6. Supervise and clean up only the new launch's owned child process and private
   files. Handle failed startup, shell-to-CLI exec, PID reuse, cancellation and
   uncertain shutdown without signalling another process or falling back to the
   shared daemon. Do not retain native output, prompts or transcripts in logs.

This changes how new panels start. It must remain a separate named opt-in
launcher; do not silently replace `codex`, edit shell startup files, install
hooks, alter hook trust or enable consent. Status-line, terminal-title and global
Codex configuration must stay unchanged. Public API support is not native proof
that this arrangement satisfies DeckShep's process and thread checks.

## Validation gates

- Fixture subprocesses and private fake sockets first: concurrent panels with
  the same directory, explicit endpoint separation, stale/wrong panel context,
  startup failure, parent/child replacement, signal/shutdown handling and no
  shared-daemon fallback. Never launch a real Codex/Rex agent in ordinary tests.
- Preserve production refusal and golden coverage. Packaging must include only
  reviewed runtime files and stable removable integration paths.
- Any native calibration needs separately authorized exact artifacts, owned
  processes, temporary repositories/sockets, live flags and before/after
  settings hashes. Existing agents are excluded. Until that evidence passes,
  do not describe the candidate as working controls or deploy it as a fix.

The startup preference is pending owner selection. If clients must keep sharing
one daemon, the audited hook/API surface lacks the client-to-selected-thread
signal needed for this request. No safe hook-only patch is established.
