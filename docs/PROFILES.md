# Rex and Herdr profiles

Version 1.5.0 packages **Rex** and **Herdr App** for the 15-key Stream Deck MK.2.
Select a profile at the top of Stream Deck’s editor. Each has independent
connection settings, consent, selection and banks. Herdr TUI stays experimental
and is available only in a source build with `experimental.herdr: true`.
Profile, page and key identities remain unchanged.

Each profile pins its controller. The key settings show a read-only **Controller for this profile** field. Configure Rex visible-pane consent and bring-to-front behavior in Rex; configure the explicit Herdr session socket and title matching in Herdr. Claude native-control opt-in is separate for each controller. Animation and Review/Tests/Continue prompt text are shared.

Selection, bank, page and stable slots are independent for Rex and Herdr during a plugin run. Switching away clears tracked Send drafts and native picker confirmations, while leaving typed text and agents running. Returning retains that controller’s navigation state; restarting the plugin rebuilds navigation and slots. Connection preferences persist across restarts. Hidden controllers stop periodic polling. Queued presses for a hidden or replaced key are refused; an operation already sent to a native API can still finish.

With visible-pane checks enabled, each Rex refresh (normally every two seconds)
reads the active window and focused block from session inspection when the client
has one known session. No clipboard operation is used for those polls. With
ambiguous attachments, the Mac visible-pane check runs on startup or changes
to reported focus, not on every refresh. A purely client-local session switch
with unchanged server focus may not be visible until an explicit selection.
Manual tab changes and closing the active tab move the
dot to the agent Rex now shows, including across pages. A shell, missing agent,
or unreadable focus clears the dot. Opening an agent in the background does
not steal selection. Focus tracking sends no terminal input.

Ready-state Model, Effort, Permissions and Mode use native keyboard controls.
The deck reads the focused view passively and leaves the subtitle blank until
it can read the value. A press reads the relevant native picker before selecting a
setting. Codex settings do not require a thread ID. The three Claude settings use the native-controls opt-in, foreground CLI registration,
default keybindings and verified visible pane. Working Claude panes can also Interrupt without hooks. DeckShep rechecks the focused CLI’s busy timestamp and a visible Escape hint or working spinner before sending one Escape. Queue, Steer, and question or approval actions still require hook identity. In Claude, Plan belongs
to the permission-mode cycle, so Permissions sends one Shift+Tab.
The Codex Permissions key skips Full Access. If its confirmation is already
open, pressing Permissions cancels it and continues the cycle.
Neither the terminal title nor the status line is changed.

In Rex, rows 1–2 use Rex discovery, owned program-status records, terminal titles
and physical pane selection. They work without Codex/Claude hook or daemon
metadata. Row 2 remains Next agent / Page / Collapse; Page is local and Collapse
removes closed slots after fresh Rex discovery. Missing titles fall back to the
Rex session label or Codex/Claude Code. Row 3 keeps provider-specific settings,
identity and input guards; provider details do not override the Rex agent bar.

The Herdr App profile uses the same agent and navigation positions. Tiles,
Next and Attention select locally or request an App pane with verified publisher
and separate consent. Page and Collapse act locally. App keys support taps
only. A changed App selection reveals its bank once; later Page browsing is
preserved. The third row is blank while agent controls are deferred, and saved
provider overrides stay inactive. [Herdr App guide](HERDR-APP.md)

## Key map (Stream Deck MK.2, 5×3)

One page, no folders. Row 1 shows agents, row 2 navigates, row 3 controls the
selected agent in Rex. Herdr App’s third row stays blank.

| | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- | --- |
| Row 1 | Agent | Agent | Agent | Agent | Agent |
| Row 2 | Next agent | Page | Collapse | | Attention |
| Row 3, ready | Model | Effort | Permissions | Mode (Codex only) | Interrupt |
| Row 3, working | Steer | Queue | Permissions | | Interrupt |
| Row 3, background | | | Permissions | | Stop |
| Row 3, question | Up | Down | Confirm | Esc | Interrupt or Toggle |
| Row 3, approval | Up | Down | Confirm | Esc | Interrupt |

| Key | Tap | Hold (450 ms) |
| --- | --- | --- |
| Agent | Focus that agent | |
| Next agent | Focus the next agent | Focus the previous agent |
| Page | Next group of five | Previous group of five |
| Attention | Focus the first other agent that needs you | |
| Row 3 keys | The labelled control | |

A key with a hold action acts when you release it, or at 450 ms if you keep
holding; a small corner mark shows which keys have one. All other keys act on
key-down. Both gestures use the state the key showed when you pressed it, and a
press that waits more than two seconds behind other work is refused with
"Press again".

In Rex and Herdr TUI, **Attention** stays blank until another agent is waiting on a question or
approval, has an error, or has finished, in that order of priority. It shows the
kind and the count, including agents on other pages. Pressing it focuses the
first such agent exactly as its own agent key would and moves the page to it.
In Herdr App, tap Attention to select its displayed agent locally or request its pane when verified focus is enabled. Herdr App has no hold actions.

Each agent key pairs its colour with a shape beside the status word: disc Ready,
triangle Working, half disc Bg task, `?` Asking, `!` Approve, check Done, cross
Error, ring Unknown.

## Install or upgrade

The 1.5.0 bundle includes **Rex** and **Herdr App** `.streamDeckProfile` files. Import each profile you want to use. On upgrade, keep your existing Rex profile and import **Herdr App** once. The source installer adds only missing profile UUIDs and preserves existing layouts, including customized Rex keys. It backs up profiles and the previous plugin first.

Older unmarked keys safely default to Rex, even if the former global controller preference was Herdr. The first load migrates explicit consent, custom prompts and Herdr connection preferences to versioned settings. A legacy preference projection is retained for older-plugin rollback; restore your backup when you need an exact rollback of all settings.

Select Herdr and enter your intended local session socket in a key’s settings. The plugin does not guess a socket or automatically create/attach a session. See [Herdr setup](HERDR.md#setup). Rex retains its separate consent and setup; see [Rex setup](INSTALL.md#rex-setup).

Copied scoped keys retain their controller binding. Newly dragged or legacy unmarked keys default to Rex. Use the supplied profiles to keep controller bindings consistent. Copies of the same backend profile share that backend’s controller state; this release does not provide separate state per device or multiple simultaneous Herdr sessions.

See [uninstall instructions](UNINSTALL.md) to remove either profile or the shared plugin. Claude and mixed-agent controls remain a development preview with automated coverage only; separate profiles do not establish native-control compatibility.

## Herdr App settings

The App home and plain-focus-request consent are independent of Rex and TUI.
Fresh installs and migrations grant no App consent. App-reported panes and deck
selection stay separate from provider/chat identity. Plain focus requests require
explicit consent, a verified connected publisher and a matching command contract.
See [App setup](HERDR-APP.md).
