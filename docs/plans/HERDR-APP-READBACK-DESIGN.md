# Proposed optional Herdr App read-back mod

Status: on hold after source review, 2026-11-08. No mod implementation,
installation, native check or upstream contact has been performed. This is a
proposed way to investigate the [Phase 0 read-back gap](../adr/0007-herdr-app-0.1.14-source-review.md),
not evidence that Milestone 1 can already be enabled.

## Recommendation and limits

Defer the mod. Evaluate the ordinary socket for focus feedback first; keep
Zoom and contextual input disabled. The current source does not supply the
App-to-core identity binding needed to promote either route to verified focus.
The owner must choose whether Milestone 1 waits for verification or changes
scope to plain focus requests. The existing H1/H4 gates remain in force until
that decision; this document does not authorize an implementation exception.

The source exposes `focused()`, `panes()`, `spaces()`, `layout()` and `window()`
inside a mod. Ordinary socket replies do not contain the same facts, and core
shared documents intentionally exclude each screen's focus and Zoom state.
Those make a mod relevant to Zoom, but do not establish its feasibility as a
trusted read-back bridge.
[Mod API][guide], [snapshot implementation][mods], [private views][mirror]

The remaining limits are material:

- A mod is trusted executable code with broader platform access. “Read-only”
  describes this proposed implementation's behavior, not a sandbox guarantee.
  Its reviewed source must not call `run`, `exec`, `hc`, clipboard functions,
  terminal read/input APIs, remote APIs or network endpoints.
- `focused()` describes the App's view context; it does not independently
  prove OS foreground-window identity or every overlay's keyboard ownership.
- A local terminal address such as `t1` does not prove which core owns it.
  The bridge must not simply echo a core ID supplied by the requester.
- One mod copy cannot prove the state of unobserved screens or windows.
  The exact Milestone 1 observation contract must be established before a
  focus/Zoom verification record can be created.

## Step 0: source-only feasibility gates

Reviewed against App 0.1.14 at `2405bf388c568c3ed479f05b8e405ccfa44b3f2c`
and core 0.1.18 at `3965a46caae095a3ead01de237fa13955e52b8c6`.
These findings concern source behavior, not the developer's running processes.
Stop before mod implementation while a required gate is unresolved.

| Gate                         | Source finding                                                                                                                                                                                                                                                                                                                      | Result                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filesystem writes            | `capabilities()` grants writes under App home. `fs/promises.writeFile` writes directly and exports no `rename`. Instead, `herdr.writeTextFile(path, text, expected)` replaces an **existing** file using a same-directory temporary file and rename after comparing its previous contents. Creating a missing file writes directly. | Feasible only with an installer-precreated private slot, expected previous contents and verified directory/file ownership. Never claim generic `writeFile` is atomic.                                                               |
| Challenge delivery           | `run_as` splits an unknown command at the first dot; `send_command` delivers only the suffix string to every shown copy. `args` are not forwarded to `nextCommand()`.                                                                                                                                                               | A bounded command such as `deckshep-readback.snapshot:<nonce>` can carry a nonce in the string, with no request args. Dispatch success is not a response.                                                                           |
| Fresh observation            | `nextCommand()` is an asynchronous string receiver. Synchronous `focused()`/`panes()` reads access the latest published thread-local snapshot, not a new native focus query. `sync()` publishes after model/focus synchronization, but dispatching a mod command does not itself force publication or return a revision barrier.    | Challenge delivery is feasible; freshness relative to native keyboard state remains unproven. A fresh nonce alone does not fix a stale host snapshot.                                                                               |
| Non-focusable indicator      | `focusable` defaults false and controls `pane.go` navigation into mod blocks. A plain display-only layout block can omit all focus handles, inputs, buttons and key/click handlers. Trusted mod code could still request focus.                                                                                                     | Source supports avoiding navigation focus, not an unconditional guarantee about every click/native state. Require a chrome indicator, not a terminal-replacing mod pane, plus isolated keyboard/click calibration before promotion. |
| Independent App/core binding | Neither the socket nor these mod snapshots exposes the App's connected core ID or native peer/window identity.                                                                                                                                                                                                                      | **Blocked for verified focus/Zoom.** Matching `t1` or echoing a requested core ID is insufficient.                                                                                                                                  |

[Filesystem policy and command receiver][mods], [atomic replacement][files],
[filesystem exports][fs], [direct write implementation][fs-host],
[publication, dispatch and navigation][window], [guide][guide]

### Exact terminal correlation and ambiguity

For terminal panes, `panes()` exposes `pane`, `terminal`, `tab`, `title`, `cwd`,
`branch`, `status`, `app`, `program`, `focused`, `zoomed` and `movable`.
It exposes no core ID, terminal creation time, terminal PID, process start time
or stable native window identifier. Mod panes have `terminal:null`.
`focused()` adds space/tab/pane and model/shown terminal addresses;
`window()` adds activation/fullscreen/maximized facts, not a native window ID.
[Publication][window], [window fields][titlebar]

