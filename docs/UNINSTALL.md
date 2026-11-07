# Uninstalling Agent Switchboard

You can remove the deck controller while leaving Rex, Herdr, Codex and their existing agents/daemon running. These steps describe removal; they do not stop agents, delete chats or change sandbox/approval policy.

## Remove optional Claude hooks first

If you applied the optional Claude metadata integration, [remove its hooks and restore its status line](CLAUDE.md#remove-the-optional-integration-first) before removing the plugin files. This step is unnecessary for 1.2.1 or if you never applied Claude setup. Keep the setup record/backups until cleanup succeeds.

## Remove the plugin and profile

1. If you might reinstall, export your customized **Rex Agents** and **Herdr Agents** profiles using Stream Deck's profile controls. Save a copy of the installed plugin's `config.json` and `state/` folder if you need custom aliases/prompts or the original Codex setup records. The plugin folder is:

   ```text
   ~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.local.rexagents.sdPlugin/
   ```

2. In **Stream Deck → Preferences → Plugins**, find **Rex Agents**, right-click it and choose **Uninstall**, then confirm in Stream Deck. This removes Agent Switchboard for both Rex and Herdr. See [Elgato's uninstall guide](https://help.elgato.com/hc/en-us/articles/11434818801293-Elgato-Stream-Deck-How-to-Uninstall-Stream-Deck-Plugins).
3. Switch to another deck profile. In Stream Deck's profile management, remove the **Rex Agents** and/or **Herdr Agents** profiles you imported/generated, after saving it if desired. If you copied Rex Agent Key actions into other profiles, remove those keys there too. Plugin removal and profile removal are separate steps; deleting a profile alone does not uninstall the plugin.
4. Reopen Stream Deck if needed and confirm Rex Agents is absent from Plugins and its actions are no longer in your chosen profiles. Leave terminal apps and agents running.

## Manual fallback for either installation method

If Stream Deck cannot uninstall the plugin, **quit Stream Deck completely**, including its menu-bar app. In Finder, use **Go → Go to Folder** (Command+Shift+G) to open:

```text
~/Library/Application Support/com.elgato.StreamDeck/Plugins/
```

Move **only** `com.local.rexagents.sdPlugin` to the Trash. This also removes the installed helper, disk configuration and plugin-local `state/` records. Reopen Stream Deck and remove the unused profile/actions as above. Do not remove the entire Plugins or ProfilesV3 folder; those contain your other integrations and profiles. Keeping the folder in Trash allows recovery.

This fallback applies to both the downloaded installer and `python3 install.py`. No separate background service or launch agent is installed by this project. The helper runs on demand as part of the plugin; there is no separate daemon to uninstall.

## Settings that can remain

Removing the plugin does not restore settings you deliberately changed in Codex while using it, such as Model, Effort, Reviewer or Plan/Default. Use Codex's native controls to choose the values you want. The plugin never changes sandbox or approval policy as part of uninstall.

Some setup choices live outside the plugin:

- **Rex footer:** selected-agent setup saves a native status line containing the session ID and model. It can remain harmlessly after uninstall. To restore your preferred footer, use Codex's native `/statusline` picker. A saved copy of `state/daemon-controls.json` records the original status-line command for each configured process, when available.
- **Native presets from earlier setup:** if you used preset-based setup, `state/native-presets.json` records managed slots and their exact inputs. Back up Codex configuration before optional cleanup. Remove a preset only when its current slot and input still match that record; a changed entry may be yours. Do not delete all presets or the whole Codex configuration. Modern Model/Effort/Reviewer controls use the existing daemon; old saved presets are not a separately running component.
- **Herdr title:** `/title thread-id` is a native session-only display choice. Use Codex's native `/title` controls to choose your preferred display if desired. Removing the deck integration does not require stopping the Herdr session or changing its hooks/socket configuration.
- **Stream Deck shared preferences:** Stream Deck may retain plugin preferences independently of its installed files, so reinstalling can restore previous choices. Do not delete Stream Deck's global settings to clear one plugin. Check consent and controller preferences again on reinstall.

Do not delete `~/.codex`, chats, transcripts, authentication, hooks or the existing daemon to uninstall Agent Switchboard. Rex Remote Control can remain enabled for your other tools; turning it off is optional and can affect those tools.

## Optional development-file cleanup

The source installer keeps private backups under `~/Library/Application Support/AgentSwitchboard/backups/`. Older checkouts may also have a `backups/` directory. Build products are under `dist/`, and dependency folders are under the plugin's and tools' `node_modules/` directories. These are not removed by Stream Deck. Keep backups until you no longer need rollback or original setup records; move unwanted files to Trash when ready. Remove the checkout itself only after no active work needs that folder. None of this is required to disable the controller.
