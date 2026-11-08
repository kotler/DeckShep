# 0007 — Herdr App 0.1.14 source review and isolation boundary

Status: Phase 0 source review complete, 2026-11-08; owner review pending.
Native validation has not run. This ADR grants no production capability and
creates no verified-version/control record. It supplements [ADR 0004](0004-herdr-app-backend.md).

## Scope and source provenance

Only upstream source and installed App bundle metadata were read. No Herdr,
core, Codex or Claude executable was run, no session was inspected, and no
socket was opened. Fixtures, runtime code, defaults and identities are unchanged.

| Evidence               | Exact pin                                                     | What it establishes                                                     |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| App `v0.1.14`          | [`2405bf388c568c3ed479f05b8e405ccfa44b3f2c`][app-release]     | Published source tag; Cargo version 0.1.14                              |
| Earlier App review     | [`7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8`][app-prior]       | Direct parent of that release; Cargo still said 0.1.13                  |
| Core `v0.1.18`         | [`3965a46caae095a3ead01de237fa13955e52b8c6`][core-release]    | Published source tag; primary core reference for this ADR               |
| Earlier core review    | [`cd12ddd88bc11490228343291dc1096c9ed3bf77`][core-prior]      | Later development snapshot also reporting 0.1.18; not the release tag   |
| Installed App metadata | Bundle ID `dev.herdr.app`; short/build versions both `0.1.14` | Static plist only; no proof of which executable a running socket serves |

The App release changes only Cargo.toml, Cargo.lock and CHANGELOG.md relative
to the earlier reviewed commit. The `src` tree is identical:
`7e6f37a9d24911c36c9c42094655784179ab5306`. This does **not** mean that the
official 0.1.13 release had identical code: ADR 0004 reviewed a development
snapshot whose Cargo version had not yet been bumped. [Release diff][app-release]

The two core pins have identical `schema/hc.openrpc.json`, schema README,
API types, input implementation, paths and foreground inspection, but differ
in API handlers, server/client, terminal and platform code. Version 0.1.18
alone therefore cannot identify that core build. The installed/running core's
exact source correspondence remains **unestablished**; no production allowlist
may be populated from this source review. [Release][core-release], [earlier snapshot][core-prior]

The App ships no core binary. `distribution/core-version` is **0.1.11**, a
minimum, not an exact dependency pin. The App finds a separately installed
core and runs its `connect` subcommand. An App release cannot determine the
installed core's commit. [Core selection][app-core-bin], [handshake][app-hc]

## App control socket: requests, replies and authority

`mods::app_dir()` resolves nonempty `HERDR_APP_HOME`, then
`XDG_CONFIG_HOME/herdr-app`, then the home config directory. The socket is
`herdr-app.sock` beneath it. Each connection reads one JSON line, dispatches
it to the UI thread and writes one JSON-line reply. These are **not** JSON-RPC
envelopes; there is no request ID, hello, feature list, connection epoch or
build identifier. `commands` as a CLI subcommand prints the static command
listing without connecting. [Home][app-mods], [transport][app-control]

| Request                                | Relevant response shape                                                                                                                          | Side effects / limits                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `{ls:true}`                            | `{spaces:[{id,name,folder,machine,active,tabs:[{id,name,active,settled,terminals:[{terminal,pane,status,app,name,sub_agents}]}]}],recent:[...]}` | App model topology; no process identity or full split tree                                                   |
| `{status:true}`                        | `{zoom,font_size,ui_font_size,space,tab,focused_pane,layout,agent,floats,overlays,errors}`                                                       | `zoom` is UI scale, **not pane zoom**; `layout` is a name, not a split tree; errors can contain private text |
| `{commands:true}`                      | Array of `{name,args:[{name,required}],about}`                                                                                                   | Command vocabulary, not a verified capability list                                                           |
| `{do:"agent.focus",args:{terminal}}`   | Usually `{ok:true}`, or `{error:...}`                                                                                                            | Changes shown agent and, when a model pane exists, its focus                                                 |
| `{do:"pane.focus",args:{pane}}`        | Usually `{ok:true}`, or `{error:...}`                                                                                                            | Explicit pane; terminal argument is an alternative, with special layout-block handling                       |
| `{do:"pane.zoom",args:{pane}}`         | Usually `{ok:true}`, or `{error:...}`                                                                                                            | Toggles that pane's tab zoom; single-pane/unknown targets may be a no-op                                     |
| `{do:"terminal.peek",args:{terminal}}` | Usually `{ok:true}`, or `{error:...}`                                                                                                            | Opens a modal terminal overlay; **not a text read**                                                          |
| `{raise:true}`                         | `{ok:true}`                                                                                                                                      | Activates the App/window; mutation, not a probe                                                              |