Core terminal records contain `address`, `created_ms`, `pid`, `foreground`,
labels and other terminal facts. The only direct terminal identifier shared
with `panes()` is `terminal == address`. App-written `herdr.space`/`herdr.tab`
labels are useful consistency checks, not independent core ownership proof.
Cwd/title/program/status are mutable, non-unique private data, so they must
not become identity substitutes. The App holds its core hello internally via
its `hc connect` child; that hello is not exported by the reviewed mod surface.
[Core records][core-schema], [App connection][hc], [label writer][window]

The broader `terminals()` mod snapshot retains core record fields, including
`address`, `created_ms` and nullable `pid`, after App status/title normalization.
A future minimal whitelist could compare those three fields against the
selected core record as an additional consistency check, without exporting
titles/cwd/argv. It is cached event/list data, not an independent native process
query, and lacks process start time or the App's core connection epoch. It
therefore does not by itself close the binding/freshness gate. Do not overlook
this stronger candidate in later isolated calibration, or claim that `panes()`
is the entire mod API. [Terminal publication and refresh loop][window]

Consequently there is **no complete binding algorithm on this public surface**.
A future API must expose the connected core's identity from that connection,
plus a lifecycle/window binding the plugin can independently verify. Only after
that binding exists may the plugin join a local address within that core and
require exactly one selected space/tab/pane mapping. Missing binding, zero or
multiple matches, conflicting shown/model terminals, or an endpoint/epoch
change means refusal and invalidation. Do not pick the first match. A protocol
field supplied by the requester or the mod's static props cannot fill this gap.

## Lighter focus route and owner decision

`{status:true}` already returns `space`, `tab`, `focused_pane` and `agent`.
`{ls:true}` maps space/tab/pane to terminal and reports active space/tab flags.
For selection feedback, bracket an `ls` read with status reads on the same
verified endpoint epoch; require identical relevant status fields, exactly one
active matching space/tab and one local pane-to-terminal mapping. Refuse null,
missing, contradictory or duplicate mappings and unsupported view contexts.
This is a proposed consistency check to test, not an atomic snapshot: the App
can change and return between reads. [Control and listing][window]

Source traces explain its limits: `self.focused_pane` is presentation state
synchronized from the model (or a layout terminal block). Modal dialogs can
retain the keyboard; peeks, floats and swapped views can own it independently.
`status.agent` can differ from the model pane's terminal. Neither this socket
route nor mod `focused()` independently proves OS foreground identity. The
mod adds per-pane Zoom and richer view facts, not a solution to that identity
problem. Test socket feedback for ordinary selection, active-tab changes,
dialogs, peeks, swaps, floats, hidden layouts and reconnects before claiming
even selection read-back. [Synchronization and keyboard ownership][window]

| First-release choice                                             | Behavior and cost                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wait for verified Milestone 1                                    | Keep H1/H4 unchanged. Focus and Zoom remain disabled until independent binding, required view read-back and isolated calibration pass. No mod installation now.                                                                                                                                                                                                                                            |
| Focus-only scope amendment (recommended for owner consideration) | Discovery/status plus explicit plain focus requests, described as requested rather than verified. No `verifiedFocus`, contextual input or Zoom. Avoid mod/layout installation in the first release. Retain target/endpoint/version/stale-press guards and no retries; separately review the narrow request path and consent. Requires an explicit H1/H4 amendment and selection-only capability semantics. |

Milestone 1 sends no text: a misplaced focus request can still switch the
wrong view, but cannot authorize Milestone 2 input. A dispatch acknowledgement
must never be promoted to proof. The recommendation changes proposed release
scope, not existing runtime guards. `status.zoom` is UI scale, so Zoom remains
disabled under the lighter route. Upstream read-back could replace the mod.

## Conditional mod flow (blocked by Step 0)

1. The plugin validates the App/core endpoint identities and installed mod
   manifest, using the selected App profile and explicit read-back consent.
2. It sends a bounded, random challenge to the named mod through an App command.
   The command contains a fixed protocol verb and nonce, not an executable,
   target action, arbitrary output path or agent input.
3. The shown, non-focusable mod copy samples the permitted live view fields in
   one synchronous host callback, then writes a bounded response atomically
   into its fixed private output directory.
4. The plugin opens only its expected response slot, checks ownership, mode,
   links, size, schema, challenge, instance/copy identity, sequence and expiry,
   and applies the independent App/core binding specified above. Today that
   binding is unavailable, so this step refuses; it is not an implementation
   placeholder that may be filled with a local-address match.
