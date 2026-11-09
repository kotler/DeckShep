# Herdr App post-close peer verification

Status: design and fixture evidence, 2026-11-08. The owner authorized this
work with live App runs disabled and production records empty. This document
proposes a future helper protocol; it does not change the packaged verifier.
The [native calibration](../validation/2026-11-08-herdr-app-native-calibration.md)
remains blocked before focus. See the
[fixture validation record](../validation/2026-11-08-herdr-app-post-close-design.md).

Later checkpoint: the owner authorized implementation, isolated App/core
calibration and preparation of a hardware build. The
[runtime validation](../validation/2026-11-08-herdr-app-peer-session.md) now records
a passing source calibration. The design-only status above describes the earlier
checkpoint; production records/capabilities remain empty.

## Problem and selected design

The reviewed App serves one request and closes its connection after the reply.
On the calibration host, querying `LOCAL_PEERTOKEN` after that close failed.
Keeping the Node client half-open did not preserve the kernel's peer answer.
The current verifier correctly refuses; a cached PID or an earlier successful
verdict cannot replace a fresh post-reply check.

Use one persistent native helper for one connected socket and one request.
Capture the full kernel audit token before any request byte, retain it privately
inside that helper, and freshly revalidate the original process image after
the complete reply. If the socket still supplies a token, it must match too.
Losing socket peer metadata after a normal close is allowed only at finalization;
it never bypasses the retained-token process/code checks.

The result means **the originally connected peer's process image still matched
at finalization**. It grants no verified focus, provider identity, active window,
keyboard ownership, Zoom, composer state or input authority. It does not prove
that a disconnected socket still has an owner. A response is accepted only on
the original request stream under the exact reviewed App source/build contract.

## Source basis and limits

The existing native primitive resolves the executable using
`proc_pidpath_audittoken`, and uses `kSecGuestAttributeAudit` to obtain and validate
dynamic code. The token includes a PID version; a bare PID does not carry that
protection. Apple documents the audit-token guest attribute in
[SecCode.h][sec-code] and [guest attribute keys][guest-keys]. These APIs identify
code; they do not observe UI focus.

Pinned XNU source increments the process identity version on exec, explicitly
avoiding its previous value, and rejects a process-info request when the supplied
identity version differs. See [exec identity update][xnu-exec] and
[process-info comparison][xnu-proc]. This supports rejecting even a same-PID,
same-binary exec. It is a source-derived expectation, tested separately below;
these source snapshots are not a claim about the exact installed kernel build.

The signed self-fixture revalidated its original audit token after closing its
own server socket and reading EOF. It also rejected that token after exec of
the same signed fixture binary at the same PID. This is native primitive evidence
on one host, not App/core calibration, actual PID-reuse coverage, or proof of a
complete production helper lifecycle.

An audit token does not authenticate every byte on a stream. A peer could pass
its connected FD to another process. The reviewed App path must continue to serve
its own request/reply without delegation. Build review must recheck that property;
changed/delegating builds stay unsupported. If the product needs resistance to
arbitrary same-user process compromise or per-message authorship, this protocol
is insufficient; it needs an authenticated upstream channel. Do not infer such
guarantees from the post-close check.

## Binding and lifetime

The parent owns an opaque, non-serializable session bound to all of:

| Binding | Requirement |
| --- | --- |
| Connection | Actual Node Socket object, one connected stream, not an FD number or path alone |
| Endpoint | Existing canonical path, device/inode, owner/mode and parent-directory checks |
| Selection | Discovery generation, reviewed record key, verified peer key and request epoch |
| Process | Kernel token's PID, effective UID and PID version; observed real UID, start seconds/microseconds and canonical executable |
| Code/build | Fresh dynamic signing validity/CDHash; existing App executable/plist/file identity and exact reviewed build checks |
| Helper | Reviewed protocol version and packaged helper content hash, checked before spawn; never approve an observed hash automatically |
| Time | Original monotonic request deadline and cancellation signal |

Only the connected descriptor is inherited as fd3. The helper pins its own
kernel reference, with close-on-exec for any duplicate. It obtains its token
using `LOCAL_PEERTOKEN`; no PID, token, code hash, executable, arbitrary path or
FD number is accepted from the caller as peer evidence. The full audit token
never leaves native memory. The helper must not exec or launch children.

The parent keeps request and identity state in memory, never in settings, a
file, a cross-request cache or an IPC-addressable global registry. Metadata
returned by the helper is untrusted until strict schema and existing record
checks pass. Do not log tokens, PIDs, local paths or raw native errors.

