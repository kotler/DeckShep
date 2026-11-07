# Agent Switchboard

A local Stream Deck control surface for **existing Codex CLI agents in Rex on macOS**. Select an agent, see its chat/project/status, and use controls that follow its current state. Agent processes stay running; the integration does not launch a replacement conversation.

This is a **local beta**, not a published release. The implemented profile targets the 15-key Stream Deck MK.2. See [compatibility](docs/COMPATIBILITY.md), [release notes](docs/RELEASE-NOTES.md), and the [beta verification checklist](docs/BETA-CHECKLIST.md).

## Layout

| Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
| --- | --- | --- | --- | --- |
| Collapse | Agent bank | Next agent | Reviewer | Page |
| Contextual | Contextual | Contextual | Contextual | Interrupt |

Home’s third row follows the agent with the white selection dot:

| Agent state | Key 1 | Key 2 | Key 3 | Key 4 | Key 5 |
| --- | --- | --- | --- | --- | --- |
| Ready / complete / error | Model | Effort (current level) | Zoom | Plan / Default | Interrupt, inactive |
| Working | Steer | Queue | Zoom | Empty | Interrupt |
| Background commands only | Empty | Empty | Zoom | Empty | Stop terminals |
| Question | Up | Down | Confirm | Esc | Interrupt, inactive |
| Approval request | Up | Down | Confirm shown choice | Esc | Interrupt, inactive |
| Unknown / authentication | Status | Empty | Zoom | Empty | Interrupt, inactive |

Page stays in row two, column five and cycles **Home → Questions → Prompts → Home**. Questions includes native directional keys, Tab, Shift+Tab, Confirm and Esc. Prompts includes Review, Tests, Continue, Send and Zoom. Status changes do not switch pages automatically.

**Interrupt** stops the agent turn; background commands can continue. When a verified ended turn still has running terminals, the agent key says **BACKGROUND** and the bottom-right key becomes **Stop terminals**. That action stops only the terminal IDs shown for the selected chat, rechecking focus, chat, turn and terminal membership before each request. It never submits text or changes permissions.

Signal uses consistent Lucide control icons, dark control surfaces and thick colored accents inset from the recessed key edges. Agent keys have full status-color backgrounds, larger chat/project/status text, and a faint monochrome Codex watermark. The Effort key uses a brain icon and shows its current native value; the mode key displays the verified **Plan** or **Default** mode. Empty slots say No agent or Closed, without an Idle label. Complete acknowledges locally as Ready after two continuous seconds selected; native agent state is unchanged.

## Install a local beta

1. Install Rex and Stream Deck, and authenticate Codex CLI with its existing local daemon.
2. Open `com.local.rexagents.streamDeckPlugin` in Stream Deck. Import `Rex Agents.streamDeckProfile` and assign it to the MK.2.
3. Enable **Remote Control** in Rex. Select a Rex Agents key in the Stream Deck editor to open its settings.
4. Explicitly enable **visible-pane checks**. The helper uses Rex’s `pane.copy_id`, temporarily copying a pane ID and restoring the original clipboard formats. Rex may show a copy notification; background status updates do not query clipboard focus.
5. Press a live agent key on the deck. If chat metadata is unavailable, use **Set up selected Codex agent** in the settings panel while it is ready. Setup opens native settings dialogs, saves a session-ID/model footer and preserves unsent input. Leave Rex alone until it finishes. It sends no user prompt and does not restart the process.

A full initial install from a downloaded package has not yet been validated on another Mac. The helper is ad-hoc signed and not notarized for public distribution. This beta uses version-sensitive Codex integration paths; unsupported settings versions are refused rather than guessed.

For development installation, with Stream Deck quit:

```sh
npm ci --prefix com.local.rexagents.sdPlugin
python3 build.py
python3 install.py
```

The development installer backs up existing profiles/plugin files, preserves local configuration and copies a device-bound profile only if it does not already exist. It requires an existing MK.2 profile to identify the device. It does not change Rex sessions or Codex permissions.

## Preferences

Select any Rex Agents key in the Stream Deck editor. Shared settings include visible-pane checks, bringing Rex forward, status animation, and the Review/Tests/Continue prompt text. Preferences save through Stream Deck global settings and apply to all keys. Prompt text must be plain single-line text, up to 4000 characters. Setup status shows agent discovery, available Codex chat metadata, and selection readiness. Per-key action overrides are under the advanced section.

Advanced defaults remain in `config.json`: chat/folder aliases, model catalog filters, key bindings and palette. Existing disk customizations are retained by the development installer; explicit shared preferences override their corresponding defaults. No preference in the UI accepts sandbox or approval-policy fields. New installations leave clipboard checks off until enabled by their user.