Shapes above summarize [command definitions][app-commands] and the
[control handler, world listing and action dispatch][app-window]. Upstream
`{ok:true}` is not evidence of focus, Zoom or input completion. Never reflect
its errors or data in DeckShep logs or inspector messages.

### Missing read-back for Milestone 1

`publish()` exposes richer **in-process mod** snapshots: `focused` includes
space/tab/pane, terminal, temporarily shown terminal and shown agent; `panes`
includes per-pane `zoomed`; `window` can describe App activation. Those values
are not the control socket's `status` or `ls` response. They are separate
authorities from the OS foreground window and core terminal facts.
[Snapshot fields][app-mods], [snapshot publication][app-window]

Core `doc.get {name:"herdr-app"}` contains shared machine layout structure.
Focus and zoom are deliberately excluded from that document and retained in
each screen's private `View`; a shared layout read cannot prove either.
The saved `view.json` is persistence, not a fresh, atomic focus receipt.
[Shared/private split][app-mirror], [document reads][app-mirror-sync]

Consequently the unmodified socket alone does not provide the plan's full
window/screen/pane read-back, pane zoom state or proof that other screens were
unchanged. The original Milestone 1's verified-focus/Zoom gate remains closed. A separately reviewed
read-back bridge/mod or an upstream surface must resolve this; do not silently
substitute core state, a success reply, UI-scale `zoom` or persisted files.
This is an owner-review question, not permission to contact maintainers.

### Read-back design review, 2026-11-08

The full window/Zoom contract above must not obscure a cheaper selection-only
surface: socket `status.focused_pane`, `space` and `tab` can be joined to `ls`
pane/terminal records and active space/tab flags. Bracketing `ls` with matching
status reads can detect some races, but cannot make the reads atomic. In
`sync()`, `self.focused_pane` follows model/layout presentation state while
modal dialogs may retain the keyboard. `focused_terminal()` separately looks
for actual terminal keyboard ownership, including peeks/floats/swaps. Therefore
socket selection feedback deserves fixture/isolated evaluation; it is not
verified OS or contextual-input focus. `status.zoom` remains UI scale.
[Control, synchronization and keyboard ownership][app-window]

The mod proposal has two unresolved gates, not an established binding recipe:

- `panes()` shares terminal address, pane/tab and mutable descriptive facts
  with App/core data. It does not expose connected core ID, terminal PID/start
  identity or native window ID. Core `address` is unique **within its core**;
  titles/cwd/program and App-written space/tab labels cannot prove core ownership.
  The App's `hc connect` hello is internal. Neither socket nor mod can currently
  bind a local address to an independently verified core by these fields alone.
  The broader `terminals()` snapshot retains `address`, `created_ms` and nullable
  `pid` from core records; those offer a stronger consistency candidate than
  address alone, but remain cached facts without process start time or the
  App's core connection epoch. They need evaluation, not an assumed binding.
- Command callbacks read the latest published host snapshot. They do not force
  a native keyboard query or publication revision barrier. A challenge proves
  a response was produced after dispatch, not that its underlying view facts
  were newly observed. [Snapshots][app-mods], [connection][app-hc],
  [core records][core-schema]

Source-only runtime checks establish that a mod can write files and receive a
nonce, with important constraints. `fs/promises.writeFile` writes directly and
exports no rename operation. `herdr.writeTextFile(path,text,expected)` uses
same-directory temporary-file replacement only for an existing file; a new
file is written directly. A future protocol therefore needs precreated private
slots and expected previous contents. `<mod>.snapshot:<nonce>` passes the
suffix string to `nextCommand()` on all shown copies; request args are not
forwarded. `focusable:false` avoids `pane.go` navigation into a chrome mod block,
but does not sandbox trusted code against requesting focus. A plain indicator
must omit focusable widgets/handlers and still needs native click calibration.
[File replacement][app-mod-files], [filesystem module][app-mod-fs],
[filesystem writer][app-mod-fs-host], [dispatch/navigation][app-window]

If no shown mod accepts a command, `run_as` logs its full name. A nonce in that
name can therefore reach Herdr's own logs. The proposed no-challenge-logging
rule is another unresolved constraint; no sender has been implemented.

