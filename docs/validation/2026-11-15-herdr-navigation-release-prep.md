# Herdr App navigation release preparation — 1.5.0

Prepared November 15, 2026 on `codex/herdr-app-navigation`. This is a local
candidate record. Publication and exact-version owner launch approval were pending at initial
preparation; the subsequent owner direction is recorded below.

## Scope

The candidate packages Rex and Herdr App navigation. Herdr App provides agent
tiles, Next, Page, Collapse and Attention, using separate default-off focus
consent, verified publisher/peer/helper checks and the existing request guards.
Signed App updates need no marketing-version pin. The third row defaults to
blank. Saved provider/input opt-ins grant no runtime capability. Herdr TUI
remains source-only. No mod is installed. See
[ADR 0008](../adr/0008-herdr-app-navigation-release.md).

Rex controls, persisted IDs and consent defaults are preserved. The temporary-home
upgrade regression adds the App profile while preserving customized Rex keys,
config and hook records. Test-only Model/mod experiments and their dev dependency
stay outside the shipped bundle. Package audits reject their fixture marker.

## Verification performed

- Focused navigation, setup, preferences and distribution regressions passed all
  69 tests. After review, the transport/focus/lifecycle/controller run passed all
  82 tests, including ACL and hard-link regressions for 0600/0700/0755 sockets.
  The new 0600/0700 ACL cases failed before the fix and passed after it.
- Final coverage run passed 772 tests, with four intentional live-test skips and
  zero failures across 776 tests. Lines/statements 95.79%, functions 92.22%,
  branches 88.22%. All existing thresholds were preserved.
- Typecheck, lint, formatting, dependency boundaries, unused-code scan, version
  identity and generated compatibility checks passed.
- Synthetic Playwright virtual-deck suite passed all 61 tests. App assertions
  cover blank/inert provider keys, App selection following and preserved Page
  browsing. No golden JSON, normalized SVG baselines or PNG baselines changed.
- Universal arm64/x86_64 build completed. Compilation does not establish Intel
  execution support.
- Full npm dependency audit returned zero vulnerabilities.
- Bundled golden regression suite passed all four tests. Marketplace media
  generation and validation passed.
- Universal installer passed Elgato validation/packing and nested archive audits,
  including helper executable modes, identities, fresh defaults, both profiles,
  fixture exclusion and checksums.
- `npm run release:check` correctly remains blocked by exact-version owner
  launch review. The prior 1.4.0 approval was not carried into 1.5.0.

`origin/main` was fetched during preparation. It remained the branch’s existing
base, with no intervening upstream commits. During the initial preparation, no push, merge, tag or publication
was performed.

## Review closure

The independent Standards and Spec reviews have no open findings. Both detected
the App-home ACL bypass, and Standards also found local paths in five older
review records. The guard and privacy fixes are covered in the
[review record](../plans/reviews/herdr-app-navigation/release-review.md).
Commit conventions pass against the fetched main branch. Unrelated pre-existing
root scratch reports are preserved outside the release commit set; a clean
temporary checkout is used for candidate packaging.

## Native evidence and remaining launch review

This preparation did not run live tests or operate installed terminal/agent
instances. The prior authorized [App 0.1.16 / Core 0.1.21 run](2026-11-15-herdr-app-0.1.16-core-0.1.21.md)
passed lifecycle calibration, request acknowledgements, stale-target refusal,
restart/reconnect, ownership, cleanup and settings checks. The full live virtual
deck failed its foreground-editor assertion three times with Chrome frontmost.
Its activation cause remains unresolved. The navigation-only UI change has not
been rerun natively. No complete native navigation or hardware pass is claimed.

The separate Model experiment and late-input characterization do not grant any
released input capability. Physical navigation/profile switching, minimized and
dialog behavior, clean-Mac installation and Intel execution retain their checks
in [the beta checklist](../BETA-CHECKLIST.md). Resolve or explicitly review the
background-focus failure before signing exact-version launch approval.

## Local artifacts

The local candidate is `dist/deckshep-1.5.0-beta.1-macos.zip`, with its adjacent
`.sha256`, `SHA256SUMS` and `BUILD-INFO.json`. The build metadata records the
actual commit and dirty state. This is a private-review artifact; packaging
performs no installation or upload. Final checksum verification uses
`node scripts/package.mjs --verify <candidate-zip>`.

## Subsequent dependency integration and installed Rex regression

The owner subsequently requested merging navigation into main and all five
Dependabot updates. The isolated integration branch includes PR #15 Knip 6.45.1,
#16 Prettier 3.10.0, #17 ws 8.22.2, #18 TypeScript ESLint 8.72.2 and #19 Rollup
4.68.2. Overlapping manifests and lock records were resolved by retaining 1.5.0,
Herdr test dependencies and the semantic union of the five original updates.
Both independent review axes found no remaining dependency findings.

A clean install returned zero vulnerabilities. The combined changes passed the
772-test coverage run (four skipped), all 61 synthetic Playwright tests, four
bundled golden tests, lint, formatting, typecheck, dependency boundaries, Knip,
version/compatibility checks, commit conventions, universal build, Marketplace
media checks and audited private-review packaging. Coverage and all golden,
normalized SVG and PNG baselines were unchanged.

The owner also requested a quick regression against installed Rex. The installed
application reports App version 0.1.0/build 1973 and CLI
0.1.0-preview.19, commit `ad5a836cb95bf1685a2b2976762949c44f1d0828`, built
2026-11-13. The baseline owned-server smoke passed, then the extended smoke
passed against the same installed executable. Diagnostics reported API revision
14, minimum 0. The test verified private listener/PID ownership, disposable
session/terminal creation, foreground process, marker send/capture, VT content
and cursor, program-status reads, owned cleanup and unchanged settings hashes.

The run used only a newly owned foreground server, private socket/home/state,
and a disposable cat process. Providers, inference, browser state tests and hooks
were disabled. It operated no existing Rex session or agent and makes no GUI,
physical Stream Deck or native Codex/Claude control claim. The Herdr native
background-editor assertion remains open; publication approval is recorded below.

## Owner publication authorization

After requesting all Dependabot changes be merged and the installed Rex smoke,
the owner directed: “after the merge tag and publish a release”. This records
approval to publish the prepared navigation-only 1.5.0 beta. The planned tag is
`v1.5.0-beta.1`. `release/readiness.json` records the current exact version and
November 15 review date, with this file as evidence. The earlier 1.4.0 approval
was not reused.

The owner had been shown the candidate, passing repository/browser/package
checks and the unresolved Herdr background-editor assertion. That assertion
stays failed and agent input stays deferred. This authorization supplies no
additional native, hardware, clean-Mac or Intel test result. All golden and e2e
baselines remain unchanged. No Marketplace submission is authorized here.

GitHub private vulnerability reporting was enabled and its API state verified
as enabled before publication, satisfying the existing owner publication task.
The release workflow builds a draft from the exact tag. The downloaded archive,
provenance and checksums must be verified before publishing that draft.
