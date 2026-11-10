# DeckShep

**Your agents. At your fingertips.** A local Stream Deck controller for existing coding agents in **Rex** on macOS. Select a chat, see its project and status, and use a third row of controls that follows what the agent is doing.

This beta targets **Codex CLI on a 15-key Stream Deck MK.2**. The first release supports **Rex** only. Herdr support stays in source as an unreleased preview and is not packaged by default. Your agents and their existing daemon stay running.

## Claude and mixed-agent development preview

The 1.4.0 development build includes experimental Claude Code support and mixed Claude/Codex banks. Claude controls are off by default; isolated native validation passed, with physical validation still in progress. Model and Effort now cycle directly from Home, with session-only changes. Claude controls use hooks only; DeckShep never changes your Claude Code or Codex status line. See [Claude setup, capabilities and limits](docs/CLAUDE.md). The published 1.2.1 beta and its existing hardware results remain the release baseline.

## Get started

DeckShep is being prepared for a free, open-source release under Apache-2.0. Source is maintained in [kotler/DeckShep](https://github.com/kotler/DeckShep); the first release remains pending owner review. Once available, use the versioned macOS ZIP attached to a GitHub Release and follow [Installation and upgrades](docs/INSTALL.md). GitHub's automatically generated source archive is not an installer.

The single plugin installer includes the **Rex** profile; the ZIP also includes setup guides, build information and checksums. The plugin ID is `com.kotl3r.deckshep`. Older private previews need the new profiles and explicit integration setup; see the [prelaunch identity reset](docs/IDENTITY.md).

- [Release readiness](docs/RELEASE-READINESS.md) · [Marketplace draft](docs/MARKETPLACE.md)
- [Switching profiles](docs/PROFILES.md)
- [Rex setup](docs/INSTALL.md#rex-setup)
- [Herdr (unreleased preview)](docs/HERDR.md#setup)
- [Uninstall and optional cleanup](docs/UNINSTALL.md)
- [Compatibility](docs/COMPATIBILITY.md) · [Release notes](docs/RELEASE-NOTES.md) · [Validation record](docs/BETA-CHECKLIST.md)

Independent installation on another Mac, Intel execution and signing/notarization remain unvalidated. This is a beta checkpoint.

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

## Verified version scope

| Component | Verified scope | Unverified versions |
| --- | --- | --- |
| Codex CLI | 0.166.0 / 0.167.0 for permission controls | Affected controls disabled |
| Claude Code | 2.1.319 native controls, opt-in preview (hooks only) | Native controls disabled |
| Herdr TUI | Not in the first release; source preview for 0.9.5 / protocol 22 | Session refused |
| Herdr App | Not in the first release; experimental source preview | Production build records empty; [preview setup](docs/HERDR-APP.md) |

Version checks fail closed by design. Verification of one control does not
establish full provider parity or hardware support. See the generated
[compatibility matrix](docs/COMPATIBILITY.md) and the contributor process for
[verifying another version](CONTRIBUTING.md#verifying-another-upstream-version).

## Backend support

| Feature | Rex | Herdr (unreleased source preview) |
| --- | --- | --- |
| Agent selection, cycling banks, Next agent, Collapse | Supported; hardware checked | Supported; core hardware and six-agent API checked |
| Model, Effort, Reviewer, Plan / Default | Supported | Requires verified thread-ID titles |
| Questions, approval navigation, Interrupt, Stop terminals | Supported | Requires verified thread-ID titles |
| Zoom | Supported | API layout round-trip checked; outer terminal presentation pending |
| Prompt staging, Send, Steer, Queue | Supported with composer checks | Unavailable; use the keyboard |
| Focus verification | Explicit clipboard opt-in | Herdr session API; no clipboard |

In Rex, Codex Model, Effort, Reviewer, Plan / Default, Interrupt, Stop terminals and prompt staging use the session ID shown in your own Codex footer (`/statusline session-id model-with-reasoning`, run by you in Codex). Without it those keys show **No footer ID**; selection, Zoom, questions and approvals still work. DeckShep only reads the footer. See [install step 5](docs/INSTALL.md).

Herdr is not packaged in the first release; source builds add its profile only with `experimental.herdr` set in `config.json`. It targets local TUI **0.9.5 / protocol 22**. Its pane-read API does not expose a trustworthy composer cursor/editing mode, so it cannot support the Rex submission checks. Multiple attached clients and reconnect behavior still need validation. See [the Herdr guide](docs/HERDR.md) for identity setup and exact coverage.

## Selection and input behavior

Slots stay stable during a plugin run. Closed agents leave holes; new agents append into later banks. **Collapse** removes closed slots and brings overflow forward without rearranging terminal tabs or changing relative order. Incomplete discovery never compacts slots. Agents and Next agent cycle forward and wrap. Slots rebuild when the plugin restarts.

The dot represents the last deck selection or verified focus. Manual Rex tab changes cannot silently update it with the current API. Contextual actions check actual focus; a mismatch clears stale selection and asks you to **Reselect agent**. Background status updates never poll clipboard focus.

In Rex, **Review / Tests / Continue** append text without submitting. **Send** accepts only an unchanged plugin-staged draft in the same chat, with a matching turn, input digest and cursor. Editing or manually submitting invalidates it; use the keyboard after editing. **Steer** uses Enter during a running turn; **Queue** uses Tab. Empty input and slash/shell commands are refused, and uncertain submissions are not retried. Draft checks retain only hashes and identity in memory, not prompt text.

Agent keys use full status-color backgrounds, a provider watermark and larger chat/project/status labels. Empty slots omit Idle. Complete becomes Ready locally after two continuous seconds selected; native state is unchanged. Successful presses do not show Stream Deck checkmarks.

## Preferences

Select any **DeckShep Key** in Stream Deck's editor. The release ships the **Rex** profile; a source preview build can add **Herdr**, chosen with Stream Deck’s profile selector. Each profile pins its controller and keeps its own connection, consent, selected agent, bank and page. Animation and prompt text are shared. See [profiles and migration](docs/PROFILES.md). New installations keep clipboard checks and Herdr title matching off until explicitly enabled.

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

This builds a universal helper, validates and packs with the pinned official Elgato CLI, audits the actual archives and writes a versioned ZIP under `dist/`. It never uploads. See [source installation](docs/INSTALL.md#install-from-source) and [release procedure](docs/RELEASING.md).

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
