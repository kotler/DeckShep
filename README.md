# Agent Switchboard

**One deck. Many agents.** A local Stream Deck control surface for coding agents, starting with Rex on macOS and leaving room for future Herdr support.

**Physical-test finding:** server focus can differ from the tab visible in Rex. Shared controls are now disabled by default (`focusRoutingVerified: false`) until a reliable app-focus read path is verified. Do not enable that flag merely because a server-focus check passes. Agent status keys now always request app-level session/tab selection; Rex Remote Control must be enabled by the user.

Five agent keys show project, agent type and native status. Press one to focus its exact Rex pane. Shared controls resolve the currently focused pane on every action and reject ordinary shells. Common prompts stage without submission; a separate Send key submits after review.

| Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
| --- | --- | --- | --- | --- |
| Previous | Next | Interrupt | Model | More |
| Plan prompt | Review | Effort | Continue | Send |

More contains Zoom, Tests, additional banks of agents, and menu navigation. Control mappings have property-inspector overrides. Prompts, aliases, palette, animation and bindings are configurable in the installed plugin's `config.json`.

## Status and icons

- **Ready:** green; native idle for an identified foreground agent.
- **Working:** blue with a gentle pulse.
- **Complete:** green with a 15-second pulse after an observed transition.
- **Waiting:** amber, slowly pulsing; permission and input labels differ.
- **Error:** red. **Unknown:** gray. Empty or closed slots show **Idle**.

Vector glyphs cover controls, Codex and Claude. A Grok glyph is included as an asset; Grok routing is not implemented. Animation uses SVG frames at four frames per second and can be disabled.

## Install on macOS

Requires Rex Beta in `/Applications`, Stream Deck 6.6+ (verified on 7.6.1), a 15-key MK.2 with an existing profile, Python 3 and Node 20+ for building. Stream Deck supplies the plugin runtime.

```sh
npm ci --prefix com.local.rexagents.sdPlugin
node test.js
node test-controls.js
python3 build.py
# Quit Stream Deck, then:
python3 install.py
```

The installer discovers the local device, backs up profiles and any previous plugin, preserves existing profiles and plugin customizations, and adds the separate **Rex Agents** profile. For multiple MK.2 devices use `--device-uuid`. Start Stream Deck and select the profile. No Rex sessions are closed or renamed. Backups and build artifacts are ignored by Git.

The plugin keeps the original `com.local.rexagents` identifier so existing installations can upgrade without replacing their profile.

## Model and effort

Verified with Codex CLI 0.166.0 in a disposable session:

1. Start with an empty agent composer. Press Model or Effort to stage `/model`; review it in Rex.
2. Press Send to open the native picker.
3. Repeated Model presses move down through native model choices. Effort advances to the reasoning picker; subsequent presses move down through its choices. Model returns to the model picker when currently choosing effort.
4. Apply (the Send key) advances from model to effort, then applies the selected reasoning configuration to this session with Codex's native `s` binding. Extended reasoning submenus may require the keyboard.
5. More → Esc backs out one picker level. Picker tracking expires after 60 seconds, focus/process changes or disconnection.

The terminal picker is the source of truth. The plugin does not scrape screen contents or claim to know the selected model. Keep the actual picker open while using these controls; after manual modal changes, finish or cancel using the keyboard. Claude's model/effort implementation remains disabled behind `controlVerified.claude-code` until authenticated testing verifies the installed version's controls.

Plan stages an ordinary request for a plan. It does **not** enable native plan mode or cycle permission policies. Menu keys never automatically approve permissions.

## Safety and known limits

- Native OSC 7501 status is checked against foreground process PID, name and app. Missing, mismatched, or older-than-24-hour status becomes Unknown. Only identified Codex and Claude processes receive input; ancestor identity alone is insufficient.
- Shared actions re-read Rex focus. Multiple attached sessions are ambiguous in the installed Rex API, so input refuses to guess. Cross-session selection also requires Rex client Remote Control; the plugin does not enable it.
- Prompt buttons append bracketed paste without clearing existing text. Review the **entire composer** before Send. Send requires a recent plugin-staged draft in the same pane/process. Manual edits, submission and draft clearing are not tracked; do not manually submit a draft and then press Send.
- A process can exit after the final identity check and before a write. Rex has no atomic compare-process-and-send operation. Native status also cannot prove the agent is in its composer rather than a manually opened dialog.
- Status processing is local. No transcript capture, terminal scraping, prompt logging, credential collection or network status service is used. Stream Deck's loopback WebSocket and the supported Rex CLI are the integration boundaries.
- Physical More/Main page switching and both Codex agent-selection keys passed user testing. Shared-input button tests, authenticated Claude tests, live working interruption and hardware animation tests remain outstanding. Software verification does not establish those behaviors.

## Verification

`test.js` covers identity, stale status, draft staging, focus changes, one-shot submission, shell rejection, blocked state, offline behavior and multiple sessions. `test-controls.js` covers model/effort staging, native picker keys, session-only apply, verification gates, expiry, SVG escaping and animation timing. Tests use simulated Rex responses and never send prompts to active agents.

Live local checks verified Codex discovery/native idle status, Stream Deck rendering, and disposable Codex picker navigation/session-only effort apply. The earlier server-only focus check was insufficient: physical testing showed it did not switch the visible tab. App-level selection now replaces that fallback. User physical testing passed More/Main page switching, first-key selection from Claude to Codex, and second-key selection to the other Codex tab after manually selecting Claude with the mouse. These results verify selection commands, not the ability to read visible focus after arbitrary mouse or keyboard changes. Shared input remains disabled. Existing Default Profile files compared byte-for-byte equal after installation.

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
