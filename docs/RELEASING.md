# Release preparation and packaging

Root `package.json` is the version authority. `npm run version:sync -- X.Y.Z`
updates manifest/plugin/lockfile versions; `npm run version:check` checks identity.
The new DeckShep plugin, action, profile and key UUIDs stay fixed after the
prelaunch reset. See [IDENTITY.md](IDENTITY.md) for older-preview transition and
exact hook removal; never import old setup records into the new folder.

## Local beta verification

From a clean source commit, using Node 22.13+ and macOS Command Line Tools:

```sh
npm run release:prepare -- --tag v1.5.0-beta.2
```

The driver requires clean tracked source and an explicit matching tag; unrelated
untracked notes are excluded. It checks out the exact HEAD in an owned detached
worktree, runs `npm ci`, source privacy, lint, formatting, types, layer rules,
Knip, version/compatibility checks, Marketplace media checks, coverage, bundled
tests, virtual-deck Playwright tests, dependency audit, a universal build and
clean packaging. Install the locked browser once with `npm run e2e:install`;
a missing browser fails preparation. Each failure stops subsequent stages.
Live tests always refuse because this driver's child environment sets `CI=true`.
It never installs the plugin, restarts Stream Deck, tags, pushes or uploads.

Successful candidates appear under `dist/release-candidates/<tag>/` with the
ZIP, adjacent `.sha256`, `SHA256SUMS` and `verification.json`. Existing candidate
directories are preserved. The receipt contains relative artifact names, hashes,
exact commit/tag and successful checks; it is written only after verification
and owned-worktree cleanup. It does not claim native, hardware or account tests.

For an existing or downloaded candidate, supply the independently expected
source commit and tag (and optionally the independently expected outer hash):

```sh
npm run release:verify -- dist/deckshep-1.5.0-beta.1-macos.zip \
  --tag v1.5.0-beta.1 --commit <full-40-character-source-commit> --release
```

Keep its adjacent `.sha256`. Verification checks the outer digest, complete
inner checksums, archive/default/identity/privacy audits, exact clean provenance,
helper executable modes, each arm64/x86_64 slice separately, helper signatures
and the packaged peer helper's SHA-256 pin in `plugin.js`. It extracts only
helpers to a private temporary directory for inspection and never executes them.
Ad-hoc signature validity does not establish publisher identity. An adjacent
checksum establishes integrity, not authenticity; compare `--sha256` with a
trusted independent value when available. Verification prints its receipt JSON.
Use the verifier from the matching source tag when auditing historical payloads.

The default packaging path is `private-review`, with `vX.Y.Z-beta.N` tags only.
It builds a universal helper, validates through Elgato, packs the installer and
profiles, audits nested archives and verifies identity, defaults, provenance and
complete checksums. ZIP64 entries use bounded sizes and CRC checks. Private files,
symlinks, duplicate/traversing names and build home/workspace paths are refused.
The ZIP and installer include Apache-2.0, NOTICE, reserved-branding and third-party
notices. Nothing installs or uploads. Universal output does not prove Intel execution.

## Reviewed public distributions

`npm run release:check` must pass against exact-version evidence in
`release/readiness.json`; see [RELEASE-READINESS.md](RELEASE-READINESS.md). The evidence includes signed-out access to the public Issues tracker.
Never mark records verified just to make a release job pass.

Once reviewed, `npm run package -- --release --tag v1.5.0 --require-clean` is the
stable path. `--release` always requires clean provenance, even without
`--require-clean`. Reviewed betas may also use it. `BUILD-INFO.json` records
`public-release` or `private-review`; legacy beta provenance without that field
is treated as private review. Verify historical payloads with the verifier from
their matching source tag because archive allowlists are version-specific.
This classification describes the packaging path, not legal clearance.

Prefer `release:prepare -- --release --tag <reviewed-tag>` for the complete
local sequence. Both paths retain the exact-version readiness gate; the driver
never marks readiness approved. The release workflow also runs deep verification
before creating its draft and attaches `verification.json` for inspection.

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
