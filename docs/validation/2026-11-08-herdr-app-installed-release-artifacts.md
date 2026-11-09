# Installed Herdr release: static artifact preparation

Date: 2026-11-08. The owner accepted the recommended next step: inspect/stage
private copies of the installed App/core and review updater isolation. No Herdr
executable was launched, including `--version`; no running App/core socket or
PID was queried. No updater, installer, LaunchServices action or agent was started
by this work.

**Static preparation is complete; native release calibration is not enabled.**
The [isolation review](../plans/HERDR-APP-RELEASE-ISOLATION-DESIGN.md) records the
remaining containment/authorization gates. Source-build hardware evidence does
not approve these different signed release bytes.

## Installed files selected

| Component | Static version/build | Bundle ID | Signing CDHash, arm64 |
| --- | --- | --- | --- |
| App | 0.1.14 / 0.1.14 | `dev.herdr.app` | `f22abb5ca0b6f7bd2f1af1b7936e43bf3accb638` |
| Core candidate | 0.1.19 / 0.1.19 | `dev.herdr.core` | `9d9035a259e71307574780f56fde37c616b075ce` |

The App was found in system Applications. Its default settings had no explicit
core override. Read-only inspection of known install locations/current process
PATH found four aliases resolving to one canonical signed core bundle. No login
shell or candidate executable was run. This does not establish the build of the
core currently serving the developer's App; a running older core can coexist
with newer installed bytes. No real App configuration/layout was copied.

Initial strict codesign checks **inside the sandbox failed** with a signature
error. Repeating read-only verification outside the sandbox passed for both
bundles. The failure was sandbox-dependent; it is not retained as evidence of a
modified installation. Subsequent staging required strict deep verification plus
the exact bundle identifier, Apple generic anchor and publisher Team ID
`2W9652Q7QR`, on both originals and copies. Both passed. No file was re-signed or
patched, and no notarization/independent release provenance claim is made.

## Private candidate

`tests/live/app-calibration/release-artifacts.cjs` snapshots trusted bundle files,
verifies publisher evidence, copies whole bundles with executable modes intact,
rechecks the originals and copies, and emits a privacy-safe inspection report.
App has six files and core four. The helper is copied from the audited current
DeckShep universal build. Binary bytes, original installation and modes remained
stable throughout copying. Native signature verification reads files only.

[Sanitized evidence](2026-11-08-herdr-app-installed-release-artifacts.json) records:

| Evidence | SHA-256 |
| --- | --- |
| App executable | `000b5610f11b80faf4690d13d218cc4d04828e15a933af2db9eb9107a8700664` |
| App plist | `0f14f843b2106d3e23a9c47213d8175d018ffcd112c0e235319c6bfe94d9c07f` |
| App tree | `f5695ee239dd8ad0d2925556aaae4b856bd2619181d9fe6df41a7115516ca84f` |
| Core executable | `98b0653b40f22028eea6020b6bf3e39ff77e6012286437ca9f8efd24b7ecd758` |
| Core plist | `6067071d0de6481b6f21a88ec0548858323b213698c63616d62d7bc223f1942d` |
| Core tree | `a7027d84ca51d32ab2d00ac0644e8681f44412c6a90595cd195abc955ad39a6b` |
| Peer helper, protocol 2 | `358e58767c775833ee27af88e33485f7a3a06bac8c9b5b2801228f80e0058be5` |
| Candidate report | `2859c442efc4692f98a904588291188484d6f78af1e0d5d7e4516f0217a75696` |

Tree hashes use deterministic `[relativeFile, sha256, permissionMode]` inventories;
they are not the earlier source harness's two-field tree-hash format. Source
paths and original aliases stay outside repository/distribution evidence.
The private copy is inspection-only and not a distributable Herdr bundle.

The report has `buildMode:"installed-release-candidate"`, `candidateOnly:true`,
`nativeExecution:false`, `approvedForLiveRun:false`, `productionApproved:false`,
`verifiedFocus:false` and `runningPairEstablished:false`. There is deliberately
no `manifest.json`; the source-only calibration loader refuses this directory.
No exact-build approval record was generated.

## Updater/source review

App review remains pinned to `2405bf388c568c3ed479f05b8e405ccfa44b3f2c`.
Core 0.1.19's upstream tag resolves to
`06793ede1bedb1fed8d22d3cae476d3eb239edf0`, fetched into a new private source
checkout without building or executing it. Version-associated source review is
not proof of binary reproducibility.

Core paths, launchd ownership bypass, CLI update and macOS bundle-update handling
match the previous 0.1.18 source for the reviewed files. OpenRPC differs only in
its version field. Unix PTY cancellation, boot identity and private-file support
changed, so terminal/cleanup behavior still needs new native evidence.

The reviewed App updater stages beside its bundle, can run staged payloads,
swap/relaunch and invoke core update/restart. Ordinary macOS relaunch can use
LaunchServices. Media fetches are not all redirected by HERDR_RELEASES_URL.
Core's local-feed override also changes downloaded-bundle verification policy,
so independent publisher verification must remain strict. A private HOME and a
loopback metadata feed alone are insufficient containment.

Next implement and fixture-test the release runner's filesystem/process/network
boundary and bounded no-update feed, then obtain current authorization for the
concrete artifacts/policy. Installed/running services remain untouched. Production
App records/capabilities, source-only harness schema, consent defaults and plugin
installation remain unchanged. No live authorization is inferred from staging.

## Verification

Five staging fixtures passed: exact copies/modes and non-runnable manifest
boundary; invalid/wrong-publisher signatures; links/hardlinks/mutable inputs and
bad metadata; source/copy changes; and refusal to overwrite existing output.
They inject metadata/signature checks and inspect no real App/core or HOME.

The full isolated coverage suite passed: **286 tests, 283 passed, 3 live groups
skipped, 0 failures**. Source coverage remains 94.85% lines/statements, 90.42%
functions and 86.81% branches. Typecheck, lint, formatting, knip and diff checks
passed. No threshold/exclusion, golden snapshot or production source changed.
The small follow-up cleanup-error sanitization was rechecked with the staging
fixtures; it affects only failed private staging, not any runtime capability.
