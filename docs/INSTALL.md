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

Use the one-time backup/migration helper included in the beta ZIP. It requires
Node 22.13+ and keeps private backups outside the checkout and plugin directory.
Fresh installs still use one plugin file.

1. Quit **Stream Deck**. Leave Rex, Herdr and all existing agents running.
2. From the extracted ZIP directory, run `node scripts/migrate-upgrade.mjs backup`.
   Keep the printed backup directory. The helper checks ownership, rejects links
   and refuses an incomplete or changing snapshot.
3. Open `com.local.rexagents.streamDeckPlugin` to upgrade. Quit Stream Deck again
   before restoring customizations.
4. Run `node scripts/migrate-upgrade.mjs restore "<backup-directory>"` to preview,
   then repeat with `--apply`. Expand the printed `~/` to your home directory when
   supplying it as a quoted argument. The helper verifies backup integrity and
   destination, merges your config into the new defaults, restores Claude setup
   records at their stable paths and restores exact saved profile file bytes.
   It keeps the new runtime and any newly added profiles. A second external
   backup captures the installation immediately before restore.
5. Reopen Stream Deck and verify your existing keys and preferences. Keep both
   backups until verified. Never delete setup records while hooks are installed.

Native installer preservation of plugin-folder state is not assumed. Changed
integration records cause a refusal for manual reconciliation, rather than
replacement of newer state. Global SDK/agent settings are never rewritten by the
migration. Do not share backup directories: they contain private customizations.

The built-checkout fallback `node scripts/install.mjs` also retains the previous
stopped-app backup/merge installation; multiple MK.2 devices require
`--device-uuid`. Build/package commands never invoke either upgrade path.

## Diagnose

The panel's checklist reports the current backend and selected agent. The safe
CLI report is `node <installed-plugin>/bin/doctor.js` (or add `--json`). It contains
no prompts, settings contents or home paths. It does not grant consent or change
agent settings. [Uninstall](UNINSTALL.md) explains integration removal.
