# Guarded Herdr App focus requests and peer/build verification

Date: 2026-11-08. Scope: Phase 2b under the approved H1/H4 focus-only amendment.
Implementation commit: `064e4df` on `codex/herdr-app-focus-requests`.
No Herdr App/core/agent was launched, contacted, focused or inspected. Live tests
remain disabled. Production capabilities, exact App request records and the
experimental-profile/default-consent behavior are unchanged.

## Request boundary

`AppFocusAuthority` issues a separate opaque request permit, incompatible with
provider/verified-focus permits. It captures the App space/tab/pane/local-terminal
tuple without inventing process/chat identity. It checks explicit request consent,
visibility/appearance, controller/backend/endpoint generations, page/stamp, setup
state, peer/record identity and the existing context arming timestamp. Presses
expire after 1,000 ms using a monotonic clock. Every attempt burns its permit;
the final write lease is separately single-use.

`GuardedAppFocusSender` requires an explicit App home. Before dispatch it checks
the exact reviewed `pane.focus` argument contract, refreshes status/list/status,
and requires the captured target to have one unchanged local mapping. Its only
mutation payload is `{do:'pane.focus',args:{pane:<captured ID>}}`. The generic
exchange method, transport connection, verifier and authority are runtime-private.
The existing read-only client still rejects every mutation. Existing provider,
verified-focus and legacy Rex/TUI delivery guards are untouched.

After all awaited peer/build checks, the sender rechecks consent/context, file
identity and socket identity synchronously and consumes the lease immediately
before its sole write. It checks peer/build identity again after the reply.
An exact `{ok:true}` reports `requested` with `verifiedFocus:false`, even if the
model selection has not changed. Pre-dispatch failures refuse; failures after
possible dispatch report uncertain completion. There is no retry, compensation,
window raise, Zoom, provider mutation, terminal read/input or generic `do` API.

## Peer and build evidence

The new unshipped Swift helper receives the caller's connected socket as
descriptor 3. It does not resolve/connect to a pathname or launch the App.
It reads `LOCAL_PEERTOKEN`, checks UID, resolves the executable using that audit
token, records PID version and microsecond process-start identity, and checks
dynamic signing validity around CDHash extraction. PID/start/executable facts
are checked again. The implementation uses the local macOS SDK's `sys/un.h`,
`sys/proc_info.h`, `libproc.h`, `bsm/libbsm.h` and Security `SecCode.h` contracts.
Link the helper with `-lbsm`; target macOS 13 or later.

The JavaScript adapter inherits only that descriptor, uses a minimal environment,
caps output at 8 KiB and its own helper lifetime at 500 ms, and sanitizes failures.
The verifier checks strict evidence schemas and repeat native observations around
build inspection. It hashes bounded executable/plist bytes from non-symlink,
safe-owner/non-writable components, verifies bundle ID/executable/version/build,
and requires exactly one record matching both SHA-256 values and the signed
code CDHash. File inode/mode/owner/size/time identity is checked again before use.
Unknown, changed, unsigned/unverifiable or ambiguous builds refuse. Raw native
paths, helper output and upstream errors do not reach logs or result objects.

`APP_FOCUS_RECORDS` is frozen and empty. No real App build has been approved or
verified. The helper is source-only and is not added to distribution/build/install
scripts; no production controller imports the sender or creates its consent state.

## Validation

- **24 new tests**: authority/permit safety; exact record/peer/build matching;
  guarded delivery; and native producer/descriptor adapter fixtures.
- Full `npm run test:coverage`: **223 tests; 221 passed, 2 disabled live groups
  skipped, 0 failed**. Thresholds and exclusions are unchanged.
- Coverage: lines/statements **95.17%**, functions **90.61%**, branches **86.80%**.
  Versus Phase 2a: −0.08, +0.69 and +0.22 percentage points respectively.
  The new type-only domain module is counted as unexecuted; no exemption was added.
- Refusal fixtures include changed PID version, UID, signature, files/build,
  duplicate/missing records, links/hardlinks/unsafe permissions, modified command
  contracts, remote/remapped targets, stale/hidden contexts, consent revocation,
  socket replacement, malformed/oversized/truncated/extra frames, cancellation,
  expired/replayed permits, overlapping requests and post-dispatch uncertainty.
- The signed native fixture creates a private socket and inspects only itself.
  The adapter fixture confirms inherited-descriptor transfer without socket
  bytes, environment isolation, bounded output, helper failure and cancellation.
  The real helper entry typechecks for arm64 and x86_64; no live App calibration
  is implied. An initial fixture link failure required the explicit `-lbsm` flag;
  macOS-added environment metadata is allowed while inherited caller settings
  are excluded. Corrected fixtures pass; no policy/guard was relaxed.
- Typecheck, lint, dependency boundaries, Knip, formatting, version and generated
  compatibility checks passed. Universal build and all four bundled golden
  groups passed. Existing golden files/baselines are unchanged; no browser smoke
  images were regenerated because no UI/profile behavior changed.
- `npm run package` built/validated/packed/audited the standard universal
  private-review distribution successfully. The new peer helper remains outside
  that distribution; no live capability or approved App record was added.

Local logs: `/private/tmp/deckshep-herdr-app-focus-{coverage,build,bundled,package}.log`.
Nothing is installed, published or pushed by these checks.

## Remaining promotion work

Package/identify the trusted helper and wire a dedicated request-only controller
and persisted explicit consent, preserving defaults and identities. Obtain
separate current authorization before any isolated native App calibration,
prove ownership/isolation and exact-build behavior, and only then consider an
App request record or production capability. Socket/code checks cannot prove
OS foreground, App/core correlation, keyboard ownership or focus completion.
Queued requests can outlive a timeout; no retry or input authority follows.
Zoom, contextual input and the optional mod remain disabled/deferred.
