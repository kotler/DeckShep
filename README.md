# Agent Switchboard

**One deck. Many agents.** A local Stream Deck control surface for coding agents, starting with Rex on macOS and leaving room for future Herdr support.

**Visible focus:** shared controls now use Rex's supported `pane.copy_id` app action, via a native clipboard-preserving helper. This follows mouse/keyboard tab selection rather than server focus. Clipboard use is opt-in (`allowClipboardFocus: true`) and is enabled on the development Mac with the user's authorization. New installations default to off until their user opts in.

Five agent keys show project, agent type and native status. Press one to select its Rex tab and bring the Rex window to the foreground. Repeated presses keep Rex visible; they never toggle it hidden. Set `bringToFront` to `false` to disable app activation. Shared controls resolve the currently focused pane on every action and reject ordinary shells. Common prompts stage without submission; a separate Send key submits after review.

| Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
| --- | --- | --- | --- | --- |
| Previous | Next | Interrupt | Model | More |
| Plan / Regular | Review | Effort | Permissions | Send |

More contains Zoom, Tests, Continue, the original planning prompt, optional native pickers, additional banks of agents, and menu navigation. Control mappings have property-inspector overrides. Prompts, aliases, palette, animation and bindings are configurable in the installed plugin's `config.json`.

## Status and icons

- **Ready:** green; native idle for an identified foreground agent.
- **Working:** blue with a gentle pulse.
- **Complete:** green with a 15-second pulse after an observed transition.
- **Waiting:** amber, slowly pulsing; permission and input labels differ.
- **Error:** red. **Unknown:** gray. Empty or closed slots show **Idle**.

Vector glyphs cover controls, Codex and Claude. A Grok glyph is included as an asset; Grok routing is not implemented. Animation uses SVG frames at four frames per second and can be disabled.

## Install on macOS

Requires Rex Beta in `/Applications`, Stream Deck 6.6+ (verified on 7.6.1), a 15-key MK.2 with an existing profile, Python 3, Node 20+, and Xcode Command Line Tools (`swiftc`) for building. The native helper is compiled for the build Mac architecture with a macOS 13 deployment target. Stream Deck supplies the plugin runtime.

```sh
npm ci --prefix com.local.rexagents.sdPlugin
node test.js
node test-controls.js
python3 build.py
# Quit Stream Deck, then:
python3 install.py
```

The installer discovers the local device, backs up profiles and any previous plugin, preserves existing profiles and plugin customizations, and adds the separate **Rex Agents** profile. For multiple MK.2 devices use `--device-uuid`. Start Stream Deck and select the profile. No Rex sessions are closed or renamed. Backups and build artifacts are ignored by Git. After reviewing the clipboard-helper tradeoffs below, opt in to shared controls by setting `allowClipboardFocus` to `true` in the installed plugin config; do not enable it for someone else without their consent.

The plugin keeps the original `com.local.rexagents` identifier so existing installations can upgrade without replacing their profile.

## One-press controls (Codex CLI 0.166.0)

The main keys use native shortcuts and settings-only presets. There is no separate Send/Apply step:

| Key | Action |
| --- | --- |
| Model | Sol → Astra → Luna → repeat |
| Effort | low → medium → high → xhigh → repeat |
| Plan | Native Shift+Tab toggles Plan/Regular collaboration mode |
| Permissions | Approve for me → Ask me → repeat, without changing the captured sandbox/profile or approval policy |

Model and effort commands apply for the current session only and preserve unfinished drafts. By default, Model discovers the picker-visible catalog using the focused native Codex executable's `debug models` command. Hidden models are excluded. Each press exports the focused TUI's **current** model settings through Codex's supported settings-preset UI, then applies the next discovered choice. Manual model/effort changes, and a new chat in the same process, are read again on the next press; the cycle does not depend on a remembered index. Current model/effort settings are not polled or displayed continuously.

These actions take one physical press, but native preset dialogs briefly appear while reading and applying the setting. Wait for the result before typing or using the mouse in Codex. Preset 0 is reserved as a shared, settings-only scratch slot. A preexisting user preset or an externally modified scratch slot causes refusal; it is never silently overwritten. The native New preset dialog supplies the live `/model` settings field; it is read and cancelled without saving. No transcript is parsed or saved. Dialog checks and the settings-field parser use only the current viewport.

Customize `modelDiscovery.include` to an ordered list of discovered model IDs, or leave it empty for all visible models. `modelDiscovery.effortLevels` limits the catalog-advertised effort levels to low/medium/high/xhigh by default; an empty list permits every advertised level. Effort preserves the current model. Changing models leaves effort selection to Codex's own validation/default behavior. The exact native binary is required; wrapper-only or incompatible versions fail closed. Catalog discovery uses the CLI's configuration context and sign-in; custom launch-profile overrides may differ, and Codex remains responsible for validating availability at application time.

