# DeckShep

**Your agents. At your fingertips.** A local Stream Deck controller for existing coding agents in **Rex** on macOS. Select a chat, see its project and status, and use a third row of controls that follows what the agent is doing.

This beta targets **Codex CLI on a 15-key Stream Deck MK.2**. The first release supports **Rex** only. Herdr support stays in source as an unreleased preview and is not packaged by default. Your agents and their existing daemon stay running.

## Claude and mixed-agent development preview

The 1.4.0 development build includes experimental Claude Code support and mixed Claude/Codex banks. Claude controls are off by default; isolated native validation passed, with physical validation still in progress. Model and Effort now cycle directly from Home, with session-only changes. In Rex, Claude settings and working Interrupt can use the focused native CLI without hooks. Queue and choice controls use optional hooks. DeckShep never changes your Claude Code or Codex status line. See [Claude setup, capabilities and limits](docs/CLAUDE.md). The published 1.2.1 beta and its existing hardware results remain the release baseline.

## Install on macOS

You'll need Rex, the Elgato Stream Deck app and a 15-key Stream Deck MK.2. Connect the deck and open Stream Deck once so it creates the device profile.

**From a beta ZIP:** Extract the versioned macOS ZIP supplied by the maintainer, double-click `com.kotl3r.deckshep.streamDeckPlugin`, and accept the bundled **Rex** profile. The public release is pending. If you're upgrading a customized installation, back it up first. [Upgrade and restore instructions](docs/INSTALL.md#upgrading-a-customized-deckshep-installation)

**From this checkout:** With Node 22.13 or later and Xcode Command Line Tools installed, run these commands from the repository root:

```sh
npm ci
npm run build
```

Quit **Stream Deck** from its menu, leave Rex running, then install and reopen Stream Deck:

```sh
node scripts/install.mjs
open -a "Elgato Stream Deck"
```

The installer backs up your profiles and previous plugin before updating them. If you have several MK.2 devices, pass `--device-uuid <uuid>` to select one. Older private previews with a different plugin ID require a fresh profile. [Identity migration](docs/IDENTITY.md)

**Connect the deck to Rex:**

1. Enable **Remote Control** in Rex and open a Codex CLI or native Claude Code session there.
2. In Stream Deck, choose the **Rex** profile and select a **DeckShep Key** in the editor. Click **Enable visible-pane checks** so DeckShep can verify which pane will receive your press. The check temporarily copies the pane ID and restores the clipboard.
3. For Claude, also select **Enable Claude native controls**. Press the agent's top-row key. The white dot marks the selected agent. A ready agent exposes **Model**, **Effort** and **Permissions**. In Claude, **Permissions** also cycles Plan mode.

## Optional hooks

You can use the focused Rex pane for settings and working **Interrupt** without installing hooks. Install the integration for the provider whose additional controls you want. Both helpers run from the installed plugin directory so their registered paths survive checkout moves. For the Terminal commands below, use Node 22.13 or later and set:

```sh
plugin_dir="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.kotl3r.deckshep.sdPlugin"
```

**Claude Code.** Install Claude lifecycle hooks for **Queue**, **Steer** and question or approval controls. In the DeckShep key inspector, choose **Preview changes**, review the settings diff, then choose **Apply with backup**. You can also preview and apply from Terminal:

```sh
node "$plugin_dir/configure-claude.js"
node "$plugin_dir/configure-claude.js" --apply
```

Check the entries with `/hooks` in Claude. A new session or your next submitted message can establish the binding. Your existing status line is preserved. [Claude hook setup and removal](docs/CLAUDE.md)

**Codex CLI.** Install Codex lifecycle hooks if you want thread-bound controls to identify a verified session without adding the session ID to your footer. Preview the entries, then apply them:

```sh
node "$plugin_dir/configure-codex.js"
node "$plugin_dir/configure-codex.js" --apply
```

Review and trust the DeckShep entries in Codex's `/hooks` menu. After a fresh session event, select the agent and click **Check selected Codex agent** in the key inspector. A verified binding shows **hook identity**. [Codex hook setup and removal](docs/CODEX-HOOKS.md)

