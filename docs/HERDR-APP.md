# Herdr App navigation

DeckShep 1.5.0 adds the **Herdr App** profile alongside Rex. It lists local Codex
and Claude agents reported by Herdr and provides agent selection, Next, Page,
Collapse and Attention. Agent input controls are deferred. The bottom row is
blank, including Model; saved provider overrides remain inactive.

With focus consent enabled, DeckShep verifies the connected process against
Herdr’s Developer ID and checks the current pane focus command before sending
one request. Signed App updates are accepted without a version pin. A request
acknowledgement and Herdr’s reported selection do not verify OS keyboard focus.
See [the release decision](adr/0008-herdr-app-navigation-release.md).

## Profile setup

In the Herdr App profile, open any key's setup panel:

1. Choose the absolute App home for the intended instance. Relative paths and
   `~` are refused. This setting stays with the App profile.
2. **Allow plain focus requests** is a separate opt-in, off on fresh installs
   and migrations, including older v3 stores. Read-back, input, Claude, Rex and
   Herdr TUI consents do not enable it. Turning it off invalidates a pending
   request immediately.
3. Review the checklist. A missing helper, unverified App signature or missing consent
   leaves requests disabled. Consent alone cannot approve a build.

Herdr can recreate `herdr-app.sock` with mode `0755` on restart. DeckShep
accepts that socket when you own it, it has a single link, and its parent
directory is yours with mode `0700` and no macOS ACL. DeckShep checks the
replacement on the next poll. You can leave the socket permissions as created.

The peer helper ships inside DeckShep at `bin/herdr-app-peer`. Setup does not
install executable code into Herdr, clone a layout, restart an app or change
hooks. Removing DeckShep removes its helper; see [Uninstall](UNINSTALL.md).

## Reading the deck

- Each bank shows up to five agent tiles in stable slot order. Like Rex, each tile shows the
  chat title when Herdr supplies a pane name, then the space folder name and agent status.
  An unnamed pane shows its provider. **Deck only**
  selects locally. With focus requests enabled and available, tapping an agent asks Herdr to select its pane. The dot
  marks Herdr’s reported selection. Your local choice determines the following
  Next and Attention destinations until Herdr reports a selection change.
- Row two holds **Next agent**, **Page**, **Collapse**, an empty key and
  **Attention**. Next visits agents across banks. Page changes banks locally.
  Next shows the following destination immediately after a successful press.
  A destination that closed before the press leaves a gap and gets no request.
  This includes a terminal that returns to a shell while Herdr still lists its previous provider.
  Collapse clears closed slots. Attention visits another waiting agent first,
  then an errored agent, then a finished agent. Ties follow tile order.
- After a successful press, Attention shows the next eligible agent or clears. Rapid Next and Page taps
  during the 350 ms arming interval are ignored. The dot follows the latest
  validated App selection, including the one read just before the request.
  **Focus uncertain** means a write may have reached Herdr.
  DeckShep sends each request once. **Press again** asks you to check the
  newly displayed destination.
- The optional Core readback shows a separate terminal count in setup.
  Agent names and status on the keys come from the App.
- A changed App selection reveals its bank once. Later Page browsing stays
  where you put it. The selection dot follows Herdr’s report while the App is in
  the background. Navigation sends no agent keystrokes.
- Model, Effort, Permissions, Mode, Interrupt and question controls are reserved
  for a later release. Use the agent’s keyboard for those actions.

## Doctor

The App profile's **Refresh status** checklist reports its own home/consent,
packaged helper, navigation signature policy and last App peer/build match.
It does not run Rex/TUI discovery or provider setup.

For passive App-only CLI reporting from a built or installed plugin:

```sh
node <installed-plugin>/bin/doctor.js --herdr-app --json
```

The CLI checks only the plugin's helper and navigation signature policy. It does
not connect to an App and leaves profile-specific home and consent unknown;
view those in the selected App profile's setup panel. Reports omit local paths
and terminal content.

Native lifecycle calibration passed on signed App 0.1.16 / Core 0.1.21, including
restart, stale-target refusal and cleanup. The live virtual-deck test failed its
background-editor assertion with Chrome frontmost. The activation cause remains
unresolved. This release preparation does not claim a passing hardware or full
native end-to-end run. See [the exact validation record](validation/2026-11-15-herdr-app-0.1.16-core-0.1.21.md).