The old `cycles.models` and `cycles.efforts` lists are used only when `modelDiscovery.enabled` is explicitly false, and for existing fixed-preset setup compatibility. In that fallback, positions are remembered per process. Presets 8–9 retain the permission reviewer commands. The brief label after a press reports the requested choice; Codex's own confirmation is the source of truth.

Plan is independent of Permissions. Plan changes collaboration mode; it does not change the approval reviewer. The original request-for-a-plan prompt remains in More. Native Plan mode can use Codex's own separate model/effort preferences. No Full Access preset or approval-menu acceptance key is configured.

### Setup without restarting running agents

After installation and clipboard-focus consent, run:

```sh
node com.local.rexagents.sdPlugin/setup-presets.js "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.local.rexagents.sdPlugin"
```

This focuses each idle supported Codex process, saves native settings presets in its live TUI, registers its process identity, then restores the original tab. It does not restart Codex or apply model, effort, or reviewer changes during setup. Presets persist in Codex config; local process registrations stay in the plugin's ignored `state/` directory. The development Mac's two live Codex processes were configured and their PIDs verified unchanged.

Existing user preset slots are rejected rather than overwritten. Only entries already recorded as managed settings may be replaced. Permissions setup snapshots the current native permission selection and changes only `--reviewer` in the two saved commands. If `cycles.autoSetupNewSessions` is true, a previously unregistered process gets this one-time setup on its first cycle press. This can briefly show configuration dialogs before applying the requested reviewer setting; subsequent Permissions presses directly run the preset. Model/Effort use the live-discovery path described above. Busy agents are rejected until ready. New Codex launches read the saved preset list, but each process is registered independently so old caches are not mistaken for configured sessions.

One-time setup inspects **only the current terminal viewport** to recognize configuration-dialog titles, never historical headings in scrollback. No terminal text is written to files or printed. It begins new presets from a native settings-generated single line rather than the user's composer, so multiline drafts are not copied into saved presets. If a dialog is unexpected, setup stops rather than sending an unverified confirmation. Do not interact with the agent while its setup dialogs are being navigated.

The older model/effort pickers remain available in More as a fallback. Claude one-press controls remain disabled until authenticated testing verifies that agent's native behavior.

## Safety and known limits

- Native OSC 7501 status is checked against foreground process PID, name and app. Missing, mismatched, or older-than-24-hour status becomes Unknown. Only identified Codex and Claude processes receive input; ancestor identity alone is insufficient.
- Shared actions query the app-selected block ID, then resolve that unique ID across sessions and validate its foreground agent. They do not use server active-window focus or pane labels. Rex Remote Control is required for the focus query and app tab selection; if unavailable, input is refused. Background status refreshes never touch the clipboard.
- Prompt buttons append bracketed paste without clearing existing text. Review the **entire composer** before Send. Send requires a recent plugin-staged draft in the same pane/process. Manual edits, submission and draft clearing are not tracked; do not manually submit a draft and then press Send.
- A process can exit after the final identity check and before a write. Rex has no atomic compare-process-and-send operation. Native status also cannot prove the agent is in its composer rather than a manually opened dialog.
- Status processing is local. Runtime routing/status does not scrape terminal text; preset setup and live Model/Effort controls read known configuration dialogs and their model-settings field. No prompt logging, credential collection or network status service is used. Stream Deck's loopback WebSocket and the supported Rex CLI are the integration boundaries.
- Physical More/Main page switching and both Codex agent-selection keys passed user testing. Physical staging, model-picker opening, one-step model/effort cycling and session-only apply passed in the disposable SD Test tab. Authenticated Claude tests, live working interruption and hardware animation tests remain outstanding. Software verification does not establish those behaviors.

## Verification

`test.js` covers identity, stale status, draft staging, focus changes, one-shot submission, shell rejection, blocked state, offline behavior and multiple sessions. `test-controls.js` covers model/effort staging, native picker keys, session-only apply, verification gates, expiry, SVG escaping and animation timing. Tests use simulated Rex responses and never send prompts to active agents.

Live local checks verified Codex discovery/native idle status, Stream Deck rendering, and disposable Codex picker navigation/session-only effort apply. The earlier server-only focus check was insufficient: physical testing showed it did not switch the visible tab. App-level selection now replaces that fallback. User physical testing passed More/Main page switching, first-key selection from Claude to Codex, and second-key selection to the other Codex tab after manually selecting Claude with the mouse. These results verify selection commands, not the ability to read visible focus after arbitrary mouse or keyboard changes. Shared input was disabled after that finding; the new opt-in app-focus helper replaces the server-focus read. Existing Default Profile files compared byte-for-byte equal after installation.

## Integration roadmap

