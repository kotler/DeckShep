# Installed Herdr release: preparation and remaining isolation gate

Original checkpoint: static preparation complete, 2026-11-08. The implemented
checkpoint at the end and the linked calibration record supersede the remaining
gates described in this original design. The owner accepted the next
recommended step: stage private installed-release copies and review updater
isolation. No release App/core execution is authorized or performed by this
checkpoint. Production records/capabilities remain empty. See the
[artifact evidence](../validation/2026-11-08-herdr-app-installed-release-artifacts.md).

## Exact candidate, not the running pair

Static metadata identifies App 0.1.14 and core 0.1.19. The default App settings
had no explicit core override. Read-only discovery across known install locations
and the current process PATH found one canonical core bundle through four aliases.
No candidate was executed for `--version`, no login shell was started, and no
existing App/core socket, process environment or PID was queried. This does not
establish which core the developer's running App currently uses.

Both complete bundles are copied with their original bytes and executable modes,
including Info.plist and signature resources. Native signatures and the exact
publisher requirement are verified before and after copying. The core's signed
bundle must remain intact; do not flatten its executable into a bare `herdr-core`
file and assume it retains the same signing context.

`release-artifacts.cjs` under `tests/live/app-calibration/` accepts only trusted,
stable files, rejects links/hardlinks/shared-write inputs and writes into a new
private directory. Its `release-candidate.json` is inspection evidence, with
`nativeExecution:false`, `approvedForLiveRun:false`, `productionApproved:false`
and `runningPairEstablished:false`. It deliberately writes no `manifest.json`;
the existing source-only live harness rejects it. It neither re-signs originals
nor derives a production allowlist entry from observed hashes.

The earlier source-built pair was App 0.1.14/core 0.1.18. Core 0.1.19 is pinned
for source review at `06793ede1bedb1fed8d22d3cae476d3eb239edf0`. Version association
plus a publisher signature is not proof of a reproducible binary-to-source match.
Treat release updater capability conservatively; a bundle shape or version string
does not establish that its compile-time release flag is off.

## Source review findings

App source pin remains `2405bf388c568c3ed479f05b8e405ccfa44b3f2c`:

| Surface | Reviewed behavior | Consequence for release calibration |
| --- | --- | --- |
| App updater | Checks after roughly ten seconds, then periodically; stages `.download.noindex`, `.new.noindex`, `.new.json.noindex` and `.old.noindex` beside its canonical bundle | Private HOME alone does not relocate these writes; the executable and all siblings need a private writable parent |
| Startup/apply | Inspects staged payloads, may execute them for version checks, swap bundles and spawn a relaunch | No staged payload/receipt may be inherited; deny unplanned execution/swaps before launch |
| Relaunch | The explicit expected-version path directly execs; ordinary macOS relaunch uses `open`/LaunchServices | Direct initial launch does not guarantee a later relaunch retains isolated HOME or avoids the installed App |
| Core update | Calls the selected core's `update --json`; an App `.updated` marker can initiate it after startup | Pin only the private core, keep the marker absent and prevent updater actions; metadata-only checks are insufficient |
| CLI maintenance | Writes/repairs a `herdr-app` symlink under HOME | Use an empty private HOME and verify its link never escapes the private App |
| Notes/media | Release metadata follows `HERDR_RELEASES_URL`, but notes can fetch their own media URLs | A loopback release feed is not complete network containment |
| Core selection | Can consult App settings, PATH, usual locations and a login shell; may install missing core | Require explicit private settings/PATH/core dirs, prestart the owned core and abort rather than install/fallback |

These findings come from [App updater][app-update], [notes/media][app-notes],
[core selection/update][app-core] and [CLI link][app-link]. They are source-derived
behavior expectations, not observed execution of the installed release.

Core 0.1.19 review:

- `paths.rs` and `platform/macos_launchd.rs` are byte-identical to the prior
  0.1.18 source pin. The parent-PID-scoped `HC_LAUNCHD_DIRECT` mechanism still
  removes its override before spawning later children. Native ownership proof
  remains mandatory; identical source does not substitute for a new run.
- OpenRPC schema differs only in its version field. This supports reusing the
  schema fixtures, not assuming native protocol/selection behavior passed.
