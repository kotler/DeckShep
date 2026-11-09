# Private Herdr App live-session preview

This private preview supports App-reported status, selecting a local pane and
Next pane. It accepts only the reviewed signed App 0.1.14 build and the pinned
peer helper. It has no calendar cutoff. Normal production build
records remain empty. Do not publish the private installer.

The installed release walkthrough passed on 2026-11-08: the owner reported both
pane selections and Next worked on the physical deck. With plain-focus consent
off, Next made no change and the UI displayed Consent off. See the
[validation record](validation/2026-11-08-herdr-app-release-calibration.md).

## Use the installed preview

1. Keep your ordinary Herdr App running. No disposable test launcher is needed.
2. Select the Herdr App profile on Stream Deck. Its App home must explicitly
   select the desired instance; the current setup already points to the normal
   App home and discovers two local panes.
3. Explicitly check **Allow plain focus requests** to use pane selection/Next.
   The final guard test left this unchecked. Fresh configurations remain off.
4. Wait at least half a second after appearing/changing context before pressing.
   Select a pane or press Next. The feedback says **Focus requested**; it does
   not establish keyboard focus. Never retry a request reported as uncertain.
5. Uncheck the consent to stop requests. Local banks and Collapse remain local.

Zoom, terminal reads, typing, provider controls, clipboard access, hooks and mods
are unavailable through this path. App-reported agent/status labels are not a
verified provider identity or App/core terminal binding. The installed core
candidate was calibrated separately; the live session's core version was not
queried.

## Refusals and recovery

Unknown/changed App builds, a replaced peer/socket, unsupported topology,
overlays, revoked consent and stale presses refuse. The App
home and socket must both be owner-owned, non-symlink and owner-only. The owner
approved tightening the current pair to 0700; a recreated socket may need the
same deliberate setup again. The preview does not silently change permissions.

The Applications directory itself was not changed. The narrow runtime exception
accepts only the canonical root/admin system container with the reviewed mode
and no positive ACL grants; all bundle files and other ancestors remain guarded.
Do not broaden system-folder permissions to make a refusal disappear.

The official plugin restart command may report success before a new plugin
process actually starts. During this walkthrough the old process persisted;
quitting and reopening Stream Deck loaded the clean verified preview. No Herdr
restart was required. Back up customized installation state before reinstalling
an ordinary package, following [the upgrade procedure](INSTALL.md#upgrading-a-customized-deckshep-installation).
The private preparation folder records the absence of a calendar cutoff, exact hashes and the installation
backup location in PREVIEW.json/INSTALLED.json. Original endpoint modes were
recorded separately in the earlier private preparation folder.

## Rebuild privately

After the separate signed release suite passes for the exact staged candidate:

```sh
node --import tsx tests/live/app-calibration/prepare-release-preview.mjs \
  <private-candidate-folder> <passing-release-report.json> --owner-approved
```

This prepares and validates only local artifacts; it installs, restarts and
uploads nothing. The flag acknowledges owner approval obtained outside the
script. The distribution audit deliberately rejects its test factory marker.
