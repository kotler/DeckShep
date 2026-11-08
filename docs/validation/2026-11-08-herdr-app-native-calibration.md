# Herdr App first native calibration: blocked before focus

Date: 2026-11-08. The owner explicitly authorized the prepared-source calibration
in this chat. Scope: private App/core copies, test-owned PIDs/endpoints, two
disposable `/bin/cat` panes and plain focus requests, with cleanup and tracked
settings fingerprints. No provider, installed app or existing agent was a target.

**The native calibration did not pass.** Core startup/peer/protocol checks passed
after a transport fix. The private App then launched and returned a schema-valid
status reply, but its post-reply peer proof was unavailable. The harness refused
before creating test spaces or sending any focus request. Production build
records and App capabilities remain empty; no verified-focus claim is made.

## Evidence and attempts

Artifacts and source pins are those in the
[source artifact record](2026-11-08-herdr-app-source-artifacts.md). The candidate
manifest remains `d8ef3f9d48d9c560da494489a13d225d46017c451325ef032fa1728dfb0cb8e2`.
Every attempt used a new private run root; no failed mutation was retried on an
existing target. The driver was invoked by its exact file, with `ASW_LIVE=1`,
`ASW_LIVE_AUTHORIZATION=test-owned-only` and `ASW_LIVE_HERDR_APP=1`.
Rex/provider live flags were not enabled and no general live suite was invoked.

[Sanitized structured reports](2026-11-08-herdr-app-native-calibration.json) retain
all four attempts:

| Attempt | Result | Cleanup / tracked settings |
| --- | --- | --- |
| 1 | Stopped at core preflight; App not launched | Passed / unchanged |
| 2 | Fixed-label diagnostics identified waiting for core `hello` | Passed / unchanged |
| 3 | Core peer verified at 114 ms; 83 bytes written/drained at about 117 ms, zero reply bytes read before timeout | Passed / unchanged |
| 4 | With the reader fix, core preflight passed; App returned 176 status bytes, then post-reply peer validation refused | Passed / unchanged |

The fingerprints cover the existing safety helper's five global Codex/Claude
configuration/auth files. They do not certify every macOS preference store.
Cleanup was performed by `OwnedProcesses`, using recorded start identities and
ancestry; only test-owned processes were stopped, and each run root was removed
after successful cleanup. The test reports contain no private paths, PIDs,
terminal contents or raw native exceptions. TAP stack paths were redacted in
the private log capture; no raw build/test log is distributed.

## Transport bug found and fixed

Passing a Node socket as a child's stdio stream stops its reader. The native
peer helper received the correct descriptor and verified the core, but the
caller left the reader paused after the helper exited. The request drained to
the socket while its reply remained unread. This explains the first three
preflight failures; it was not evidence of a wrong peer or an unsupported `hello`.

A private-helper/socket regression first reproduced `readableFlowing:false`
where a previously active reader was required. `nativeAppPeerProbe` now restores
an already flowing reader in `finally`, after helper completion, while retaining
an explicitly paused caller's state. Tests exercise valid and refused helper
output, both initial flow states and a real fixture reply after probing. The
500 ms helper deadline, signing/identity checks, output bounds, cancellation,
single-use permits and no-retry semantics are unchanged.

This is a narrow runtime transport fix for separate review, not production App
enablement. No installed plugin was replaced or restarted.

## Native blocker: peer proof after one-shot server close

Pinned App `src/control.rs::serve` reads one line, writes its reply and returns,
closing the server-side connection. Retaining the client descriptor with
`allowHalfOpen:true` does not guarantee that Darwin retains `LOCAL_PEERTOKEN`
after the server closes.

The signed Swift self-fixture was extended to verify its own connected peer,
close the accepted server socket, read EOF on its client and query peer proof
again. On this **macOS 27.2** host, proof was **unavailable** after that close.
Where a different OS retains credentials, the fixture requires the entire peer
evidence to remain identical. No installed App/core/agent is inspected by it.

In attempt 4, the App peer passed its pre-request proof and returned a valid
status response. The fresh post-reply descriptor check then failed at
`app.peer-after.0`. From the App source and self-fixture, we infer that one-shot
close is the blocker in the current verification approach.
The native run never reached command discovery, pane setup or focus delivery.

The post-reply guard has not been removed or relaxed. A new fixture contract
requires unavailable post-reply proof to refuse a read; if a focus request has
already been dispatched in a synthetic scenario, the result must remain
uncertain, with one action total and no retry/compensation. Harness diagnostics
now retain only fixed step labels, elapsed times and byte counts.

## Next gate

Automated verification of the local fix: **254 tests, 251 passed, 3 live groups
skipped, 0 failures** with live flags removed. Source coverage is **94.76%
lines/statements, 90.10% functions, 86.74% branches**; branches increase 0.04
percentage points from the artifact checkpoint, with no threshold/exclusion
changes. Strict source/e2e typecheck, lint, dependency boundaries, Knip,
formatting, version and compatibility checks passed. The failing socket-flow
regression was observed before the fix; its restored-reader and post-reply
refusal contracts pass afterward. Existing golden/browser baselines are unchanged.
Universal build, four bundled golden groups and private-review package/audit
passed. Nothing was installed, restarted, linked, pushed or uploaded. Browser
tests were not rerun because no layout or rendering code changed.

Review a peer-proof lifetime design suitable for one-shot connections before
another native focus attempt. One candidate is an initial kernel-authenticated,
descriptor-bound audit-token lease whose process/signature can be revalidated
after EOF. Its provenance, PID reuse/exec behavior, lifetime and private transport
must be specified and tested first. Another route is a supported App interface
with an appropriate peer/attestation contract. No cached request ID, reported
pane/core PID, inferred success, mod installation or generic action sender may
substitute for proof. No upstream contact occurred.

These findings do not approve native focus completion, App/core terminal binding,
Zoom, provider input, a release binary or promotion of the experimental profile.
Normal/default test runs still skip all live groups. Any later live session
requires current authorization; no production record was populated.
