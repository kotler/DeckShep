# Herdr App post-close design and fixture evidence

Date: 2026-11-08. Owner scope: post-close peer verification design and fixture
tests, with live App runs disabled and production records empty.

The [design](../plans/HERDR-APP-POST-CLOSE-PEER-DESIGN.md) specifies a persistent
per-connection native helper retaining the original kernel audit token and
freshly revalidating its process/code image after a complete reply. This phase
does not implement that protocol in production. The packaged protocol-1 helper,
sender and current post-close refusal remain unchanged. The earlier
[native App calibration](2026-11-08-herdr-app-native-calibration.md) remains
blocked before focus.

## Fixture results

Host: macOS 27.2, arm64; Node 26.13.0; Apple Swift 6.4.2. Both arm64 and x86_64
fixture sources typecheck against the macOS 13 deployment target. Only arm64
execution was exercised. All live authorization/environment flags were unset.

| Group | Result |
| --- | --- |
| Lease lifecycle model | 13 passing tests; injected native evidence only |
| Persistent helper reader lifecycle | 2 passing tests; private temporary sockets/owned Node helper |
| Signed native self-process fixture | 1 passing test covering four scenarios; no other process inspected |
| Full `npm run test:coverage` | 270 tests: 267 passed, 3 live groups skipped, 0 failures |
| Typecheck, lint, formatting, dependency boundaries, knip | Passed |
| Version and compatibility checks | Passed |
| Local `npm run package -- --skip-build` | Existing universal payload validated, packed and audited; private-review output only |

Source coverage stays at 94.76% lines/statements, 90.10% functions and 86.74%
branches, unchanged from the preceding checkpoint. No thresholds, exclusions or
golden snapshots changed. Tests and the executable design contract remain under
`tests/`; the distribution audit now rejects their dedicated fixture marker.
The package check reused the existing build because packaged source/native code
did not change. It is not a rebuilt protocol-2 helper or release approval.

The full suite passed before the native fixture's final tightening to require
HUP when post-close kernel metadata is absent. The signed self-process test was
rerun after that change, including both architecture typechecks. No second full
run was needed for that fixture-only check.

### What the native fixture established

- **Close:** capture a kernel token from a socket served by the same process,
  preflight it, write/read a fixed reply, close the server and observe client EOF.
  Socket peer metadata was unavailable on this host. Fresh process/path and
  dynamic signing checks using the original token succeeded. Repeated
  finalization and late capture refused.
- **Expiry:** an injected clock at the exact 1000 ms limit refused. A token with
  an altered identity version for the fixture's own PID also refused. This is
  not a real-time native watchdog test.
- **FD reuse:** replacing the caller's numeric FD left the fixture helper's
  independent duplicate pinned to the original, now closed socket. The
  replacement remained connected. Both peers were the fixture itself; this
  does not establish discrimination between two different processes.
- **Self-exec:** exec of the same signed binary retained the PID but changed its
  identity version. The old token no longer resolved a valid image; a fresh
  self-owned socket token did. The fixture alone carries its old token through
  an anonymous pipe between its own exec images, never through argv, environment,
  files or diagnostic output. The proposed production protocol forbids token
  serialization and helper exec entirely.

The native fixture links the existing `peerProcess`/`peerCodeHash` primitives
with test-only retained-token code. It inspects only its own PID, performs no
process scan and creates sockets/files only in its private temporary directory.
Results contain fixed scenario names/booleans, with no PIDs, local paths or
tokens. Actual PID reuse, other-process authorization and App timing remain
unmeasured.

### What the model and reader fixtures established

The model requires an initial kernel match, fresh connected proof before write,
and fresh stable image evidence at finalization. It rejects missing/malformed
proof, wrong UID, caller-supplied token fields, identity changes, Socket-object
or endpoint/selection rebinding, expiry, clock rollback, abort, overlap, replay,
incomplete/malformed/extra/oversized replies and failed cleanup. It also checks
binding/time/kernel changes while final inspection is pending. Any error after
dispatch remains uncertain. The opaque model grants no input or verified-focus
authority and cannot satisfy the real `AppPeerVerifier`.

The reader experiment demonstrates that an originally flowing Node Socket must
resume at capture-ready while a persistent helper is still alive. Waiting until
helper exit would block the reply that finalization needs. It received a fixed
fixture reply before helper exit and preserved an explicitly paused caller.
Its helper only calls `fstat` on its own fd3; it does not verify a peer or read
App bytes. This experiment does not implement the strict proposed IPC protocol.

## Boundaries and next gate

No Herdr App/core was launched, connected to, focused or sent input. No installed
plugin, existing agent, real HOME or settings was inspected or changed for this
work. No native App run was enabled, and no upstream contact occurred.
`APP_FOCUS_RECORDS` and `backendCapabilities['herdr-app']` remain empty, asserted
by the tests. No production record, manifest or capability was promoted.

Next is a separately reviewed implementation of the explicit native session and
parent bridge, including integrity pinning, bounded IPC/deadlines, parser and
reader restoration, disposal and uncertain outcomes. Then rebuild the helper
and prepare a new exact-hash test manifest. A fresh App/core calibration still
requires separate current authorization; this fixture evidence does not supply it.

Primary-source pins and API links are recorded in the design: Apple XNU
`f6217f891ac0bb64f3d375211650a4c1ff8ca1ea` and Security
`db15acbe6a7f257a859ad9a3bb86097bfe0679d9`. They support the proposed token/version
semantics and are distinct from proof about this host's exact kernel source.
