# Installation and upgrades

For removal, see [Uninstalling Agent Switchboard](UNINSTALL.md), including downloaded/source installs, profile removal and optional native-setting cleanup.

## Before you start

- A Mac running macOS 13 or later and a 15-key Stream Deck MK.2. Apple Silicon is tested; the helper includes an Intel slice, but Intel execution is not yet verified.
- Stream Deck software. Version 7.6.1 was tested; see [compatibility](COMPATIBILITY.md) for the complete version record.
- Existing authenticated Codex CLI agents connected to their local daemon in Rex, or the experimental local Herdr TUI 0.9.5 integration.

Installing the plugin does not require restarting agents, Rex, Herdr or the Codex daemon. A plugin update may require restarting **Stream Deck only**. Native controls target verified chats; other agent types may appear for basic status without supported controls.

The helper is ad-hoc signed and not notarized. Fresh installation from the downloadable package has not yet been verified on an independent Mac. If macOS blocks the package/helper, stop and report the exact message; these instructions do not require weakening system security settings.

## Install the downloaded bundle

1. Download the versioned `agent-switchboard-…-macos.zip` asset from the intended [GitHub prerelease](https://github.com/kotler/agent-switchboard/releases). GitHub's Source code archives do not contain the ready-to-install plugin.
2. Extract the ZIP. Optionally verify its contents in Terminal from the extracted folder:

   ```sh
   shasum -a 256 -c SHA256SUMS
   ```

   Every entry should say OK. `BUILD-INFO.json` records the plugin version, source commit and whether the source tree was modified when packaged. The adjacent `.zip.sha256` release asset verifies the outer ZIP before extraction.
3. Open `com.local.rexagents.streamDeckPlugin` and follow Stream Deck's installation prompt.
4. For a **first install**, open `Rex Agents.streamDeckProfile`, import it and assign it to the MK.2. The profile name is shared by both controllers. For an **upgrade**, keep your existing profile and skip reimporting it.
5. Select a Rex Agent Key in Stream Deck's editor. Choose and configure the controller below. Press a live agent key to select it.

The generic imported profile still needs independent-machine validation. If it is not offered for your MK.2, use the source installer below to generate a profile bound to your device. Do not delete your other profiles.

## Rex setup

1. Enable **Remote Control** in Rex. Leave the existing agents running and ready.
2. In a key's settings, keep **Controller → Rex** and explicitly enable **visible-pane checks**. This is required for shared control routing.
3. Press a live agent key. If chat metadata is unavailable, use **Set up selected Codex agent** in the settings while that agent is ready. Let it finish without typing or clicking in Rex. Setup uses native settings dialogs to save a session-ID/model footer, preserves unsent input and sends no user prompt.
4. Verify the selected dot, chat label, model and effort before changing a setting. Start with a disposable chat when trying controls for the first time.

Visible-pane checks use Rex's `pane.copy_id` action. The helper snapshots the clipboard's available formats in memory, copies the pane ID and restores the saved data. Rex may show a copy notification, and clipboard-history software may retain the temporary ID. Clipboard restoration is not an OS-atomic operation. Consent stays off until you enable it; background discovery does not use the clipboard.

The Rex pane's reported directory must match the Codex chat directory. If using `codex -C PROJECT`, launch the Rex pane in that same directory. An empty chat may need a completed turn before the full settings snapshot is available. For multiple connected Rex app clients, set an explicit `clientLabel` in the advanced configuration.

## Herdr setup

Follow [Herdr → Setup](HERDR.md#setup). Choose the explicit local session socket, enable thread-ID title matching and run `/title thread-id` in each intended Codex pane with an empty composer. These settings are opt-in; missing or ambiguous identity disables native controls. Reapply the title and reselect after a new chat resets it.

Herdr's Prompts page says **Use Herdr keyboard**. Send, Steer, Queue and prompt staging are unavailable. Switching controller clears selection and pending actions while keeping each backend's saved preferences.

## Claude and mixed-agent preview

The 1.3.0 development branch adds optional Claude integration, with native controls disabled by default. See [Claude setup](CLAUDE.md) before enabling it. It requires a supported native Claude version and a separate local Node runtime for metadata hooks. The previously published 1.2.1 beta does not contain this preview.

## Upgrading and recovery

Before updating, use Stream Deck's profile export/backup controls to save any customized profile. The downloaded installer is handled by Stream Deck; the additional full filesystem backup described below belongs to the **source installer only**. Shared UI settings normally persist through updates. If you edited the installed `config.json` directly, save a copy before using the downloaded installer.

For a rollback, quit Stream Deck, restore your previously saved plugin/profile using the corresponding backup method, then reopen Stream Deck. Do not restart agents or the daemon. Keep backups private: they can contain custom prompts, aliases and other local settings.

If a key warns or asks for reselection, reselect the intended agent and inspect its native state. Do not repeatedly press a submission key after an uncertain result. Unknown Model/Effort often indicates an unverified chat, a directory mismatch, an empty chat or an unsupported version; [compatibility](COMPATIBILITY.md) and the key settings' setup status can help narrow it down.

## Install from source

Use this route for local development or a device-bound profile. It requires Python 3, Node 20+ and Xcode Command Line Tools, in addition to the prerequisites above. From the repository root:

```sh
npm ci --prefix com.local.rexagents.sdPlugin
python3 build.py
```

Quit **Stream Deck**, leaving agents and their terminal apps running, then:

```sh
python3 install.py
```

The installer requires an existing MK.2 profile to identify your device. If more than one MK.2 is found, its error lists the available IDs; rerun with `python3 install.py --device-uuid DEVICE_UUID`.

It backs up `ProfilesV3` and the previous plugin under `backups/TIMESTAMP/`, preserves existing `config.json` customizations and adds a device-bound **Rex Agents** profile only when that profile UUID is absent. It does not replace your existing profile. Start Stream Deck and select Rex Agents, then complete backend setup above.

For a source-installer rollback, quit Stream Deck and restore `previous-plugin` from that backup to `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.local.rexagents.sdPlugin`. Restore the backed-up `ProfilesV3` only if you need to undo profile changes; first preserve any profiles edited since the backup. Reopen Stream Deck.

A normal source build targets the current Mac architecture. `python3 package.py --tag v1.3.0-beta.1` builds both helper architectures and produces the downloadable bundle; see [releasing](RELEASING.md).
