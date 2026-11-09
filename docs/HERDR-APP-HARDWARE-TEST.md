# Herdr App hardware test build

This private build targets the reviewed source App 0.1.14/core 0.1.18 pair and a
15-key Stream Deck MK.2. It enables **Herdr App** with a test-only backend.
Normal builds retain zero approved App records/capabilities. The production
bundle audit rejects this test installer; do not publish it as a release.

The installer uses the existing DeckShep UUID and replaces a same-identity
installation. First quit Stream Deck and follow the
[customized-installation backup procedure](INSTALL.md#upgrading-a-customized-deckshep-installation).
Installer preservation of customized plugin-folder state is not established.
Artifact preparation installs/restarts nothing.

## Hardware walkthrough

Keep the prepared test folder in place: its private paths are pinned into the
test plugin. It contains the installer, `launch.cjs`, reviewed source artifacts
and `HARDWARE-TEST.json`. Do not open its App bundle directly; the launcher
supplies the isolated environment and proves ownership.

1. Back up and install `com.kotl3r.deckshep.streamDeckPlugin` from the test folder.
   Select **Herdr App**. Leave Rex/Herdr profiles and agent integrations alone.
2. In Terminal, start the launcher for the currently authorized hardware test:

   ```sh
   ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only ASW_LIVE_HERDR_APP=1 \
   node <test-folder>/launch.cjs
   ```

   It starts new private App/core copies, checks the source pair, creates two
   disposable `/bin/cat` panes and runs request-only calibration. It prints
   **Test App ready** and holds only that owned session for up to ten minutes.
   It never adopts an installed App or existing terminal.
3. Open a Herdr App key's setup panel. Set App home to
   `<test-folder>/session/app` explicitly; profile preferences do not inherit
   the build's home default. Enable **Allow plain focus requests** yourself and refresh
   status. Consent remains off in the prepared config. Read-back, input and
   Claude consent are not needed.
4. Confirm two local pane tiles appear. Select each, wait for the arming delay,
   and try selection/Next. Visually check the private App displays the intended
   pane. Check local banks/Collapse; revoke request consent and confirm presses
   refuse. Record actual physical-deck behavior: model feedback does not prove
   keyboard focus.
5. Press **Enter in the launcher's Terminal** before closing its App window.
   It revokes the lease, stops only its proven owned processes and reports
   cleanup/settings results. Requests become unavailable when its heartbeat
   stops. Never retry a request reported as uncertain.

Only status/model selection and plain focus requests are supported. Zoom,
typing, provider controls, clipboard checks, hooks and Herdr mod installation
remain disabled. To leave this build, reinstall the ordinary audited plugin and
follow backup/restore for customizations. Retain the test folder if cleanup
fails; failure preserves evidence rather than deleting unknown processes.

## Rebuilding

After a universal ordinary build and a passing, separately authorized calibration
for the exact helper/artifacts:

```sh
node --import tsx tests/live/app-calibration/prepare-hardware.mjs \
  <private-artifact-directory> <passing-calibration-report.json>
```

Preparation executes no App/core and changes no production records. It validates
the manifest/calibration/helper hashes, stages private copies, bundles the
test-only factory/launcher, checks owner home/workspace paths and validates/packs
locally. The launcher refuses without live authorization flags and in CI. Its
lease pins the exact App PID/version/start/path/signature and needs a fresh
ownership heartbeat. Observed hashes never become production approval records.