The [revised proposal](../plans/HERDR-APP-READBACK-DESIGN.md) puts these checks
first, defers mod implementation and compares a focus-only scope amendment
with waiting for verified Milestone 1. The owner subsequently approved the
focus-only scope on 2026-11-08; H1/H4 now permit a separately guarded plain
request path, without granting verified focus. Zoom, contextual input and mod
installation remain outside the first release. No native test or
upstream contact was performed for this review.

## Core protocol: bounded clients and identity

The pinned [OpenRPC schema][core-schema] is authoritative for field types.
Plain mode is JSON-RPC 2.0, one message per line. `hello` with `framed:true`
switches only **after** its reply; framed headers are channel u32 LE, kind u8,
length u32 LE, then payload. The upstream frame ceiling is 16 MiB; DeckShep
must impose its own appropriate bounds before allocating or buffering data.
[Wire and event specification][core-wire]

| Method and parameters                    | Relevant result                                               | DeckShep constraint                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `hello {generation:1,framed:false}`      | `{generation,version,core:{id,name},framed,methods,features}` | Generation is protocol compatibility, not a process/reconnect epoch; omit peer-core identity parameters |
| `server.status {}`                       | `{core,version,pid,uptime_ms,holder,holders,live,...}`        | Returned PID supplements independently verified peer ownership; does not prove it                       |
| `terminal.list {all:false}`              | `{terminals,hidden_finished,machines?}`                       | Includes remote machines; filter before provider binding or PID lookup                                  |
| `terminal.get {terminal}`                | One terminal record                                           | Use a canonical local address; omit `caller` to avoid marking another terminal's news seen              |
| `terminal.read {terminal,lines:0}`       | `{text,complete,how,why?}`                                    | Passive screen branch; require `complete:true` and `how:"screen"` for native UI guards                  |
| `events.subscribe {}`                    | `{seq,terminals,channel?}`, then notifications                | Dedicated plain connection, or framed channel with credit; separate from request traffic                |
| `doc.get {name:"herdr-app"}`             | `{value,version}`                                             | Shared topology only; not focus or zoom authority                                                       |
| `terminal.keys {terminal,keys}`          | `{status?,turn}`                                              | Mutates; quiet-period queue and no expected-dialog/process token                                        |
| `terminal.interrupt {terminal,timeout?}` | `{outcome,key}`                                               | Mutates; stop key can depend on status/template; no escalation, but not provider-specific proof         |
| `terminal.send {terminal,text,...}`      | Send/turn observations                                        | Pastes and submits; unavailable for staged Send/Steer/Queue                                             |

There is no `terminal.input` method in this pin. Map the domain input action
to a specifically reviewed method; never infer a raw-input API from the term
"core terminal input". `terminal.attach` is not needed for discovery or status
and must not be introduced as a read shortcut. [Methods and types][core-schema]

Terminal records include canonical `address`, initial `argv`, `cwd`, nullable
initial `pid`, `state`, `created_ms`, dimensions, screen fidelity, labels,
root `status`/`status_ms`, status `records`, turn and optional foreground facts.
Foreground is `{pid,name,argv,cwd}` for the process-group leader, sampled about
twice a second. Neither record supplies process start time or a trustworthy
Codex/Claude chat binding. `identity` means terminal-program identity, not an
agent session. [Types][core-types], [foreground][core-foreground]

Require exact local-address/core binding before looking up an OS PID. Use
fresh OS owner/start/executable checks for input and preserve independent
provider chat/turn/request/digest checks. Matching directory, title, labels,
OSC status or a shared daemon by itself grants no input authority. A kept
terminal can retain its address while its process is replaced.

### Reads and delivery are not interchangeable

1. `terminal.peek` is an App mutation and must never appear in a read allowlist
   or preflight text-read implementation.
2. `terminal.read` with positive history lines can scroll a full-screen
   program to stitch text. For passive UI validation use explicit `lines:0`,
   omit `caller`, and forbid history/stitched fallback. Its text result has
   **no cursor or edit-mode proof**. [Read handler][core-api]
3. `terminal.keys` waits for a per-terminal queue and, by default, three
   seconds without human typing. State may change after DeckShep's preflight
   but before bytes are written. Its parameters do not bind a dialog digest,
   foreground start time or an expiry. [Input queue][core-input]
4. Socket timeout/disconnect is not cancellation of a queued key request.
   Plain requests await the handler; framed cancellation tracks
   `machine.exec`, not key calls. App control requests can likewise outlive
   the client. No timeout may cause replay or a claim that nothing happened.
   Keep Milestone 2 off until the delivery design addresses delayed writes
   while preserving the existing stale-context guards. [Server][core-server],
   [App queue][app-control]

## Events, version checks and reconnects

