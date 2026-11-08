# Herdr App Phase 1 transport validation — 2026-11-08

Scope: read-only transport and synthetic fixtures after the owner authorized
continuation from Phase 0. No production controller/backend wiring, profile,
identity, preference, consent or native integration changed. No App, core,
provider, daemon or installed plugin was launched, connected to or modified.
The existing preview backend's input refusals remain intact.

## Implementation and evidence

- App client: passive home resolution; `ls`, `status` and `commands` only;
  one connection/request per read, matching the App control socket lifecycle.
- Core client: explicit socket path; generation-1 plain JSON-RPC hello with
  schema/method/feature checks; serialized list/get/status/passive screen reads.
  New versions/features can be inspected read-only after explicit reconnect;
  this is not a mutating version-verification record.
- Endpoint checks: reject symlinks throughout the path, non-sockets, wrong
  ownership, public socket/parent permissions and changed parent/socket identity.
  Recheck before writes and before accepting responses; do not chmod an endpoint
  or fall back to another one after a failure.
- Bounded byte buffers, fatal UTF-8 decoding, timeouts, abort/dispose handling,
  exact response IDs and sanitized errors. Disconnect/timeout never retries.
- Read-only request schemas also protect the lower-level writer. App actions,
  raise, terminal input/interrupt/send, attachment, caller attribution, remote
  target aliases and positive history reads cannot pass it. Incomplete or
  stitched/history screen results are refused without fallback.
- Synthetic schemas and fake-socket contracts cover malformed/error/ambiguous
  replies, Unicode fragmentation, oversized lines, endpoint replacement,
  reconnect/version/features changes, stale queued reads and resource cleanup.
  Remote records may be parsed as wire facts but never become local PID or
  input targets in these clients.

All network tests bind only private temporary fake sockets. The local sandbox
denied socket binding, so those fixture checks ran with sandbox escalation;
this did not authorize or enable native/live tests.

## Checks

Runtime: Node 26.13.0, within the repository's supported engine range.

| Check | Result |
| --- | --- |
| New schema/transport/lifecycle cases | 46 passed |
| Full `npm run test:coverage` suite | 175 tests: 173 passed, 2 disabled live tests skipped, 0 failed |
| Coverage | Lines/statements 95.12%; functions 89.41%; branches 85.84%; all existing gates passed |
| Lint, strict production/e2e typecheck, formatting | Passed |
| Dependency boundaries, knip | Passed |
| Version and generated compatibility checks | Passed |
| Universal build | Passed; existing upstream Zod comment-annotation warnings only |
| Bundled golden suite | 4 passed |
| Local private-review package and audits | Passed; nothing uploaded |

The first bundled run overlapped packaging's regeneration of `dist/` and failed
because the test config disappeared. Rerunning after packaging completed passed
all four bundled golden groups. Build/package and bundle checks must run
serially when they share `dist/`.

No golden JSON changed. No thresholds, exclusions, dependencies, lock files or
release claims changed. No browser download or native validation was performed.

## Remaining gates

Per-control verification and App preference/routing work are the next plan
phases. Production capabilities remain empty. Phase 0's App/core instance/build
binding, macOS peer-PID adapter, owned native startup, fresh focus/Zoom read-back
and delayed native-write questions remain open. An optional read-only mod is
the recommended read-back direction, pending the owner's choice and a concrete
reviewed design. No mod has been installed or maintainer contacted.
