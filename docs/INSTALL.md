# Install and set up

Use the audited macOS beta ZIP supplied by the maintainer. It targets a 15-key
Stream Deck MK.2. Independent fresh-account installation and Intel execution
still need release validation.

1. Extract the ZIP and open `com.kotl3r.deckshep.streamDeckPlugin`.
2. Accept the bundled **Rex** profile, which uses the new DeckShep
   identity. Choose Rex on the deck. Older preview profiles are not converted;
   follow [the identity-reset instructions](IDENTITY.md) first.
3. Select a key in Stream Deck to open its setup panel. Open Rex and enable
   Remote Control there if it is not already enabled.
4. Click **Enable visible-pane checks** explicitly. The helper temporarily copies
   the pane ID and restores clipboard formats; status discovery does not use it.
5. In each Codex session, show the session ID in your own footer. Run
   `/statusline session-id model-with-reasoning` in Codex, adding any other
   items you want after those two. DeckShep never changes your status line.
   Then select a ready Codex agent on the deck and click **Check selected Codex
   agent**. The check only reads the pane and Codex.

Without the session ID in the footer, Codex agents in Rex still support
selection, Zoom, and question/approval navigation and answers. Model, Effort,
Reviewer, Mode, Interrupt, Stop terminals, prompt staging, Send, Steer and Queue
stay inactive, and the affected keys show **No footer ID**.

For an already configured Rex/Codex session these are the five setup actions.
Initial terminal installation, Remote Control, macOS permissions and selecting a
ready agent are prerequisites; the five-action target still needs an independent
fresh-account walkthrough.

Herdr is not part of the first release. A source build with
`experimental.herdr: true` in `config.json` adds its profile. There, choose
**Herdr**, select a private session socket in the panel,
and explicitly enable thread-ID title matching after `/title thread-id` in each
Codex pane. See [Herdr](HERDR.md). Herdr submissions require the keyboard.

For Claude, the panel offers **Preview changes**, the exact before/after settings,
**Apply with backup**, **Undo last change**, and removal preview. Removal also clears private Claude lifecycle records; undo restores settings and waits for fresh lifecycle reports. DeckShep
never changes your Claude status line. If an older setup chained DeckShep's
status line, the panel also shows **Restore your original status line**, which
puts yours back and keeps the hooks. Enable Claude native controls only after hook
setup; both are off initially. The stable `configure-claude.js` CLI remains
available; see [Claude](CLAUDE.md).

## Upgrading a customized DeckShep installation

This procedure applies only to installations already using `com.kotl3r.deckshep`.
For the older `com.local.rexagents` private preview, use [IDENTITY.md](IDENTITY.md)
to recreate profiles and remove/reapply integrations explicitly.

Use the one-time backup/migration helper included in the beta ZIP. It requires
Node 22.13+ and keeps private backups outside the checkout and plugin directory.
Fresh installs still use one plugin file.

1. Quit **Stream Deck**. Leave Rex, Herdr and all existing agents running.
2. From the extracted ZIP directory, run `node scripts/migrate-upgrade.mjs backup`.
   Keep the printed backup directory. The helper checks ownership, rejects links
   and refuses an incomplete or changing snapshot.
3. Open `com.kotl3r.deckshep.streamDeckPlugin` to upgrade. Quit Stream Deck again
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
durable integration setup records cause a refusal for manual reconciliation.
Fresh lifecycle reports from running Claude hooks are retained, and stale
runtime locks are never restored. Global SDK/agent settings are never rewritten by the
migration. Do not share backup directories: they contain private customizations.

The built-checkout fallback `node scripts/install.mjs` also retains the previous
stopped-app backup/merge installation; multiple MK.2 devices require
`--device-uuid`. Build/package commands never invoke either upgrade path.

## Diagnose

The panel's checklist reports the current backend and selected agent. The safe
CLI report is `node <installed-plugin>/bin/doctor.js` (or add `--json`). It contains
no prompts, settings contents or home paths. It does not grant consent or change
agent settings. [Uninstall](UNINSTALL.md) explains integration removal.

The experimental [Herdr App preview](HERDR-APP.md) has its own home selection,
default-off plain-focus-request consent and App-only checklist. Use
`node <installed-plugin>/bin/doctor.js --herdr-app --json` for passive reporting
without Rex/TUI discovery or an App connection. Production App build records
remain empty, so consent cannot activate its controls in this checkpoint.