Capturing twice, replacing the Socket object, FD-number reuse, reconnecting,
changing any binding, cancellation, clock failure or expiry burns the session.
No recapture, renewal, retry or fallback to a PID lookup is allowed. A new
connection requires the entire original authorization and preflight sequence.

## State machine and fresh checks

1. **Capture.** Start the parent's total deadline before spawn. Verify helper
   integrity, endpoint and selection. The helper checks connected socket state,
   obtains a correctly sized kernel token with the expected UID, then brackets
   dynamic code inspection with fresh process/path/start observations using that
   original token. Recheck the connected token and time after inspection.
   Missing token, HUP/error, changed token/image or malformed evidence refuses.
2. **Ready.** After the validated capture-ready frame, restore an originally
   flowing parent Socket reader while the helper stays alive. Check exact App
   build, record and all parent bindings. The helper's connected pre-write check
   freshly repeats token/process/code validation; a missing socket token still
   refuses here. No request can precede this check.
3. **Dispatch once.** Recheck topology, generation, consent and the existing
   `AppFocusPermit`. Consume the write lease synchronously with the one write,
   with no asynchronous gap that could preserve a stale permit. Mark the request
   potentially written before attempting dispatch. No retry after this point.
4. **Reply.** Receive and validate exactly one bounded UTF-8/LF/schema-valid
   reply from that same Socket, retained with `allowHalfOpen:true` until disposal.
   Incomplete frames, surplus frames/bytes, refusal, timeout or parser failure
   cannot finalize positively. EOF after the complete
   reply is expected for this reviewed App; EOF before it is failure.
5. **Finalize once.** Burn the finalization slot before awaiting work. If a
   kernel token can still be queried, require the original token exactly; a
   different token is never treated as unavailable. Classify missing metadata
   as post-close unavailability only on the pinned valid socket after EOF/HUP
   and a complete reply; bad descriptors or unexplained errors refuse. Always
   freshly query the original token's process and dynamic code, bracket observations and compare
   every captured image field. Recheck time, App files, endpoint/selection and
   helper integrity before accepting the final result. Exec, exit, reuse,
   signature invalidity, file replacement or any ambiguity refuses.
6. **Dispose.** Close the pinned descriptor and control pipes and reap the
   owned helper. Success requires a valid final frame and clean helper exit.
   Cancellation, malformed/out-of-order/replayed commands, overlap, stdin EOF,
   helper death, output overflow and cleanup failure burn the operation.

Before dispatch, failure is a refusal. Once dispatch might have begun, failure
is an uncertain request outcome even if a reply was received. The UI cannot
claim confirmed focus or retry the request. Native observation and parent checks
are successive samples, not an atomic OS-wide snapshot; preserve the existing
guarding against topology changes between samples.

## Proposed private helper protocol 2

This is an integration contract for a later implementation. Protocol 1 and the
current `probe()` API remain unchanged. Do not make the stateless API secretly
cache peer data. Introduce an explicit per-connection session/verifier API with
owned disposal in the request transport.

Use private stdin/stdout JSON-lines with strict keys and integer sequence values:

Implementation: parent commands use only canonical `protocol`, `seq`, `op`
serialization without whitespace, rejecting duplicate/escaped keys. `finish`
closes control stdin; the helper refuses trailing bytes before its final frame.
Helper replies use strict bounded JSON with duplicate-key rejection. Native
failures use fixed `unavailable`; the watchdog can exit without a frame.

| Direction | Frame |
| --- | --- |
| Helper startup | `{protocol:2, seq:0, state:"captured", peer:PeerImage}` |
| Parent | `{protocol:2, seq:1, op:"check"}` |
| Helper | `{protocol:2, seq:1, state:"checked", peer:PeerImage}` |
| Parent, only after parsed reply | `{protocol:2, seq:2, op:"finish"}` |
| Helper, then exit | `{protocol:2, seq:2, state:"finished", peer:PeerImage, socketToken:"matched"\|"unavailable"}` |
| Parent cancellation | `{protocol:2, seq:<next>, op:"dispose"}`, then exit without a grant |

`PeerImage` contains exactly `pid`, `uid`, `pidVersion`, `startSeconds`,
`startMicros`, `executable`, `cdHash`, with the existing v1 field constraints.
There is no nested v1 protocol field and no raw audit token. The fixture model
reuses v1 schema normalization only to compare fake identity fields; it is not
an implementation of this proposed wire format. Every successful frame contains
fresh observations, never a saved positive verdict.

