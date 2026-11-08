# Herdr App preview

Herdr App remains an experimental preview. **No production App build is approved**,
so discovery and focus requests stay inactive even when consent is enabled.
Default builds still contain the existing Rex/Herdr profiles and v2 preferences;
the App profile requires the explicitly enabled experimental build flag.

The intended first-release scope is App-reported pane status and plain focus
requests through selection/Next, with local banks and Collapse. Requests do not
verify OS or keyboard focus and never authorize typing. Zoom, contextual input
and provider controls remain disabled. The repository's
`docs/plans/HERDR-APP-PLAN.md` records the implementation and promotion gates.

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

- **App reported** describes pane status/model information, not a verified
  Codex chat or Claude process identity.
- **Focus requested / Not verified** means the request was acknowledged.
  It does not claim the pane received the keyboard.
- **Deck selected** marks the local selection used by Next. An acknowledged
  request can leave the App's model selection unchanged.
- **Focus uncertain** means the request may have been dispatched. There is no
  retry or automatic undo.
- Closed slots send nothing; Collapse removes them locally. Banks only change
  the displayed group. Unsupported per-key input overrides stay inactive.

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
content. Actual App validation remains pending and needs separate authorization
for isolated, test-owned processes; fixture/browser results do not approve a build.
