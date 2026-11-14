# Herdr App preview

The experimental App profile lists local Codex and Claude agents reported by
Herdr. A validated App connection enables deck-local navigation. Plain focus
requests additionally require an approved App build and explicit consent. The
production build record list is empty. Release packages include only Rex.

## Profile setup

In an experimental App profile, open any key's setup panel:

1. Choose the absolute App home for the intended instance. Relative paths and
   `~` are refused. This setting stays with the App profile.
2. **Allow plain focus requests** is a separate opt-in, off on fresh installs
   and migrations, including older v3 stores. Read-back, input, Claude, Rex and
   Herdr TUI consents do not enable it. Turning it off invalidates a pending
   request immediately.
3. Review the checklist. A missing helper, unknown App build or missing consent
   leaves requests disabled. Consent alone cannot approve a build.

The peer helper ships inside DeckShep at `bin/herdr-app-peer`. Setup does not
install executable code into Herdr, clone a layout, restart an app or change
hooks. Removing DeckShep removes its helper; see [Uninstall](UNINSTALL.md).

## Reading the deck

- Each bank shows up to five agent tiles in stable slot order. **Deck only**
  selects locally. **Request only** offers a plain App focus request. The dot
  marks Herdr’s reported selection. **On deck** marks your local choice until
  Herdr reports a selection change.
- Row two holds **Next agent**, **Page**, **Collapse**, an empty key and
  **Attention**. Next visits agents across banks. Page changes banks locally.
  Collapse clears closed slots. Attention visits another waiting agent first,
  then an errored agent, then a finished agent. Ties follow tile order.
- On Attention and the locally selected tile, **Deck only** or **Request**
  above the destination shows what the next tap can do.
- **Focus requested** acknowledges the request. The dot follows the latest
  validated App selection, including the one read just before the request.
  **Focus uncertain** means a write may have reached Herdr.
  DeckShep sends each request once. **Press again** asks you to check the
  newly displayed destination.
- The optional Core readback shows a separate terminal count in setup.
  Agent names and status on the keys come from the App.
- On upgrade, Model, Effort and Permissions become inactive, including saved
  overrides and former opt-ins. The profile retains the saved preferences and
  actions. Choose **Position default** in the inspector to restore a key’s
  navigation assignment. Row three defaults to empty.

## Doctor

The App profile's **Refresh status** checklist reports its own home/consent,
packaged helper, available request-build records and last App peer/build match.
It does not run Rex/TUI discovery or provider setup.

For passive App-only CLI reporting from a built or installed plugin:

```sh
node <installed-plugin>/bin/doctor.js --herdr-app --json
```

The CLI checks only the plugin's helper and static build records. It does not
connect to an App and leaves profile-specific home/consent unknown; view those
in the selected App profile's setup panel. Reports omit local paths and terminal
content. [Isolated source-build calibration](validation/2026-11-08-herdr-app-peer-session.md)
has passed with the persistent helper. This does not approve production builds
or establish hardware/keyboard focus. The separate
[hardware test build](HERDR-APP-HARDWARE-TEST.md) accepts only a launcher-owned
private App/core session and explicit request consent.
