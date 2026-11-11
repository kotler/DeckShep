# Uninstall

Before removing the plugin, open a key's setup panel and choose **Preview removal
of integrations**, review the exact changes, then **Apply with backup**. This
removes only this integration's exact Claude hooks and, for older setups that
chained one, restores your original status line if DeckShep's wrapper is still
there. Private Claude lifecycle records are removed after hooks are disabled. Unrelated hooks, permissions and settings remain.
**Undo last change** is available unless those files changed afterward.

If optional Codex hooks were installed, remove them before deleting the plugin:

```sh
node <installed-plugin>/configure-codex.js --remove
node <installed-plugin>/configure-codex.js --remove --apply
```

This revokes the private Codex setup epoch before removing only DeckShep's exact
hook commands. Other Codex hooks and config.toml remain unchanged. Keep the
private backups. The inspector's Claude removal flow does not remove Codex hooks.

Then remove DeckShep from Stream Deck and delete its profiles if wanted.
The App peer helper is inside DeckShep's plugin folder and is removed with it;
this focus-request path installs no Herdr mod or layout changes.
If a future optional Herdr App read-back mod is installed, remove it **before**
removing DeckShep too. It lives inside Herdr's App home and survives plugin
uninstall. Its removal preview must revoke read-back, remove only unchanged
manifest-owned code/state and the owned layout node, and preserve user edits
and backups. Repeat for every App home where it was installed. The proposed
mod and its removal/doctor support are not implemented yet; the current Claude
removal helper does not remove Herdr mods. Do not delete an entire mods folder
or overwrite a customized layout. See the [read-back design](plans/HERDR-APP-READBACK-DESIGN.md).

For an older preview with another plugin ID, use that preview's original removal
helper before deleting it; see [IDENTITY.md](IDENTITY.md).
Existing Rex, Herdr and agent processes are left alone. Keep external recovery
backups until satisfied; build/clean never deletes them.

If the inspector is unavailable, use the stable CLI:

```sh
node <installed-plugin>/configure-claude.js --remove
node <installed-plugin>/configure-claude.js --remove --apply
```

If setup records are missing or paths changed, remove only the exact plugin hook
commands from Claude settings manually; the helper refuses to guess ownership.
DeckShep no longer changes Codex status lines. Builds before the read-only
footer check could have changed them, and they recorded what they found:

- The original footer of each configured agent is in the plugin folder's
  `state/daemon-controls.json`, as `originalStatusLine` (for example
  `/statusline model-with-reasoning current-dir`). To restore it, type that
  command in the Codex session yourself. DeckShep does not automate this,
  since doing so would drive the status-line picker again.
- Those builds also used Codex preset slot 0 in `~/.codex/config.toml`
  (`[tui.presets]`) as scratch space. It is left untouched; delete that one
  entry yourself if you no longer want it.

Do not remove unrelated integrations or global Codex configuration.
