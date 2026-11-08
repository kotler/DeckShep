# Release preparation and packaging

Root `package.json` is the version authority. `npm run version:sync -- X.Y.Z`
updates manifest/plugin/lockfile versions; `npm run version:check` checks identity.
Existing plugin, action, profile and key UUIDs and stable helper paths stay fixed.

## Local beta verification

From a clean source commit, using Node 22.13+ and macOS Command Line Tools:

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run deps
npm test
npm run test:coverage
npm run test:golden
npm run knip
npm run version:check
npm run compatibility:check
npm run test:bundled
npm run package -- --tag v1.4.0-beta.1 --require-clean
node scripts/package.mjs --verify dist/deckshep-1.4.0-beta.1-macos.zip
```

The default packaging path is `private-review`, with `vX.Y.Z-beta.N` tags only.
It builds a universal helper, validates through Elgato, packs the installer and
profiles, audits nested archives and verifies identity, defaults, provenance and
complete checksums. ZIP64 entries use bounded sizes and CRC checks. Private files,
symlinks, duplicate/traversing names and build home/workspace paths are refused.
The ZIP and installer include Apache-2.0, NOTICE, reserved-branding and third-party
notices. Nothing installs or uploads. Universal output does not prove Intel execution.

## Reviewed public distributions

`npm run release:check` must pass against exact-version evidence in
`release/readiness.json`; see [RELEASE-READINESS.md](RELEASE-READINESS.md). It is
expected to fail while launch validation and public support channels are pending.
Never mark records verified just to make a release job pass.

Once reviewed, `npm run package -- --release --tag v1.4.0 --require-clean` is the
stable path. `--release` always requires clean provenance, even without
`--require-clean`. Reviewed betas may also use it. `BUILD-INFO.json` records
`public-release` or `private-review`; legacy beta provenance without that field
is treated as private review. Verify historical payloads with the verifier from
their matching source tag because archive allowlists are version-specific.
This classification describes the packaging path, not legal clearance.

The release workflow always runs the readiness check and uses `--release`.
It creates **drafts only**: beta tags produce draft prereleases and stable tags
produce draft releases. Nothing automatically publishes. A remote workflow run,
branch protection or release dry run cannot be claimed before it actually runs.
Source is maintained in `kotler/DeckShep`; the owner controls repository
visibility and release timing. Local preparation does not authorize
pushing tags, creating remotes, merging, publishing or Marketplace submission.

## Signing and operator actions

Without secrets the helper is ad-hoc signed. Optional Developer ID uses
`APPLE_CERTIFICATE_P12` (base64), `APPLE_CERTIFICATE_PASSWORD` and
`APPLE_SIGN_IDENTITY`. Optional notarization also needs `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Signing material lives in an
ephemeral runner keychain and is removed afterward. Standalone CLI binaries do
not receive a stapled app ticket; check downloaded artifacts on a clean Mac.
Never commit signing material or account credentials.

The owner must review the beta scope, snapshot audit, support/privacy channels,
private vulnerability reporting and free Marketplace AI disclosure/eligibility
before publication. See [MARKETPLACE.md](MARKETPLACE.md) and [SUPPORT.md](SUPPORT.md).

`npm run dev` watches, builds, links and restarts this plugin UUID only. It is an
explicit developer operation, never an automated test shortcut against an active
installation. Do not run installers, setup or restart commands for verification.
