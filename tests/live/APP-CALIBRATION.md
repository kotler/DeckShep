# Herdr App source-build calibration

The harness is implemented and tested with fixtures. The first authorized native
attempt is [blocked before focus](../../docs/validation/2026-11-08-herdr-app-native-calibration.md):
App peer proof is unavailable after its one-shot reply connection closes.
Building this harness grants no permission to run it. Production
`APP_FOCUS_RECORDS` and App capabilities remain empty. The runner never changes them.

## What this run can establish

The first native run tests the isolation recipe in
[ADR 0007](../../docs/adr/0007-herdr-app-0.1.14-source-review.md), then exercises
the real `GuardedAppFocusSender` with an explicitly supplied test-only build record.
It creates two local spaces, each running only `/bin/cat`, and sends one plain
focus request per pane. It records acknowledgements and App-model selection
separately. Even a passing result has `productionApproved:false` and
`verifiedFocus:false`.

The suite checks future/stale/reused presses and revoked consent, and measures
request preflight through acknowledgement. It waits the controller's 350 ms arming
interval before issuing each request; controller arming itself is covered by the
controller fixtures. Delivery keeps the production 1,000 ms total budget; setup
exchanges have 3,000 ms and socket readiness has 10,000 ms. Timed-out mutations are
never retried or compensated. A dispatched request without a trustworthy reply
is recorded as uncertain.

This is not release-build validation, App/core terminal identity binding, native
keyboard ownership, multi-window/screen validation, minimized/full-screen/dialog
behavior, Zoom, provider input or physical Stream Deck verification. Reconnect,
endpoint replacement and signature/version changes have fixture refusal coverage;
native restart/reconnect still needs a later scenario. A source build cannot
approve an installed release with different bytes or updater behavior.

## Artifact preparation, before requesting a native run

Prepare source builds from exactly these reviewed sources:

- App `2405bf388c568c3ed479f05b8e405ccfa44b3f2c`, version/build 0.1.14.
- Core `3965a46caae095a3ead01de237fa13955e52b8c6`, version 0.1.18.

The App must be built **without** compile-time `HERDR_APP_RELEASE`; do not use a
downloaded or installed release. Do not set `HERDR_RELEASES_URL` when building or
running. Review and retain the source/build provenance separately before native
authorization. The manifest's `source-no-updater` is a builder attestation, not
proof that the harness can derive from binary bytes. Source provenance and this
attestation require human review; a version string alone establishes neither.

In a canonical, owned mode-0700 directory, stage these exact names:

```text
manifest.json
Herdr.app/Contents/Info.plist
Herdr.app/Contents/MacOS/Herdr
Herdr.app/...                     other required bundle resources
herdr-core
herdr-app-peer
```

Use the packaged peer helper from an explicitly built DeckShep distribution.
Both App and core must have valid code signatures, including ad-hoc signatures
for source builds. The App plist must identify `dev.herdr.app`/`Herdr` with both
versions `0.1.14`. The helper is pinned by its SHA-256. Prepare a separate manifest
for the signing CDHashes of the architecture being tested. Nothing here installs
a bundle, registers an app, or alters the installed App/core.

Copy [the manifest template](app-calibration/manifest.example.json) and replace
every `PENDING` value with reviewed artifact evidence. The template deliberately
fails validation. SHA-256 values hash the exact signed executable/plist/helper
bytes; CDHashes identify the selected architecture's signed App/core code.
`appTreeSha256` is the SHA-256 of JSON containing the deterministic tree inventory
`[relativePath, fileSha256]` pairs. The offline `treeFiles`, `treeHash` and `hash`
functions exported by `app-calibration/artifacts.cjs` calculate this exact format;
load them with Node's `--import tsx`. They inspect only the supplied directory and
do not launch an executable. They do not generate approval records.

Artifacts reject links, hard links, special files, shared writable files,
untrusted ownership, unexpected manifest fields, changed hashes and oversized
trees. The runner copies the checked artifacts into its own fresh private root;
it never executes the source copy or an inferred binary from PATH.

## Native invocation: separate authorization required

After current explicit permission for the reviewed artifacts and the disposable
GUI run, use only this test file. These flags acknowledge permission obtained
outside the runner; setting them does not grant permission to a coding agent.

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only ASW_LIVE_HERDR_APP=1 \
ASW_HERDR_APP_ARTIFACTS=<absolute-private-artifact-directory> \
node --import tsx --test tests/live/herdr-app.test.js
```

Do not substitute `npm test` or `npm run test:live` with these flags: those commands
also discover the independently authorized TUI/provider suites. No provider
account, credential, daemon, model or existing terminal is needed for this test.
CI always refuses this run. Without the flags it skips before artifact access,
process inspection, settings reads, native helper use or socket creation.

## Isolation and cleanup

The runner uses `isolatedEnvironment`, `OwnedProcesses` and `settingsHashes`.
Its environment inherits no PATH, routing/auth/hooks, proxies, update overrides,
`NODE_OPTIONS` or `DYLD_*`. HOME, App home, XDG config/state/cache/runtime, core
session/socket/holder namespace and credentials directories are private. The
chosen core is pinned in both App settings and `HERDR_CORE_DIRS`; there is no
production binary-search fallback. Umask is 0077 during the run and restored.

Core starts directly with `serve` and `HC_LAUNCHD_DIRECT=<harness PID>` only on
that launch. Its socket must serve the owned child before App launch. App starts
by its private executable, never LaunchServices, `open -a`, a URL or the normal
CLI. Any preexisting App endpoint aborts before launch/raise handoff.

Socket paths, owner/mode and identities are checked before connecting. Kernel
peer proof requires a connection: the helper inspects the connected descriptor
before the first request byte, and again after replies. Serving PIDs must match
the exact children with stable start identity, executable path and CDHash; no
launchd adoption, status-PID inference or fallback occurs. Both endpoint paths
and process ownership are rechecked around requests. The production sender also
performs its existing peer/build/topology/permit checks. Any ambiguity refuses.

Cancellation and failures enter cleanup. Only proven owned processes and observed
descendants may be stopped. Descendant start identities are captured after core
and App startup, after each test-space creation, and before shutdown while their
parents are still owned. Unexpected parent exit makes cleanup unproven even if
the tracked PIDs later exit; the harness never adopts an orphan by its name or
reported socket. Settings fingerprints are compared even when a
scenario or cleanup fails. These existing fingerprints cover the global
Codex/Claude configuration/auth files, not every macOS preference store. A failed
or unproven launch/cleanup retains its private root and reports failure; it never
signals an unverified PID or deletes evidence first. SIGINT/SIGTERM trigger
bounded cleanup, but a forced kill or host shutdown cannot guarantee it completes.

The TAP diagnostic contains a structured report with build/helper hashes, source
pins, hashed core method/feature inventories, request timings/model-selection
booleans, fixed failure phases/check labels, elapsed times, byte counts and
cleanup/settings results. It omits local paths,
PIDs, core IDs, pane IDs, names, terminal output and raw exceptions. No report is
automatically written to the repository or promoted to production evidence.

## Fixture verification only

Ordinary unit/integration tests use synthetic artifacts and in-process private
sockets. Injected process and peer effects launch/inspect no native App/core and
read no real HOME. They cover the lifecycle and refusal paths, including changed
peers/files/endpoints, timeouts, uncertainty, cancellation, privacy and failed
cleanup. Native helper correctness has its separate self-owned Swift fixture.
