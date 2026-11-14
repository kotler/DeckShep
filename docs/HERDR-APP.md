# Herdr App preview

The experimental App profile lists local Codex and Claude agents reported by
Herdr. A validated App connection enables deck-local navigation. The private Stream Deck
preview accepts signed Herdr App updates without a version pin. With focus
consent enabled, it verifies the connected process against Herdr’s Developer ID
and checks the current pane focus command before dispatch. Release packages
include only Rex.

## Profile setup

In an experimental App profile, open any key's setup panel:

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
  marks Herdr’s reported selection. **On deck** marks your local choice until
  Herdr reports a selection change.
- Row two holds **Next agent**, **Page**, **Collapse**, an empty key and
  **Attention**. Next visits agents across banks. Page changes banks locally.
  Next shows the following destination immediately after a successful press.
  A destination that closed before the press leaves a gap and gets no request.
  This includes a terminal that returns to a shell while Herdr still lists its previous provider.
  Collapse clears closed slots. Attention visits another waiting agent first,
  then an errored agent, then a finished agent. Ties follow tile order.
- The **On deck** marker sits above the title. After a successful press,
  Attention shows the next eligible agent or clears. Rapid Next and Page taps
  during the 350 ms arming interval are ignored. The dot follows the latest
  validated App selection, including the one read just before the request.
  **Focus uncertain** means a write may have reached Herdr.
  DeckShep sends each request once. **Press again** asks you to check the
  newly displayed destination.
- The optional Core readback shows a separate terminal count in setup.
  Agent names and status on the keys come from the App.
- Row three follows Herdr’s reported selection independently of **On deck**.
  A ready Codex pane shows an informational **Model** key in column one. Its
  compact cue gives the stable slot number and chat name, with Codex as the
  fallback. A new App selection reveals its bank once; later Page browsing
  stays where you put it. The cue remains visible when the target is off-bank.
  Working, blocked, shell, closed or unreadable targets clear this face.
- Model is informational and sends no input. Current App/Core interfaces do
  not establish the recipient guarantees required for a setting change.
  No current model value is claimed from App titles. Effort, Permissions and
  saved provider overrides remain inactive, including former opt-ins. Choose
  **Position default** to restore the informational Model position or a
  navigation assignment. See the [delivery evaluation](plans/herdr-app-agent-controls/delivery_evaluation.md).

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