Core features at this pin are `framed`, `attach`, `events`, `status`, `shell`,
`resize_notifications`, `automatic_input`. Compare them as a normalized exact
set for a mutation verification record. The App's own compatibility check
requires core generation 1, core version at least 0.1.11 and its required
method list; that is weaker than DeckShep's mutation policy. [Core API][core-api],
[App handshake check][app-hc]

Notifications include `event`, `heartbeat` and `missed`. Events carry `seq`,
type, terminal address and data; foreground, status, title, labels, loss,
restart and remote reconnects can invalidate a captured target. Sequence
numbers restart per core process, while `hello.core.id` persists across
restarts. `missed` replaces the snapshot; do not replay older events. Bump
DeckShep generation and invalidate presses on lost connections, peer/process
replacement, tuple changes and resynchronization that loses target proof.
Refetch shared documents after reconnect or missed events. [Event rules][core-wire]

Remote records use machine-qualified addresses, and the App lists each
space's machine. Local-only discovery must correlate both APIs and exclude
remote/ambiguous records **before** OS process inspection or provider reads.
No SSH, machine connection, remote execution or remote input belongs in this
backend's first release. [World listing][app-window], [list schema][core-schema]

Core hello reports version/features, but no executable build digest; its
generation is not a second independent protocol-version field. App `--version`
reports only Cargo version; installed plist versions cannot prove the running
peer's version after an update. Phase 1 must define a non-activating,
peer-bound build/instance identity and App compatibility check. Do not invent
an App hello or treat the current plist as a running-process handshake.
Unknown build provenance means no mutating verification-record match.

## Isolation recipe derived from source; not executed

Source supports separate App and core namespaces. `HERDR_APP_HOME` alone does
not isolate core. `HERDR_CORE_DIRS` restricts **binary search**, not endpoint
selection, and an explicit `settings.json` core path is tried before it.
[Binary search][app-core-bin], [endpoint resolution][core-paths]

A future authorized harness must build on `isolatedEnvironment`,
`authorization`, `OwnedProcesses` and `settingsHashes`, with all of these:

| Setting                                                           | Test-only value / purpose                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `HOME`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, XDG config/state/cache | Private directories from the existing helper; no inherited auth/routing/hooks             |
| `HERDR_APP_HOME`                                                  | Fresh private App directory, no existing socket or copied user configuration              |
| `HC_SESSION`                                                      | Unique nonempty test session; never `default`                                             |
| `HC_SOCKET`                                                       | Explicit short absolute socket within the test directory; its holder socket is beside it  |
| `XDG_RUNTIME_DIR`                                                 | Private directory; do not inherit the real runtime namespace                              |
| `HERDR_CORE_DIRS` and App `core` setting                          | Restrict/pin the chosen test binary; no production binary-search fallback                 |
| `HERDR_TELEMETRY=0`, `DO_NOT_TRACK=1`, `HERDR_APP_NO_SOUND=1`     | Disable telemetry and sound for the test instance                                         |
| Process umask                                                     | `0077` before launch; private directories and sockets, not chmod of a production endpoint |

Use a short randomized temporary root and check the core's socket/holder path
length limits before launching. The core separates state by session, reads
config from the private XDG config directory, and resolves its socket from
`HC_SOCKET`, then config, then the runtime directory. [Paths][core-paths],
[Unix paths and private files][core-unix]

On macOS, automatic core startup normally moves the core into launchd and
reparents it, breaking ordinary ancestry proof. Prestart a test-owned core
directly instead: the pinned source has a parent-PID-scoped
`HC_LAUNCHD_DIRECT` check for `serve`. A future harness may supply its own PID
to that **core launch only**, verify the actual peer PID/start time still
matches the owned child, and then launch the App with the same private
endpoint. This is an internal, exact-build-dependent mechanism, not a public
support promise or a setting to add to DeckShep production configuration.
If ownership cannot be proved, refuse; never adopt a launchd PID from its
reported socket/status alone. [macOS startup][core-launchd]

Launch the test App executable directly through `OwnedProcesses`, never
`open -a`, Finder, a URL or a guessed existing window. `raise_running()`
connects to the chosen App home's socket and sends a raise before core
startup; a shared home could activate the real App. Verify the home is
fresh before launch, then verify the served socket belongs to the owned App.
The App source registers no URL/reopen handler of its own; OS/LaunchServices
behavior still needs isolated native validation. [Startup][app-main],
[single-instance control][app-control]

