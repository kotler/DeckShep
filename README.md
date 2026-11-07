# Agent Switchboard

**One deck. Many agents.** A local Stream Deck controller for existing coding agents in **Rex** and **Herdr** on macOS. Select a chat, see its project and status, and use a third row of controls that follows what the agent is doing.

This beta targets **Codex CLI on a 15-key Stream Deck MK.2**. Rex is the default controller; Herdr is experimental and requires explicit setup. Your agents and their existing daemon stay running.

## Get started

Download the versioned macOS ZIP from [GitHub Releases](https://github.com/kotler/agent-switchboard/releases), extract it, and follow [Installation and upgrades](docs/INSTALL.md). Use the ZIP attached to the release, rather than GitHub's automatically generated source archive.

The bundle contains the plugin installer, the **Rex Agents** profile, setup guides, build information and checksums. The existing profile name and `com.local.rexagents` identifier are retained so upgrades keep working with your keys.

- [Rex setup](docs/INSTALL.md#rex-setup)
- [Herdr setup](docs/HERDR.md#setup)
- [Uninstall and optional cleanup](docs/UNINSTALL.md)
- [Compatibility](docs/COMPATIBILITY.md) · [Release notes](docs/RELEASE-NOTES.md) · [Validation record](docs/BETA-CHECKLIST.md)

Independent installation on another Mac, Intel execution and signing/notarization remain unvalidated. This is a beta checkpoint, not a claim of complete Herdr parity.

## Controls

| Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
| --- | --- | --- | --- | --- |
| Collapse | Agents | Next agent | Reviewer | Page |
| Contextual | Contextual | Zoom / Confirm | Contextual | Interrupt / Stop |

The white dot marks the selected agent. **Page** cycles Home → Questions → Prompts → Home, staying in the same position. Home's third row follows the selected agent:

| State | Key 1 | Key 2 | Key 3 | Key 4 | Key 5 |
| --- | --- | --- | --- | --- | --- |
| Ready / complete / error | Model | Effort | Zoom | Plan / Default | Inactive |
| Working in Rex | Steer | Queue | Zoom | Empty | Interrupt |
| Working in Herdr | Empty | Empty | Zoom | Empty | Interrupt |
| Background terminals only | Empty | Empty | Zoom | Empty | Stop terminals |
| Question or approval | Up | Down | Confirm | Esc | Inactive |
| Unknown / authentication | Status | Empty | Zoom | Empty | Inactive |

**Interrupt** stops the current turn; background commands can continue. **Stop terminals** separately stops verified terminals belonging to that selected chat. **Reviewer** cycles Ask me / Approve for me without changing the sandbox or approval policy. It is separate from answering an approval prompt: **Confirm** accepts the native choice currently shown.

**Model** and **Effort** display current native values and cycle supported choices. **Plan / Default** toggles the native mode; Plan can use its own effort preset. The Questions page adds Left/Right, Tab and Shift+Tab. The Prompts page offers Review, Tests, Continue and guarded Send in Rex; Herdr displays **Use Herdr keyboard**.

## Backend support

| Feature | Rex | Herdr experimental |
| --- | --- | --- |
| Agent selection, cycling banks, Next agent, Collapse | Supported; hardware checked | Supported; core hardware and six-agent API checked |
| Model, Effort, Reviewer, Plan / Default | Supported | Requires verified thread-ID titles |
| Questions, approval navigation, Interrupt, Stop terminals | Supported | Requires verified thread-ID titles |
| Zoom | Supported | API layout round-trip checked; outer terminal presentation pending |
| Prompt staging, Send, Steer, Queue | Supported with composer checks | Unavailable; use the keyboard |
| Focus verification | Explicit clipboard opt-in | Herdr session API; no clipboard |

Herdr targets local TUI **0.9.5 / protocol 22**. Its pane-read API does not expose a trustworthy composer cursor/editing mode, so it cannot support the Rex submission checks. Multiple attached clients and reconnect behavior still need validation. See [the Herdr guide](docs/HERDR.md) for identity setup and exact coverage.

## Selection and input behavior

Slots stay stable during a plugin run. Closed agents leave holes; new agents append into later banks. **Collapse** removes closed slots and brings overflow forward without rearranging terminal tabs or changing relative order. Incomplete discovery never compacts slots. Agents and Next agent cycle forward and wrap. Slots rebuild when the plugin restarts.

The dot represents the last deck selection or verified focus. Manual Rex tab changes cannot silently update it with the current API. Contextual actions check actual focus; a mismatch clears stale selection and asks you to **Reselect agent**. Background status updates never poll clipboard focus.

In Rex, **Review / Tests / Continue** append text without submitting. **Send** accepts only an unchanged plugin-staged draft in the same chat, with a matching turn, input digest and cursor. Editing or manually submitting invalidates it; use the keyboard after editing. **Steer** uses Enter during a running turn; **Queue** uses Tab. Empty input and slash/shell commands are refused, and uncertain submissions are not retried. Draft checks retain only hashes and identity in memory, not prompt text.

Agent keys use full status-color backgrounds, a Codex watermark and larger chat/project/status labels. Empty slots omit Idle. Complete becomes Ready locally after two continuous seconds selected; native state is unchanged. Successful presses do not show Stream Deck checkmarks.

## Preferences

Select any **Rex Agent Key** in Stream Deck's editor. Shared preferences include controller, Herdr socket/title matching, Rex visible-pane consent, bringing Rex forward, animation and prompt text. They apply to all keys. New installations keep clipboard checks and Herdr title matching off until explicitly enabled.

Advanced aliases, palette, bindings and model filters live in `config.json`. The source installer preserves existing disk customizations; shared UI preferences override their corresponding defaults. The settings panel accepts no sandbox or approval-policy fields. Unknown metadata or unsupported native versions disable the affected action.

## Build from source

Requires macOS, Node 20+, Python 3 and Xcode Command Line Tools. Stream Deck supplies the installed plugin's Node runtime.

```sh
npm ci --prefix com.local.rexagents.sdPlugin
npm ci --prefix tools
npm test --prefix com.local.rexagents.sdPlugin
python3 -m unittest discover -s tests -v
python3 package.py --tag v1.2.1-beta.2
```

This builds a universal helper, validates and packs with the pinned official Elgato CLI, audits the actual archives and writes a versioned ZIP under `dist/`. It never uploads. See [source installation](docs/INSTALL.md#install-from-source) and [release procedure](docs/RELEASING.md).

## Project status and attribution

No account, hosted status service or separate OpenAI API key is required by this plugin. It uses the existing local terminal APIs and Codex daemon. Authenticated Claude controls, other terminals, Windows and alternative deck layouts are outside this beta's supported scope.

No project license has been chosen. OpenAI artwork is retained for local/private beta use; redistribution must be resolved before a public release. See [third-party notices](THIRD-PARTY-NOTICES.md). This project is independent of OpenAI, Elgato, Rex and Herdr.

References: [Rex CLI](https://www.superlogical.com/rex/docs/reference/cli), [program status](https://www.superlogical.com/rex/docs/build/program-status), [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/).
