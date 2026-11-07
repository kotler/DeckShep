# Rex and Herdr profiles

Version 1.3.1 provides two profiles: **Rex Agents** and **Herdr Agents**. Use the profile selector at the top of Stream Deck’s editor to switch. Both use the same 15-key layout. No key is consumed by a backend switch; Page still cycles the interaction pages inside the selected profile.

Each profile pins its controller. The key settings show a read-only **Controller for this profile** field. Configure Rex visible-pane consent and bring-to-front behavior in Rex Agents; configure the explicit Herdr session socket and title matching in Herdr Agents. Claude native-control opt-in is separate for each controller. Animation and Review/Tests/Continue prompt text are shared.

Selection, bank, page and stable slots are independent for Rex and Herdr during a plugin run. Switching away clears tracked Send drafts and native picker confirmations, while leaving typed text and agents running. Returning retains that controller’s navigation state; restarting the plugin rebuilds navigation and slots. Connection preferences persist across restarts. Hidden controllers stop periodic polling. Queued presses for a hidden or replaced key are refused; an operation already sent to a native API can still finish.

## Install or upgrade

A downloaded 1.3.1 bundle includes both `.streamDeckProfile` files. Import each profile you want to use. On upgrade, keep your existing Rex profile and import **Herdr Agents** once. The source installer adds only missing profile UUIDs and preserves existing layouts, including customized Rex keys. It backs up profiles and the previous plugin first.

Older unmarked keys safely default to Rex, even if the former global controller preference was Herdr. The first load migrates explicit consent, custom prompts and Herdr connection preferences to versioned settings. A legacy preference projection is retained for older-plugin rollback; restore your backup when you need an exact rollback of all settings.

Select Herdr Agents and enter your intended local session socket in a key’s settings. The plugin does not guess a socket or automatically create/attach a session. See [Herdr setup](HERDR.md#setup). Rex retains its separate consent and setup; see [Rex setup](INSTALL.md#rex-setup).

Copied scoped keys retain their controller binding. Newly dragged or legacy unmarked keys default to Rex. Use the supplied profiles to keep controller bindings consistent. Copies of the same backend profile share that backend’s controller state; this release does not provide separate state per device or multiple simultaneous Herdr sessions.

See [uninstall instructions](UNINSTALL.md) to remove either profile or the shared plugin. Claude and mixed-agent controls remain a development preview with automated coverage only; separate profiles do not establish native-control compatibility.