Use a test-owned source build without `HERDR_APP_RELEASE` or
`HERDR_RELEASES_URL` for the first isolation calibration. Release builds
can download/apply updates beside their executable and can update core;
App home does not relocate those installation writes. Any later release-build
calibration needs a private executable/bundle copy and an explicitly bounded
update setup. Never run the installed release as a disposable test instance.
The App also maintains its CLI link under HOME, so HOME must be private.
[Updates][app-update], [CLI link][app-cli-link], [telemetry][app-telemetry]

Before application requests, prove both endpoint paths, socket owner/mode and
peer PID/start identity; repeat endpoint checks for new connections. Peer
credentials require a connection, so distinguish path/ownership checks
**before connect** from peer verification **before the first request**. A
macOS peer-PID adapter and its fake tests remain to be implemented. Abort
before a request on ambiguous or non-owned peers; no production fallback.
Observe and retain start identities for owned descendants before cleanup,
and check settings hashes in a failure-safe finally path. No live recipe was
attempted in Phase 0; its process and socket assumptions still need proof.

## Phase 0 hand-back and decisions required

Production capabilities remain empty. No change to identities, profiles,
consents, preferences, golden JSON or release evidence is justified here.

| Item                   | Result / remaining gate                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Version refresh        | App release pinned; core release and prior development pin distinguished; exact running pair unknown            |
| Transport shapes       | Documented above; synthetic read-only fixtures can be authored after owner review                               |
| Isolation              | Separate namespaces and a candidate owned-process launch derived from source; native calibration still required |
| Original verified focus/Zoom | Still blocked on fresh independent binding/read-back; plain focus-only scope approved separately |
| Milestone 1 requests | Read-only selection feedback fixtures implemented; guarded sender and peer-bound exact App build identity pending |
| Milestone 2            | Deferred and disabled; chat binding, passive native-view checks and delayed-write semantics unresolved  |
| Composer               | No verified cursor/edit-mode snapshot; staged Send/Steer/Queue stay unavailable                                 |

The owner approved plain focus requests for Phase 2 without a verified-focus
claim. Any future verified focus/Zoom still needs independent read-back.
A bridge/mod would need its own reviewed installation, consent,
instance binding and removal/migration path; this ADR does not install or
select one. Continue only independently safe fixture work after Phase 0 is
accepted, and request separate current authorization before any native run.

Native questions to preserve in the validation checklist:

- Can the exact chosen App/core builds coexist with the real installation
  without any production socket access, LaunchServices handoff or update write?
- Can endpoint peer PID/start identities and all agent/holder ownership be
  retained through startup, shutdown and intentional reconnect scenarios?
- Which fresh observation proves actual keyboard ownership, overlay absence,
  target pane/agent mapping and the active window/screen, including minimized,
  hidden and full-screen states? Can Zoom and unchanged other screens be proven?
- How is the displayed Codex chat independently bound across new/resume/fork,
  and how are Claude hooks kept private and fresh for only the owned agent?
- Can a native key be guaranteed to obey the captured context at the actual
  write, including human typing, dialog changes, timeout and connection loss?

[app-release]: https://github.com/herdrdev/herdr-app/commit/2405bf388c568c3ed479f05b8e405ccfa44b3f2c
[app-prior]: https://github.com/herdrdev/herdr-app/commit/7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8
[app-control]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/control.rs
[app-core-bin]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/core_bin.rs
[app-hc]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/hc.rs
[app-commands]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/commands.rs
[app-mods]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mods.rs
[app-mod-files]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mod_files.rs
[app-mod-fs]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/vendor/gpui-kit/crates/shell/src/engine/quickjs/standard/fs.rs
[app-mod-fs-host]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/vendor/gpui-kit/crates/shell/src/engine/quickjs/host.rs
[app-window]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/window.rs
[app-main]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/main.rs
[app-mirror]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mirror.rs
[app-mirror-sync]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mirror_sync.rs
[app-update]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/update.rs
[app-cli-link]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/core_bin/cli_link.rs
[app-telemetry]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/telemetry.rs
[core-release]: https://github.com/herdrdev/herdr-core/commit/3965a46caae095a3ead01de237fa13955e52b8c6
[core-prior]: https://github.com/herdrdev/herdr-core/commit/cd12ddd88bc11490228343291dc1096c9ed3bf77
[core-schema]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/schema/hc.openrpc.json
[core-wire]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/schema/README.md
[core-types]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/api/types.rs
[core-foreground]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/foreground.rs
[core-api]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/api.rs
[core-input]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/input.rs
[core-server]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/server.rs
[core-paths]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/paths.rs
[core-unix]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/platform/unix.rs
[core-launchd]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/crates/herdr-core/src/platform/macos_launchd.rs