| Integration | Status |
| --- | --- |
| Rex + Codex CLI | Implemented; verification limits above |
| Rex + Claude Code | Identification/status/prompt paths implemented; authenticated controls pending |
| Herdr | Future candidate; no adapter or API assumptions yet |
| Grok and other agents | Icon assets can be extended; input requires verified process identity and controls |

Rex currently lives in `core.js`. A future Herdr adapter should implement discovery, exact focus, current focus, process identity, status, and guarded input independently. Keep provider state out of the renderer and never substitute heuristic pane-name matching for identity.

## Vendor plugin comparison

Elgato's [ChatGPT & Codex](https://marketplace.elgato.com/product/chatgpt-codex-fb6a7052-2b1a-4500-ba2a-13996edf0b47) plugin supports Activity, New Chat, Dictate, Send Prompt, Steer, Run Skill, Stop, Model, Effort, Speed, Usage and Toggle Panel. Stream Deck + adds dial actions; Neo has infobars. It connects to the ChatGPT desktop app and does not advertise CLI-pane routing in Rex. It is Elgato-developed and explicitly not affiliated with or endorsed by OpenAI. This project remains independent of that plugin.

References: [Rex CLI](https://www.superlogical.com/rex/docs/reference/cli), [program status](https://www.superlogical.com/rex/docs/build/program-status), [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/), [Claude controls](https://code.claude.com/docs/en/model-config), [Codex CLI](https://learn.chatgpt.com/docs/codex/cli).

Third-party dependency: `ws` (MIT), pinned by package-lock.json. Local glyphs are custom vector artwork rather than bundled vendor logos. Product and company names belong to their respective owners. No project license has been selected yet.

Window activation uses macOS LaunchServices (`open -a /Applications/Rex Beta.app`) after successful Rex app-level tab selection. Software testing verified the selected Codex terminal had focus in the foreground Rex window. The user also confirmed physical activation from another app. Run `node test-focus.js` for activation ordering, repeat presses, opt-out, and failed-selection behavior.

## Clipboard focus helper and live validation

With the user's authorization, the native helper snapshots every available clipboard item/type into memory, calls Rex's `pane.copy_id`, validates a fresh `block:UUID`, restores the saved formats, and verifies their data matches. It prints only the block ID and a restoration-success flag. No clipboard data is logged or saved to disk. Concurrent helper runs are rejected using a local lock; unsupported clipboard types, missing panes, remote-control refusal or restoration failure block input. If another observed clipboard change occurs, it avoids overwriting it. Clipboard comparison/restoration is not an OS-atomic transaction, so an extremely narrow concurrent-copy race remains; clipboard-history managers may record the temporary pane ID. Do not enable this method if those side effects are unacceptable.

The helper is called only on action presses (and repeat identity checks), not polling. The old background focus dot is suppressed rather than pretending to track focus continuously. Source is `native/visible-pane.swift`; the compiled per-machine binary is ignored by Git and included in local `dist/` builds.

Live checks verified the helper followed mouse selection to Claude and keyboard selection to the other Codex tab, while restoring the clipboard data. In a disposable Codex tab, a fixed prompt staged without submission; switching the visible tab blocked Send; returning to the test tab submitted using Enter, reported Working then Complete, and returned the fixed response without tool use. Model/effort picker navigation passed and was cancelled without applying a change. The original pane was restored. This corrects the earlier assumption that Tab was the normal Codex Submit binding; the shipped default is now Enter.

`test.js` now deliberately supplies stale server focus and multiple sessions to verify the visible block ID wins; it also tests failed clipboard queries, closed panes, shells, owner mismatch, focus-change rejection and draft guards. User physical testing subsequently passed Model staging, Send opening the model picker, one-step-and-stop model cycling, Effort opening its picker, one-step-and-stop effort cycling, and Apply confirming a session-only change. Rex displays a copy toast for the focus query; this is a known UX cost of the supported `pane.copy_id` action. No silent-query alternative is implemented. Claude authenticated controls and working interruption are still unverified.

## One-press verification update

Tests cover independent cycle wraparound, Plan's native shortcut, preserving captured permission boundaries, refusal after preset changes, and process readiness. The setup regression test ensures old scrollback headings cannot be mistaken for current dialogs. In disposable-session tests, one-press model, effort and reviewer presets preserved a multiline draft without submitting it; the actual reviewer changed to auto review and back to user review. Native Plan toggled both directions. The two existing agents were subsequently configured in place with the original processes retained. The new layout is rendered in Stream Deck; physical one-press testing is pending.

### Dynamic model discovery verification

Discovery tests cover hidden-model filtering, ordered custom subsets, manual state changes, catalog-supported effort choices, malformed snapshots, scratch-slot ownership, and process identity. A disposable Codex TUI verified actual model/effort application after external native setting changes, while preserving a two-line draft without submission. No existing agent was restarted or sent a test prompt. Physical testing of this updated path remains pending.
