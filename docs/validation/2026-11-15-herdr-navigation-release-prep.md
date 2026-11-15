# Herdr App navigation release preparation — 1.5.0

Prepared November 15, 2026 on `codex/herdr-app-navigation`. This is a local
candidate record. Publication and exact-version owner launch approval remain
pending in `release/readiness.json`.

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
  69 tests.
- Full coverage run passed 770 tests, with four intentional live-test skips and
  zero failures across 774 tests. Lines/statements 95.79%, functions 92.22%,
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
base, with no intervening upstream commits. No push, merge, tag or publication
was performed.

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