5. Focus/Zoom still pass through the existing guarded delivery path. A new
   challenge is required for the post-check. Timeout, missing evidence,
   ambiguous copies or identity changes refuse without retry or compensation.

`<mod>.<command>` reaches **shown copies only**, and its App `{ok:true}` reply
acknowledges dispatch rather than supplying a mod response. Do not implement a
hidden background mod and assume it can answer. The first design should use a
small visible status indicator in a reviewed personal layout clone; it must
never claim keyboard focus. The source's ordinary mod lifecycle controls
reload, hiding and closure. [Command routing][mods], [lifecycle rules][guide]

No custom loopback service or child process is proposed for the mod. Step 0
must pass before this conditional flow is implemented.
There is also a challenge-logging constraint: if no shown copy accepts the
command, current `run_as` logs its full unknown command, including the suffix.
Thus a nonce-in-command protocol cannot promise that Herdr never logs its nonce.
Resolve that conflict before implementing the design's no-challenge-logging
rule; do not silently weaken it. [Dispatch failure][window]
The existing read-only transport deliberately rejects all `do` requests. A
bridge prototype would need a separately reviewed, narrowly validated challenge
request and consent check; it must not expose a generic App action sender or
relax the terminal-input refusals.

## Data contract and privacy

The versioned response should contain only a request nonce; module/build and
copy epoch; sequence; observation status; space/tab/pane/terminal identifiers;
the explicitly observed active-window and focus facts; per-pane zoom flags;
and the minimal structural fingerprints needed for the Zoom post-check.
Unavailable facts must be absent/unknown, not filled from the request.

Do not serialize raw `focused()`, `terminals()`, `layout()` or a shared document.
Whitelist identifiers, split orientation/weights and relevant visibility facts;
omit cwd, titles, names, mod props, argv, prompts and transcript content.
A structure fingerprint must exclude private strings and unrelated appearance
data. Shared split topology and per-screen view state remain distinct.

Use a finite request budget, one outstanding request per selected copy, bounded
buffers and cleanup of expired slots. A timestamp or repeating heartbeat alone
cannot satisfy freshness or instance binding. Never log the challenge, response,
source view or filesystem paths. Generic errors retain the existing length caps.

The plugin, not the mod's self-report, must establish native peer/build/process
identity. Missing independent App/core or active-window binding means refusal.
The mod does not grant `verifiedFocus`, `zoom`, `sendKeys` or any control merely
because it can write a response.

Verification records must include protocol version, mod version and SHA-256 of
every executable mod file (and the canonical manifest), alongside exact App and
core builds/features. The plugin must compare installed bytes before use;
self-reported hashes are insufficient. Herdr can retain an older running copy
after a failed reload, so disk hashes alone do not identify loaded code. A
trusted loaded-build/epoch binding is another promotion gate. Altered, stale or
unidentified loaded copies cannot satisfy the record. [Reload behavior][guide]

### Latency and press handling

Provisional acceptance budget: at most **250 ms** from challenge dispatch to a
complete validated response, including callback scheduling, write and plugin
read. Use a plugin monotonic deadline; late files cannot satisfy later requests.
No retries or heartbeat fallback. This is a target to measure in an authorized
isolated calibration, not an observed performance claim. If it cannot be met,
revise the design before promotion rather than extending authority silently.

The controller's **350 ms** arming delay starts after a context change; it is
not an I/O timeout or a read-back validity window. Keep it intact. Capture the
context at press time, allow one press in flight, recheck context/endpoint/
record/consent after each await, and refuse any change. A conditional focus
transaction has a separate **1,000 ms total** deadline, with each observation
still limited to 250 ms. A timed-out action may remain queued in Herdr: report
uncertain completion, revoke the captured authority and never retry or undo.
No snapshot is reusable to arm contextual input. Zoom and all input need their
own reviewed timing contract before implementation.

### Addressing and the two-window experience

The proposed selection key is `(App home, verified App peer epoch, native
window identity, installed layout node, mod copy epoch)`. It is a required
contract, not an assertion that the current API exposes that tuple. `props()`
may carry a preview-generated layout-node ID to route a response, but a static
prop is not independent native window/core proof. The plugin cannot choose a
copy just because it answered first. Every eligible shown copy must be accounted
for; duplicate, unknown or unobserved copies/windows mean refusal.

The reviewed socket is per App home; starting again normally raises that
home's existing window. Do not equate a second launch with a separately
addressable window. Two independently running App homes require separate
endpoint/peer verification and separate installation/layout consent. Under a
future supported multi-window API, each observed window would need its own
visible indicator and stable window binding. A user with two windows would
install/enable both indicators, select the intended window explicitly and get
a refusal when either required observation is missing. Current public APIs do
not establish that addressing, so this setup is not ready to offer. One copy
cannot certify the other window. [Single-instance route][control]

## Consent, installation and removal

