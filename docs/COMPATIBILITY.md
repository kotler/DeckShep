# Compatibility

| Component | Current evidence | Limits |
| --- | --- | --- |
| macOS | Local Apple Silicon Mac; minimum build target macOS 13 | Clean-machine validation outstanding |
| Intel Mac | Helper cross-compiled as a universal binary | Not executed on Intel hardware |
| Stream Deck | 7.6.1 (23033), local editor and existing MK.2 profile | Other software versions not exercised locally |
| Hardware/layout | 15-key Stream Deck MK.2, 5 columns × 3 rows | Other devices/layouts not supported by the default mapping |
| Rex | Beta 0.1.0 (1829), local connected macOS client | Remote Control required; multiple app clients need an explicit client label |
| Codex | Existing native TUIs 0.166.0-alpha.6 and shared daemon 0.167.0 | Schema/UI behavior is version-sensitive |
| Reviewer and mode metadata | Guarded settings reads/writes verified for daemon 0.166.0 / 0.167.0 | Unknown versions refused; persisted chat history may be required |
| Codex Model | Metadata-only reads and model-only updates with explicit identity/effort checks | No blind fallbacks or empty settings updates |
| Codex Effort | Current level is read from native metadata; effort-only updates cycle the model's supported levels | Changing effort needs a persisted chat for the full settings-preservation check |
| Claude Code | Process identification/basic status exists | Authenticated controls not verified; not a supported beta integration |
| Herdr TUI 0.9.5 / protocol 22 | Experimental 1.2.1 installed; physical core controls and native settings verified with opt-in thread-ID titles | Herdr overflow-bank/Collapse hardware and host-window presentation pending; composer submissions unavailable; local Mac only |
| Other terminals / Windows | No adapter | Future work, no compatibility claim |

Effort uses supported levels from the native daemon model catalog and an effort-only settings update, verified on Codex 0.166/0.167. Plan/Default uses the native Codex shortcut. Keyboard remapping, very narrow terminals, missing session-ID footers, manually opened native dialogs or truncated view data can prevent verification. It refuses unverified actions and leaves the input for review in Rex.

The Rex pane's reported working directory must match the selected Codex chat. If launching Codex with `-C`/`--cd`, start the Rex pane in that same directory (`rex run -c PROJECT -- codex -C PROJECT`). A mismatch deliberately prevents native settings from being used; model and effort captions may show Unknown. Empty chats may show the current effort but cannot change it until a completed turn makes the full settings snapshot available.

The Stream Deck manifest declares its SDK/runtime minimums; those declarations are not evidence that every older combination has been tested.