- [Release readiness](docs/RELEASE-READINESS.md) · [Marketplace draft](docs/MARKETPLACE.md)
- [Switching profiles](docs/PROFILES.md)
- [Rex setup](docs/INSTALL.md)
- [Herdr (unreleased preview)](docs/HERDR.md#setup)
- [Uninstall and optional cleanup](docs/UNINSTALL.md)
- [Compatibility](docs/COMPATIBILITY.md) · [Release notes](docs/RELEASE-NOTES.md) · [Validation record](docs/BETA-CHECKLIST.md)

Independent installation on another Mac, Intel execution and signing/notarization remain unvalidated. This is a beta checkpoint.

## Controls

| Agent 1    | Agent 2    | Agent 3               | Agent 4    | Agent 5          |
| ---------- | ---------- | --------------------- | ---------- | ---------------- |
| Next agent | Page       | Collapse              | Empty      | Attention        |
| Contextual | Contextual | Permissions / Confirm | Contextual | Interrupt / Stop |

These screenshots show the Rex profile on the virtual MK.2 with two example Codex sessions. The white dot stays on the selected agent while the bottom row follows its state.

**Ready** — change the model, effort, permissions or mode.

![Ready Rex layout with Chat a selected and the Model, Effort, Permissions and Mode keys visible](tests/e2e/__screenshots__/idle-darwin.png)

**Working** — steer the current turn, queue typed text or interrupt.

![Working Rex layout with Steer, Queue and Interrupt on the bottom row](tests/e2e/__screenshots__/working-darwin.png)

**Asking** — move the highlight with Up or Down, then press Confirm or Esc.

![Rex layout for a selected agent asking a question, with Up, Down, Confirm and Esc keys](tests/e2e/__screenshots__/question-darwin.png)

With visible-pane checks enabled, the white dot follows the focused Rex pane on refresh. A shell or an unverified selection has no dot. The deck stays on one dynamic Home layout.
Row 2 manages the agent group: **Next agent** appears only with at least two
agents, **Page** appears only with more than one group of five agent slots, and
**Collapse** appears only when closed slots leave gaps. **Attention** appears only
when another agent is waiting on you, has an error or has finished; it shows the
kind and count, and one press focuses the first of them. Hold **Next agent** for
the previous agent and **Page** for the previous page; see the
[key map](docs/PROFILES.md#key-map-stream-deck-mk2-53). Row 3 follows the selected agent:

| State                     | Key 1  | Key 2  | Key 3                  | Key 4          | Key 5          |
| ------------------------- | ------ | ------ | ---------------------- | -------------- | -------------- |
| Ready / complete / error  | Model  | Effort | Permissions            | Plan / Default | Inactive       |
| Working in Rex            | Steer  | Queue  | Permissions (inactive) | Empty          | Interrupt      |
| Working in Herdr          | Empty  | Empty  | Permissions (inactive) | Empty          | Interrupt      |
| Background terminals only | Empty  | Empty  | Permissions (inactive) | Empty          | Stop           |
| Question or approval      | Up     | Down   | Confirm                | Esc            | Inactive       |
| Unknown / authentication  | Status | Empty  | Permissions (inactive) | Empty          | Inactive       |

**Interrupt** stops the current turn; background commands can continue. **Stop** (shown with the terminal count) separately stops verified terminals belonging to that selected chat. **Permissions** cycles the actual native permission profiles. Extra confirmations stay on the terminal for you to answer. It is separate from answering an approval prompt: **Confirm** accepts the native choice currently shown.

**Model** and **Effort** display current native values and cycle supported choices. **Plan / Default** toggles the native mode; Plan can use its own effort preset. Question and approval navigation appears automatically in row 3. Use the keyboard for extra Left/Right or Tab/Shift+Tab navigation and for Review, Tests, Continue and Send; there are no separate Questions or Prompts pages.

## Verified version scope

| Component   | Verified scope                                                   | Unverified versions                                                |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Codex CLI   | Any release (validated on 0.166.0 / 0.167.0)                     | Controls disabled when the daemon reports no version               |
| Claude Code | Any native release, opt-in preview                               | Native controls disabled for non-native installs                   |
| Herdr TUI   | Not in the first release; source preview for 0.9.5 / protocol 22 | Session refused                                                    |
| Herdr App   | Not in the first release; experimental source preview            | Production build records empty; [preview setup](docs/HERDR-APP.md) |

Version checks fail closed by design. Verification of one control does not
establish full provider parity or hardware support. See the generated
[compatibility matrix](docs/COMPATIBILITY.md) and the contributor process for
[verifying another version](CONTRIBUTING.md#verifying-another-upstream-version).

## Backend support

| Feature                                                   | Rex                            | Herdr (unreleased source preview)                  |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Agent selection, cycling banks, Next agent, Collapse      | Supported; hardware checked    | Supported; core hardware and six-agent API checked |
| Model, Effort, Permissions, Plan / Default                | Supported                      | Requires verified thread-ID titles                 |
| Questions, approval navigation, Interrupt, Stop terminals | Supported                      | Requires verified thread-ID titles                 |
| Steer, Queue                                              | Supported with composer checks | Unavailable; use the keyboard                      |
| Focus verification                                        | Explicit clipboard opt-in      | Herdr session API; no clipboard                    |

In Rex, the four ready-state settings keys use the focused native UI, without a thread ID. For thread-bound actions, Codex can use the optional [hook identity integration](docs/CODEX-HOOKS.md) without displaying the thread ID, when one CLI connection and one loaded thread can be verified. Ambiguous shared-daemon cases retain the independent footer path (`/statusline session-id model-with-reasoning`, run by you in Codex). Native message composition still needs its existing footer/cursor checks. DeckShep never changes your status line. See [Rex installation guide](docs/INSTALL.md).

Herdr is not packaged in the first release; source builds add its profile only with `experimental.herdr` set in `config.json`. It targets local TUI **0.9.5 / protocol 22**. Its pane-read API does not expose a trustworthy composer cursor/editing mode, so it cannot support the Rex submission checks. Multiple attached clients and reconnect behavior still need validation. See [the Herdr guide](docs/HERDR.md) for identity setup and exact coverage.

## Selection and input behavior

Slots stay stable during a plugin run. Closed agents leave holes; new agents append into later banks. **Collapse** removes closed slots and brings overflow forward without rearranging terminal tabs or changing relative order. Incomplete discovery never compacts slots. Page and Next agent cycle forward and wrap. Slots rebuild when the plugin restarts.

The dot represents the last deck selection or verified focus. Manual Rex tab changes cannot silently update it with the current API. Contextual actions check actual focus; a mismatch clears stale selection and asks you to **Reselect agent**. Background status updates never poll clipboard focus.

In Rex, **Review / Tests / Continue** append text without submitting. **Send** accepts only an unchanged plugin-staged draft in the same chat, with a matching turn, input digest and cursor. Editing or manually submitting invalidates it; use the keyboard after editing. **Steer** uses Enter during a running turn; **Queue** uses Tab. Empty input and slash/shell commands are refused, and uncertain submissions are not retried. Draft checks retain only hashes and identity in memory, not prompt text.

Agent keys use full status-color backgrounds, a provider watermark and larger chat/project/status labels. Empty slots omit Idle. Complete becomes Ready locally after two continuous seconds selected; native state is unchanged. Successful presses do not show Stream Deck checkmarks.

## Preferences

Select any **DeckShep Key** in Stream Deck's editor. The release ships the **Rex** profile; a source preview build can add **Herdr**, chosen with Stream Deck’s profile selector. Each profile pins its controller and keeps its own connection, consent, selected agent and agent page. Animation and prompt text are shared. See [profiles and migration](docs/PROFILES.md). New installations keep clipboard checks and Herdr title matching off until explicitly enabled.

Advanced aliases, palette, bindings and model filters live in `config.json`. Legacy upgrades use the ZIP’s one-time backup/migration helper to preserve disk customizations; shared UI preferences override their corresponding defaults. The settings panel accepts no sandbox or approval-policy fields. Unknown metadata or unsupported native versions disable the affected action.

## Build from source

Requires macOS, Node 22.13+ (see `.nvmrc`) and Xcode Command Line Tools. Stream Deck supplies the installed plugin's Node runtime.

```sh
npm ci
npm run lint
npm test
npm run test:coverage
npm run package -- --tag v1.4.0-beta.1
```

This builds a universal helper, validates and packs with the pinned official Elgato CLI, audits the actual archives and writes a versioned ZIP under `dist/`. It never uploads. See [checkout installation](#install-on-macos) and [release procedure](docs/RELEASING.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, safety rules and version verification; `AGENTS.md` contains the full standing instructions. `npm run build`
creates a portable local build without installing it. `npm run clean` removes only
`dist/` and `coverage/`; it preserves private backups. Installer recovery copies
now live under `~/Library/Application Support/DeckShep/backups/`; older
checkout-local backups remain yours to retain or remove.

## Project status and attribution

No account, hosted status service or separate OpenAI API key is required by this plugin. It uses the existing local terminal APIs and Codex daemon. Claude controls are an opt-in preview with isolated native validation and remaining physical validation; other terminals, Windows and alternative deck layouts remain outside the supported beta scope.

Copyright © 2026 Everett Kotler. The software is licensed under [Apache-2.0](LICENSE),
with attribution in [NOTICE](NOTICE). The DeckShep name and key-and-crook branding
are reserved; forks must rename and replace that branding as described in
[TRADEMARKS.md](TRADEMARKS.md). Third-party components retain their own licenses;
see [third-party notices](THIRD-PARTY-NOTICES.md). LobeHub's MIT SVG code license
does not clear the OpenAI or Anthropic marks; permission remains pending.
See [local data processing](docs/PRIVACY.md). DeckShep is independent of OpenAI,
Anthropic, Elgato, Rex, Herdr and products named Shepherd.

References: [Rex CLI](https://www.superlogical.com/rex/docs/reference/cli), [program status](https://www.superlogical.com/rex/docs/build/program-status), [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/).