Failure emits one fixed `{protocol:2, seq:<current>, state:"refused", reason:...}`
frame with an enum reason (`identity`, `expired`, `sequence`, `unavailable` or
`cancelled`) and exits nonzero. No exception text or supplied values appear.
Unknown fields/protocols, duplicate keys, invalid UTF-8, missing LF, additional
frames, sequence errors and unsupported operations refuse. Bound each parent
command to 256 bytes and total helper output to 8192 bytes. Bound stderr without
forwarding it. Only fixed commands exist; no generic sender or process query.

The helper audits fd3 only; it never reads or writes App request/reply bytes.
Passing the Socket to `spawn` pauses Node's reader. The existing one-shot
adapter restores flow after helper exit, which would deadlock this persistent
design. The future bridge must restore an originally flowing reader on the
validated **capture-ready** frame and on every failure/teardown path, while
preserving an explicitly paused caller. Install reply listeners before dispatch;
one owner parses the App stream. Fixture coverage demonstrates this timing.

## Deadlines and press handling

The total request limit remains at most 1000 ms, starting before helper spawn
and including all captures, checks, request/reply and finalization. Preserve the
sender's enclosing delivery deadline too: command discovery, status, topology
and the focus RPC share that budget rather than each renewing it. Each helper
operation is bounded by the lesser of 500 ms and the remaining total budget.
Expiry at the deadline is failure. Neither callback arrival nor a reply resets
the clock. Parent monotonic checks surround every asynchronous step and dispatch.
The helper uses an independent continuous monotonic clock/watchdog, starting
before capture with a hard maximum 1000 ms lifetime; the parent's earlier
deadline can only shorten it. Suspend/resume must not extend the lease.

The controller's existing 350 ms arming delay is a separate pre-dispatch
constraint: the press must occur after that delay. It is not a 350 ms deadline
for the helper. The authority also expires a press at 1000 ms and checks it
before dispatch and after the reply. Helper work must not extend either rule;
if preflight cannot finish while that permit is valid, refuse before writing.
Read-only status/selection feedback does not arm input. Finalization must finish
within the original request/press budgets and cannot re-arm a press, grant
contextual input, or turn a plain request into verified focus.

On timeout/cancel, close the Socket and control pipes and terminate/reap only
the helper created for that operation; never signal an App/core peer. Helper
stdin EOF also disposes its state. The fixture model measures a silent 500 ms
step timeout; injected clocks test the 1000 ms boundary. It does not measure
real App latency or implement the proposed native watchdog. These budgets need
separately authorized calibration before support can be claimed.

## Evidence and remaining integration gates

| Fixture | Evidence | Limit |
| --- | --- | --- |
| JS lease model | Fresh image checks, unavailable post-close token, expiry, rebinding, cancellation, overlap, replay, parser bounds and uncertain outcomes | Injected evidence; no production verifier grant |
| Signed Swift self-process | Post-close retained-token queries, deadline refusal, pinned FD under caller reuse, same-PID self-exec rejection | Own process only; no App, other-process access or actual PID reuse |
| Persistent Node helper | Resume at readiness and receive reply before helper exits; preserve paused reader | FD fstat only, no native peer verification |
| Distribution audit | Fixture marker rejected from production JavaScript and archives | Does not approve a production build record |

Before any future App run:

1. Review/implement the native session protocol and parent transport lifecycle,
   helper integrity pinning, strict framing, owned cleanup, reader restoration,
   deadlines and all refusals. Extend contract tests against that actual bridge;
   the test-only model cannot substitute for those tests.
2. Keep the original `AppPeerVerifier`, consent/topology/permit/write protections
   and no-retry behavior. All read-only RPCs needing peer verification must use
   the same session discipline. Keep production records/capabilities empty.
3. Rebuild/sign the helper for both architectures; prepare a new exact-version
   test artifact manifest. The previous helper hash cannot approve changed code.
4. Obtain separate current authorization for a fresh isolated App/core run.
   Recheck the reviewed source's no-delegation property and verify the original
   blocker, cleanup, settings fingerprints, deadlines and request-only semantics.
   Do not reuse historical permission or silently resume calibration.

Production build approval, actual focus/Zoom read-back, provider mapping, window
calibration, contextual input, upstream contact and mod installation are separate
work. Nothing in these fixtures changes their gates.

[guest-keys]: https://developer.apple.com/documentation/security/guest-attribute-dictionary-keys
[sec-code]: https://github.com/apple-oss-distributions/Security/blob/db15acbe6a7f257a859ad9a3bb86097bfe0679d9/OSX/libsecurity_codesigning/lib/SecCode.h
[xnu-exec]: https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/kern_exec.c#L7095-L7106
[xnu-proc]: https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/proc_info.c#L2187-L2194
