# Beta release procedure

Root `package.json` is the version authority. `npm run version:sync -- X.Y.Z`
updates manifest/plugin/lockfile versions; `npm run version:check` checks identity.
Use SemVer `vX.Y.Z-beta.N` tags. Existing display names and UUIDs remain unchanged.

From a clean source commit:

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run deps
npm run test:coverage
npm run test:bundled
npm run package -- --tag v1.3.4-beta.1 --require-clean
node scripts/package.mjs --verify dist/agent-switchboard-1.3.4-beta.1-macos.zip
```

Packaging builds/signs a universal helper, validates through Elgato, packs the
installer and profiles, audits every nested archive, and verifies identity,
defaults, provenance and complete checksums. ZIP64 entries from Elgato are parsed
with bounded sizes and CRC checks. Private files, symlinks, duplicate/traversing
names and build home/workspace paths are refused. Nothing installs or uploads.

CI on macos-14 runs the same checks and uploads a verified artifact. A beta tag
runs the release workflow, which creates a **draft prerelease only**. Review all
physical/native gates and owner decisions before any publication. No tag, push,
remote release or branch-protection change is part of local implementation.

Without signing secrets the helper is ad-hoc signed. Optional Developer ID uses
`APPLE_CERTIFICATE_P12` (base64), `APPLE_CERTIFICATE_PASSWORD` and
`APPLE_SIGN_IDENTITY`. Optional notarization additionally needs `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Signing material lives in an
ephemeral runner keychain and is removed afterward. Standalone CLI binaries do
not receive a stapled app ticket; verify the downloaded artifact on a clean Mac.

The owner must configure main to require the CI check and one review, with squash
or rebase merges. A successful remote workflow and draft-release dry run cannot
be asserted until these workflows are pushed and run. Keep the current repository
visibility and resolve the project license/OpenAI artwork before public release.

`npm run dev` is an explicit developer command: it watches source, builds, links
the built plugin and restarts only `com.local.rexagents`. Never use it as a test
shortcut against an active development installation.
