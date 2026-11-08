# DeckShep plugin identity

The owner approved a prelaunch identity reset on November 8, 2026. DeckShep uses
`com.kotl3r.deckshep`, under the owner's domain namespace. The product name is
DeckShep; the controller profile labels remain Rex and Herdr.

| Item | Current identity |
| --- | --- |
| Source and installed plugin folder | `com.kotl3r.deckshep.sdPlugin` |
| Installer | `com.kotl3r.deckshep.streamDeckPlugin` |
| Plugin UUID | `com.kotl3r.deckshep` |
| Action UUID | `com.kotl3r.deckshep.key` |
| Codex client name | `deckshep` |
| Recovery backups | `~/Library/Application Support/DeckShep/backups/` |

Profile and page UUIDs are UUID5 values calculated with the URL namespace and
`com.kotl3r.deckshep/profile/<backend>` or
`com.kotl3r.deckshep/page/<backend>`. Per-key ActionIDs use
`com.kotl3r.deckshep/<backend>/key/<index>`, including Rex. The values are fixed
in `scripts/profiles.mjs` and independently checked by identity tests. The
experimental Herdr App profile also has a new reserved identity and stays off.

## Moving from an older private preview

This is a new Stream Deck plugin identity, not an in-place upgrade of
`com.local.rexagents`. Old preview keys and profiles still reference the old
plugin. Their config, global preferences and consent are not imported implicitly.
The customization backup/restore helper in this build accepts the new identity
only; it cannot convert old profile bytes or integration setup records.

1. Preserve your old configuration, profiles and private backups before removing
   the preview. Do not share those files. Existing recovery folders under
   `~/Library/Application Support/AgentSwitchboard/backups/` are left untouched.
2. If Claude hooks were enabled, use the **old installed plugin's** removal
   preview and explicit apply, or its original `configure-claude.js --remove`
   preview/apply workflow. Keep the old plugin and setup record until removal
   succeeds. Remove only the exact registered commands; do not replace unrelated
   hooks or reset agent settings. Stop here for manual reconciliation if records
   are missing or user settings changed.
3. Remove the old preview plugin from Stream Deck and archive/remove its old
   profiles when ready. Leave Rex, Herdr and all agent processes running.
4. Install the new DeckShep installer and use its new Rex/Herdr profiles. Recreate
   customized keys using **DeckShep Key** rather than importing old action IDs.
   Review preferences and custom config manually, then explicitly enable each
   desired integration and consent option. Fresh consent and Claude controls stay
   off; no existing setup record is copied into the new plugin.

New Claude setup refuses a remaining old-preview hook or status-line command,
so it cannot silently add a second registration. Exact removal using the original
path is tested. The hook entry filenames remain `claude-hook.js` and
`configure-claude.js` inside the new plugin folder.

The clipboard helper and Claude settings writers retain their shared legacy
mutex filenames solely for cross-version exclusion. Renaming those locks would
allow old and new tools to race over the clipboard or the same settings file.
These are coordination locks, not plugin/profile identities.

## Later DeckShep upgrades

After this reset, freeze the new plugin/action/profile/page/key identities.
Same-identity upgrades retain the existing guarded backup/merge/restore paths
and v2/v1 settings codec. Never treat this one-time reset as permission to change
identity again, grant consent automatically, install software, rewrite real
settings or restart an existing agent for verification.