- `cli/update.rs` and `platform/macos_bundle.rs` are unchanged. Updating can swap
  the selected executable/bundle, migrate aliases and request `server.restart`
  through the selected endpoint. Set private HOME, XDG/runtime, HC_SESSION,
  HC_SOCKET and HC_INSTALL_DIR; never point them at an installed core.
- `platform/unix.rs` changes PTY IO cancellation and adds boot identity/private
  file support. Cleanup/descendant behavior needs renewed native validation.
- Core release metadata also follows `HERDR_RELEASES_URL`. A non-default release
  origin enables its local-test verification path. Independent publisher/signature
  checks must stay strict; the loopback override cannot establish release trust.

See [launchd][core-launchd], [core updater][core-update], [bundle handling][core-bundle],
[release fetch][core-releases], [release verification][core-platform] and
[Unix/PTY behavior][core-unix].

## Required containment before a runnable release manifest

A release runner must enforce these conditions; the current source-only runner
has not implemented or established them:

1. **Filesystem and process boundary.** Stage whole signed bundles under a short
   mode-0700 run root with private sibling update locations. Deny writes outside
   that root, process adoption, launchd handoff and LaunchServices relaunch. A
   policy must preserve needed macOS graphics/signature services without allowing
   updater children to escape the root. Validate the policy against test fixtures
   before any release executable runs. A copied bundle by itself is insufficient.
2. **Owned, bounded release feed.** Use a parent-owned random loopback port with
   only the exact current-version App/core metadata endpoints. Serve no newer
   versions, target download URLs, tarballs or executable payloads. Refuse unknown
   routes, redirects and extra requests. Enforce outbound network restrictions
   independently, including media endpoints; never inherit proxy/auth settings.
3. **Fresh state and pinned core.** Use the existing private environment/owned
   process/settings-fingerprint helpers, no user config, explicit private core
   settings and HERDR_CORE_DIRS, and HC_INSTALL_DIR inside the root. Keep update
   markers, stages, receipts and agent credentials absent. No CLI version probe,
   installer or updater may run against installed files or existing endpoints.
4. **Identity and failure handling.** Pin bundle trees, plists, executable hashes,
   publisher requirements and helper hash before launch. Retain the original
   per-connection peer token and all request/topology/consent/press checks. Any
   unexpected update child, identity/file change, network escape attempt or lost
   ancestry aborts; do not adopt a replacement PID or retry an uncertain mutation.
5. **Evidence and cleanup.** Record only counts/fixed labels/hashes and request
   timings. Prove every owned descendant and socket is gone, compare tracked
   global settings and original installation fingerprints, and retain failure
   evidence if cleanup cannot be proved. A later fresh native run needs separate
   current owner authorization for the concrete policy/artifacts.

Actual update behavior is a separate later scenario with reviewed payloads and
its own bounded mutation plan. The first release calibration must neither fetch
nor apply an update. Do not disable existing peer/build checks to make it pass.

## Hand-back

The installed artifacts are ready for inspection. Next implement and fixture-test
the containment policy and release-runner manifest, then present the exact
candidate/policy for live authorization. No normal Herdr App preview is enabled
by this preparation. The source-build hardware success remains valid for its
original test scope; it does not approve these different release bytes/core.

[app-update]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/update.rs
[app-notes]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/update_notes.rs
[app-core]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/core_bin.rs
[app-link]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/core_bin/cli_link.rs
[core-launchd]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/platform/macos_launchd.rs
[core-update]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/cli/update.rs
[core-bundle]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/platform/macos_bundle.rs
[core-releases]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/releases.rs
[core-platform]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/platform/mod.rs
[core-unix]: https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/platform/unix.rs

## Implemented checkpoint (2026-11-08)

The separate release runner and synthetic boundary probe now implement and test
the containment policy above. The signed release matrix passed; see the
[calibration record](../validation/2026-11-08-herdr-app-release-calibration.md).
GUI registration is permitted while LaunchServices launching (`lsopen`) and
Apple-event sending remain denied. A strict compiled cat-only SHELL shim avoids
Herdr's implicit login shell without changing either signed Herdr bundle.

The private preview is installed, with production records still empty. The owner
approved the separately tested root/admin-only Applications exception and private
App-home/socket permissions. The live physical focus walkthrough and revoked-
consent refusal then passed as recorded by the owner and SDK UI. This is limited
private request-only validation; infer no broader existing-session permission,
verified keyboard focus, provider identity or public capability approval.