The proposed stable destinations, relative to the chosen App home, are
`mods/deckshep-readback/` for code and `.deckshep-readback/` for private protocol
state. Exact contents, layout additions and hashes must be shown in a setup
preview before any write. Nothing is installed on discovery or profile import.
This is substantial setup: the user accepts executable code inside Herdr,
accepts a cloned personal layout with a visible indicator, and switches to that
layout manually. Each independently addressed window/home adds setup. It is
not the lightweight first-release path and must be explained before consent.

1. Preview the owned files and a personal layout clone with its non-focusable
   indicator. Do not edit a shipped layout, generated guide, other mods or
   an existing unrelated file. Explain the mod's trusted-code permissions.
2. An explicit Apply writes only the approved files, with private permissions,
   an ownership/version manifest and recovery backups. Read-back consent is a
   separate explicit profile setting; native input and Claude controls stay off.
3. If the selected source App home, files or layout have changed since preview,
   require a fresh preview. No application restart or automatic layout switch.
4. Preview removal; revoke read-back authority and pending requests before
   deleting only manifest-owned, unchanged files/state. Remove the owned layout
   node without overwriting later user edits. Preserve modified files/backups
   for manual recovery. The original layout remains available.
5. Version the bridge contract and retain a tested removal/migration path before
   changing its installed paths or protocol. Old responses and old copies cannot
   authorize a newer client.

Remove this integration **before uninstalling DeckShep**, just like Claude
hooks; removing the Stream Deck plugin cannot remove code left in Herdr.
See [Uninstall](../UNINSTALL.md). Before any mod installer ships, the setup
panel and CLI doctor must report, for explicitly selected App homes only:
owned installation present/absent/modified, version/hash and loaded-build
verification status, and the removal-before-plugin order. Unknown ownership
must direct manual review without deleting files. Fixture tests must cover
modified/missing manifests, multiple homes, symlinks and path-free messages.
The current doctor has no mod inventory/removal support; do not ship a mod
until that work and recovery instructions exist.

The first implementation should provide pure preview/apply/remove planning and
temporary-directory tests. Applying anything to a real App home, loading it in
Herdr, running `herdr-app check`, or changing a real layout requires separate
current authorization under the standing instructions.

## Required evidence before promotion

- Contract and privacy fixtures: stale/replayed responses, multiple shown
  copies, hidden/unloaded/reloaded copies, forged paths, replaced endpoints,
  malformed/oversized state and mismatched App/core/record identities.
- Guard integration: no read-back consent means no bridge request; record or
  consent revocation invalidates pending input; all per-control refusals remain.
- Authorized isolated calibration on exact builds: keyboard ownership versus
  model focus, dialogs, minimized/hidden/full-screen states, process/core/App
  restart, and all relevant window/screen observations.
- Zoom proof: resolve the target before mutation, observe the expected zoom
  change, restore the exact original split on a deliberate second press, and
  prove the required unaffected-screen invariants. If those facts cannot be
  observed, Zoom stays disabled.

Only after those gates pass can Milestone 1 records advertise validated focus
and Zoom. This proposal does not expand Milestone 2 or enable a release.

## Review disposition and upstream alternative

The 2026-11-08 review is accepted: put feasibility first; remove the unsupported
core-correlation claim; evaluate socket focus separately; state per-window setup
cost; and gate removal, code identity, timing and distribution before installation.
Separate consent, preview-first setup, unchanged-file-only removal, minimized
responses, a narrow challenge sender and refusal on uncertainty remain required.
Marketplace/Herdr mod-policy and licensing review is pending; see the
[submission checklist](../MARKETPLACE.md). No policy clearance is inferred.

H6 remains an owner-only action. Prepare this request for the owner to send in
parallel with fixture work: expose a versioned read-only status snapshot with
the **connected** core ID/build/connection epoch, stable window/view identity,
selected and keyboard-owned terminal/pane, modal/overlay ownership, per-pane
Zoom and layout revision, plus a request-correlated freshness barrier. Prefer
one atomic response over composing `status` and `ls`; define unavailable and
ambiguous states explicitly. A read-back API would avoid installing executable
code and cloned layouts. No upstream message has been sent.

[guide]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/defaults/AGENTS.md
[mods]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mods.rs
[mirror]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mirror.rs
[window]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/window.rs
[files]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mod_files.rs
[fs]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/vendor/gpui-kit/crates/shell/src/engine/quickjs/standard/fs.rs
[fs-host]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/vendor/gpui-kit/crates/shell/src/engine/quickjs/host.rs
[hc]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/hc.rs
[titlebar]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/window/titlebar.rs
[control]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/control.rs
[core-schema]: https://github.com/herdrdev/herdr-core/blob/3965a46caae095a3ead01de237fa13955e52b8c6/schema/hc.openrpc.json