## Controls and input

- **Model** uses the already-running local Codex daemon. It writes only the selected model and preserves compatible effort. **Reviewer** shows the current request evaluator and switches between Ask me and Approve for me, with before/after boundary checks; it does not change sandbox or approval policy. Empty chats without persisted history may not support Reviewer, effort changes or mode metadata yet.
- **Zoom** stays in the middle of the third row when the agent is ready, running or has background terminals. **Effort** shows the current level and cycles through the selected model’s supported efforts, wrapping at the end. It writes only effort through the running native daemon and verifies the other settings remain unchanged. **Plan/Default** sends native Shift+Tab once, then waits for a fresh settings read. Unavailable metadata shows Mode or Updating rather than guessing.
- **Steer** submits already-typed plain text into the running turn with native Enter. **Queue** uses native Tab. Both verify agent/chat/active turn, visible composer, stable input digest and cursor. Empty input and slash/shell commands are refused. Identical uncertain submissions are not retried.
- **Question and approval controls** require their corresponding native waiting state. Approval Confirm acts on the choice actually shown in Rex; it never guesses an approval scope or automatically selects Always Allow.
- **Review/Tests/Continue** append a prompt without submitting it. **Send** requires the same chat, latest completed-turn marker, composer digest and cursor captured after staging. It checks twice and rechecks focus before submission. Editing, clearing, manually submitting, changing chats or a failed read invalidates the staged Send. Use Rex’s keyboard after manual editing. Reselecting an agent on the deck clears plugin draft tracking without clearing native input.

No prompt/input text is persisted by the draft checks. Only hashes, cursor coordinates and chat/turn identity are held in memory. Normal button feedback replaces the key’s label; successful presses do not show Stream Deck checkmarks.

## Selection, slots and known limits

The white dot is the last deck-selected or focus-verified agent. Startup performs one visible-pane check when already opted in. Manual Rex mouse/keyboard tab changes cannot silently update it with the currently exposed client API. Each contextual action checks actual focus; a detected focus/process mismatch clears the stale dot and staged tracking and asks you to **Reselect agent**. No background clipboard polling is performed.

Slots stay stable during a plugin run. Closed agents leave holes and new agents append into later banks. **Collapse** refreshes discovery, removes closed slots and brings overflow forward without changing relative agent order, Rex tabs or focus. Failed/incomplete discovery never compacts slots. Agent bank and Next agent cycle forward and wrap. Slots rebuild from discovery when the plugin restarts; persistent ordering is not implemented.

The Rex API does not offer an atomic compare-process-and-send operation, so a narrow final-check/write race remains. Native status cannot prove the composer is visible; message controls therefore verify its viewport/cursor separately. The clipboard helper also cannot make clipboard restoration OS-atomic. Authenticated Claude controls, other terminals, Windows and alternative deck layouts are not supported by this beta.

## Build and verify

```sh
npm test --prefix com.local.rexagents.sdPlugin
npm ci --prefix tools
python3 package.py
```

`package.py` builds Apple Silicon/Intel helper slices, uses the pinned official Elgato CLI to validate and package the plugin, checks the installer for local paths/development state, and produces a local beta ZIP plus SHA-256 checksums under `dist/`. It never uploads or publishes. Intel execution and clean-machine installation still require validation.

Automated suites exercise state/focus changes, request identity, input privacy, duplicate suppression, native settings preservation, shared preferences, startup selection, labels and multi-bank lifecycle. Passing fixtures does not establish end-to-end hardware behavior. Live read-only checks and the remaining manual checks are recorded in [the beta checklist](docs/BETA-CHECKLIST.md).

## Project status and attribution

No project license has been selected, and public release/branding remain decisions for the owner. See [third-party notices](THIRD-PARTY-NOTICES.md). No account, hosted status service or separate OpenAI API key is required by the plugin. Status comes from native Rex program-status records; metadata and controls use the supported Rex CLI and the existing local Codex daemon.

References: [Rex CLI](https://www.superlogical.com/rex/docs/reference/cli), [program status](https://www.superlogical.com/rex/docs/build/program-status), [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/).

## Herdr development branch

An opt-in Herdr backend is implemented on `codex/herdr-feature-parity`. It targets local Herdr TUI 0.9.5 / protocol 22. Live API checks passed for discovery, six-agent navigation, closed slots, Collapse, focus and Zoom. The opt-in thread-ID title adapter binds daemon-backed Codex agents despite the upstream hook-context issue; installed physical core controls and live Model, Effort, Reviewer and Plan/Default changes and restoration passed. Send, Steer, Queue and prompt staging remain unavailable because the public pane-read API does not provide an input cursor. See [Herdr setup and verification](docs/HERDR.md).
