# Rex and Herdr profiles

> **First release: Rex only.** The owner limited the first release to the **Rex**
> profile on 2026-11-10. Default and release builds package only Rex. Source
> builds add **Herdr** with `experimental.herdr: true` in `config.json`; its
> profile, page and key IDs are unchanged for a later release. The rest of this
> page describes that preview.

Version 1.3.1 provided two profiles: **Rex** and **Herdr**. Use the profile selector at the top of Stream Deck’s editor to switch. Both use the same 15-key dynamic Home layout. No key is consumed by a backend switch. Page cycles groups of five agents and appears only when there is more than one group; separate Questions and Prompts pages have been removed.

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

## Key map (Stream Deck MK.2, 5×3)

One page, no folders. Row 1 shows agents, row 2 navigates, row 3 controls the
selected agent.

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

**Attention** stays blank until another agent is waiting on a question or
approval, has an error, or has finished, in that order of priority. It shows the
kind and the count, including agents on other pages. Pressing it focuses the
first such agent exactly as its own agent key would and moves the page to it.
Holds and Attention are not offered in the experimental Herdr App profile.

Each agent key pairs its colour with a shape beside the status word: disc Ready,
triangle Working, half disc Bg task, `?` Asking, `!` Approve, check Done, cross
Error, ring Unknown.

## Install or upgrade

A downloaded 1.3.1 bundle includes both `.streamDeckProfile` files. Import each profile you want to use. On upgrade, keep your existing Rex profile and import **Herdr** once. The source installer adds only missing profile UUIDs and preserves existing layouts, including customized Rex keys. It backs up profiles and the previous plugin first.

Older unmarked keys safely default to Rex, even if the former global controller preference was Herdr. The first load migrates explicit consent, custom prompts and Herdr connection preferences to versioned settings. A legacy preference projection is retained for older-plugin rollback; restore your backup when you need an exact rollback of all settings.

Select Herdr and enter your intended local session socket in a key’s settings. The plugin does not guess a socket or automatically create/attach a session. See [Herdr setup](HERDR.md#setup). Rex retains its separate consent and setup; see [Rex setup](INSTALL.md#rex-setup).

Copied scoped keys retain their controller binding. Newly dragged or legacy unmarked keys default to Rex. Use the supplied profiles to keep controller bindings consistent. Copies of the same backend profile share that backend’s controller state; this release does not provide separate state per device or multiple simultaneous Herdr sessions.

See [uninstall instructions](UNINSTALL.md) to remove either profile or the shared plugin. Claude and mixed-agent controls remain a development preview with automated coverage only; separate profiles do not establish native-control compatibility.

## Herdr App preview

The explicitly enabled experimental build can add the already-reserved **Herdr App**
profile. Default builds contain only Rex. Its home and plain-focus-request
consent are independent; no migration grants consent. App-reported panes and deck
selection are separate from provider/chat identity. Production request records
are empty, so its controls stay inactive. See [App setup](HERDR-APP.md).
