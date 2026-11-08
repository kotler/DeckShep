# Install and set up

Use the audited macOS beta ZIP supplied by the maintainer. It targets a 15-key
Stream Deck MK.2. Independent fresh-account installation and Intel execution
still need release validation.

1. Extract the ZIP and open `com.local.rexagents.streamDeckPlugin`.
2. Accept the bundled **Rex Agents** and **Herdr Agents** profiles. Existing fixed
   profile IDs and key ActionIDs are reused. Choose Rex Agents on the deck.
3. Select a key in Stream Deck to open its setup panel. Open Rex and enable
   Remote Control there if it is not already enabled.
4. Click **Enable visible-pane checks** explicitly. The helper temporarily copies
   the pane ID and restores clipboard formats; status discovery does not use it.
5. Select a ready Codex agent on the deck and click **Set up selected Codex agent**.
   This configures its session-ID footer without submitting a prompt.

For an already configured Rex/Codex session these are the five setup actions.
Initial terminal installation, Remote Control, macOS permissions and selecting a
ready agent are prerequisites; the five-action target still needs an independent
fresh-account walkthrough.

For Herdr, choose **Herdr Agents**, select a private session socket in the panel,
and explicitly enable thread-ID title matching after `/title thread-id` in each
Codex pane. See [Herdr](HERDR.md). Herdr submissions require the keyboard.

For Claude, the panel offers **Preview changes**, the exact before/after settings,
**Apply with backup**, **Undo last change**, and removal preview. Removal also clears private Claude lifecycle records; undo restores settings and waits for fresh lifecycle reports. Status-line
chaining is a separate choice. Enable Claude native controls only after hook
setup; both are off initially. The stable `configure-claude.js` CLI remains
available; see [Claude](CLAUDE.md).

## Upgrading a customized 1.3.4 installation

Native Stream Deck installer preservation of plugin-folder config/state has not
been verified. Do not assume it preserves customized prompts or integration
records. The Node recovery installer retains the previous guarded backup/merge
behavior: quit Stream Deck, run `node scripts/install.mjs` from a built checkout,
then reopen Stream Deck. It backs up profiles and the previous plugin outside the
checkout before mutation, preserves existing profile bytes and Claude records,
merges config defaults, and adds only missing profiles. Multiple MK.2 devices
require `--device-uuid`.

Keep that external backup until the upgrade is verified. Do not delete Claude
setup records while its hooks are installed. A new install normally uses only
the single plugin file; the recovery installer is an explicit upgrade fallback.

## Diagnose

The panel's checklist reports the current backend and selected agent. The safe
CLI report is `node <installed-plugin>/bin/doctor.js` (or add `--json`). It contains
no prompts, settings contents or home paths. It does not grant consent or change
agent settings. [Uninstall](UNINSTALL.md) explains integration removal.
