# Beta release procedure

Release checkpoints are tagged on `main`. Herdr remains experimental; use a GitHub **prerelease**, retaining the repository's existing visibility. Public distribution still needs a license, artwork redistribution decisions, independent installation and signing/notarization work.

The 1.3.3 Claude preview is not ready for release: its live/physical validation gates in [CLAUDE.md](CLAUDE.md) are still open. The example tag below is for a local development package until those gates are reviewed.

## Verify and build

1. Review [compatibility](COMPATIBILITY.md), the [beta checklist](BETA-CHECKLIST.md) and [Herdr coverage](HERDR.md). Update release notes with the actual tested behavior and known limits. Keep plugin `package.json`, its lockfile and the four-part Stream Deck manifest version aligned.
2. Install the pinned dependencies and run checks:

   ```sh
   npm ci --prefix com.local.rexagents.sdPlugin
   npm ci --prefix tools
   npm test --prefix com.local.rexagents.sdPlugin
   python3 -m unittest discover -s tests -v
   ```

3. Commit the final source and documentation. From that clean commit, run:

   ```sh
   python3 package.py --tag v1.3.3-beta.1 --require-clean
   python3 package.py --verify dist/agent-switchboard-1.3.3-beta.1-macos.zip
   ```

The build compiles a universal helper, validates and packs with the pinned Elgato CLI, checks plugin/both-profile version agreement and pinned backend markers and safe default consent, and audits for local state and home/workspace paths. The ZIP contains installation/compatibility guides, notices, `BUILD-INFO.json` and `SHA256SUMS`. Its adjacent `.zip.sha256` covers the outer ZIP. Build information identifies the source commit; dirty builds are marked and cannot pass `--require-clean`.

## Tag and publish

Create an annotated `v1.3.3-beta.1` tag at the exact packaged commit, push `main` and the tag, then create a GitHub prerelease for that tag. Attach the versioned macOS ZIP and its `.zip.sha256` file. Prefer one complete bundle so installers and documentation cannot be mixed across versions. GitHub's automatic source archives are for developers.

Include these limits in the release description:

- Rex is the default; Herdr TUI 0.9.5 / protocol 22 is opt-in and needs thread-ID titles.
- Herdr Send, Steer, Queue and prompt staging are unavailable.
- Only the 15-key MK.2 layout and local Apple Silicon execution are tested; Intel execution and independent installation remain pending.
- The helper is ad-hoc signed, not notarized. No project license or public artwork redistribution permission has been established.

Verify the published tag points to the packaged commit, the release is marked prerelease, and both assets are present. Do not retag a published checkpoint; make a new beta tag for fixes. Packaging itself never uploads, installs or restarts anything.
