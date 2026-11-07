# Claude Code and mixed agent banks (development preview)

Implemented on `codex/claude-mixed-agent-support`, version **1.3.0**. This preview has automated coverage but **no live Claude control or physical-key validation**. It has not replaced the installed 1.2.1 plugin. The earlier Rex/Codex and Herdr/Codex hardware results do not validate these new paths.

Claude and Codex share discovery, stable slots, bank cycling, Next agent, Collapse, selection dots and project/status labels within the chosen controller. Selecting an agent changes the contextual controls for its provider. Each controller still connects to its own Rex or explicit Herdr session; this does not aggregate Rex and Herdr into one bank.

## Capabilities

| Feature | Claude in Rex | Claude in Herdr |
| --- | --- | --- |
| Discovery, selection, banks, Next agent, Collapse, Zoom | Implemented | Implemented |
| Session identity, title, model and effort | Optional local metadata integration | Same integration; independent of Codex title matching |
| Model / Effort | Opens native model/effort picker; explicit session-only Apply | Use Herdr keyboard |
| Native question / approval navigation and Confirm / Esc | Guarded native keys | Guarded native keys, pane must be at bottom |
| Multiple-select question | Toggle/Space appears when native hint is visible | Same |
| Interrupt | One Escape, current lifecycle and visible interrupt-hint checks | Same; scoped to explicit pane |
| Review / Tests / Continue and guarded Send | Implemented for recognized composer | Unavailable; cursor API missing |
| Queue / Steer | Enter queues; Ctrl+X Ctrl+S sends now | Unavailable; cursor API missing |
| Permission modes / Plan | Keyboard only; Mode is informational | Keyboard only |
| Stop background tasks/terminals | Not implemented for Claude | Not implemented for Claude |

Model and Effort currently open the same native picker. Up/Down chooses the model; Left/Right on the Questions page adjusts effort. **Apply · this session** uses Claude's `s` action, only when the screen explicitly offers it. Native Enter would save a default; the deck does not send Enter to confirm this picker. A cache/consent warning or unfamiliar follow-up screen requires the keyboard.

The normal Claude Home row keeps Zoom in the middle. The Codex Reviewer key becomes a Claude information key. Mode says Use keyboard because Claude's permission-mode cycle can include Accept edits, Bypass and Auto; it is not equivalent to Codex Plan/Default. The integration does not automatically cycle those modes, accept an approval or create permission rules.

## Optional setup for later live validation

Do not follow these steps just to run the fixture tests. This implementation work did not apply them to the owner's settings or exercise live controls.

Prerequisites: local macOS, **native Claude Code 2.1.319**, Node 20+ for the metadata helper, and a running preview plugin. The reader checks the actual foreground PID, owner, executable version, process start time, session ID and matching directory. The npm/wrapper executable path and other Claude versions are not enabled for native controls yet. A custom `keybindings.json` disables native controls in this preview; its bindings have not been validated. The integration never removes or rewrites that file. Signing in to Claude is needed for live agent work, not for the plugin's automated tests. The plugin has no separate Claude login or API key.

After intentionally installing the preview and leaving agents running, preview setup from Terminal:

```sh
plugin_dir="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.local.rexagents.sdPlugin"
node "$plugin_dir/configure-claude.js" --statusline
```

To apply that setup with a backup:

```sh
node "$plugin_dir/configure-claude.js" --statusline --apply
```

This explicitly adds only this integration's command hooks to Claude settings. It chains an existing status-line command, retains its padding/options, and records the original for removal. The wrapper forwards the original JSON to that existing command and keeps its output. With no previous command, it displays a simple Claude/model/effort line. The wrapper refreshes every two seconds; it adds local process work but no model requests. It never modifies authentication, permission rules, sandbox settings or existing unrelated hooks. Settings backups use a `settings.json.switchboard-backup-…` suffix and private permissions.

The default target is `~/.claude/settings.json`, honoring `CLAUDE_CONFIG_DIR`; use `--settings /absolute/settings.json` for a different settings file. To run the script from the checkout while targeting an installed copy, also pass `--plugin-dir "$plugin_dir"`. Hooks reference that absolute installation and Node executable; remove the previous setup before moving either.

Claude normally notices settings-file edits through its watcher; check its read-only `/hooks` menu when validating setup. Identity needs a root SessionStart or UserPromptSubmit event, so an already-open idle chat can remain unverified until its next user-submitted message. The plugin never sends that message or restarts the chat automatically. Project or managed settings can disable/override these hooks; the integration does not bypass those settings.

In Stream Deck's key settings, explicitly enable **Claude native controls after hook setup**. In Rex, visible-pane consent is still required. In Herdr, choose the intended local session socket; Claude identity does not require `/title thread-id`. Reselect the desired agent after changing opt-in or controller settings.

## Metadata, identity and input guards

The helper reads hook/status-line JSON in memory. It stores only session/name/model/effort metadata, process start/version, the configuration-directory path, lifecycle epochs, optional vim mode, and request digests under the plugin's private `state/claude/` directory. Prompt bodies, assistant responses, transcript files, tool inputs/outputs, account data and cost/rate-limit fields are not stored or logged. Tool input is hashed for request identity; transcripts are never opened. The status-line wrapper passes its input to the user's existing command, whose behavior remains their own.

Subagent/teammate hook events are ignored. A status-line callback cannot establish or replace the root session identity. A different root ID revokes the old record; a fresh matching status-line report is required for controls. Losing that heartbeat for 15 seconds disables controls and invalidates captured presses. Lifecycle writes serialize for up to one second; a skipped lifecycle write marks the record invalid until a subsequent root SessionStart or UserPromptSubmit report; status-line refreshes cannot repair it. Missing, changed, expired, ambiguous or unsupported records disable native controls and invalidate old bindings, including when the same session record later returns. Claude uses hook lifecycle/input epochs rather than Codex daemon turn IDs. Native status can override a stale working hook after an interrupt.

Fresh status-line data supplies the actual model, effort and custom/AI-generated session name. Unavailable titles use a short session-ID label; aliases still override it. Model/effort captions expire after 15 seconds without fresh status-line data. This preview also requires the matching heartbeat for native controls, so install the status-line bridge along with the hooks. Custom `--agent` status-line payloads are not enabled yet. Native permission mode is not presented as a continuously verified setting.

In Rex, submissions require a recognized bordered Claude composer, a matching visible cursor, session/lifecycle identity and unchanged input digests. Send consumes its staged token before the write; edited/manual submissions, failed reads and changed sessions invalidate it. Only plain text is accepted. Vim modes other than visibly confirmed INSERT, unfamiliar footers, very narrow/wrapped views and overlays are refused. Custom status lines can prevent verification; a custom keybindings file explicitly disables controls. No uncertain submission is retried.

Questions and approvals require the matching hook request and a recognized native option list. Request bodies and selection styling are rechecked before a single key. Confirm accepts the choice actually shown. A multi-select toggle appears only with a native Space hint. Unrecognized questions, free-text fields and authentication dialogs require the keyboard. An Interrupt is a request, not proof of termination; it requires a visible interrupt hint and is sent once per lifecycle epoch. Claude can continue queued work or background tasks according to its native behavior.

## Remove the optional integration first

Before uninstalling the Stream Deck plugin, preview and then remove its Claude hooks/status-line wrapper while the files still exist:

```sh
node "$plugin_dir/configure-claude.js" --remove
node "$plugin_dir/configure-claude.js" --remove --apply
```

Removal deletes only exact owned hook commands. It restores the saved original status line only if the active command still belongs to this integration; a subsequent user customization is preserved. Then follow [plugin/profile uninstall](UNINSTALL.md). Keep the setup record and private backup until removal succeeds. If the plugin is already gone, manually remove only hook commands pointing to its `claude-hook.js` and restore the previous status-line command from the saved record/backup; do not replace unrelated settings or delete the Claude configuration directory.

## Automated coverage and remaining gates

Five added regression groups cover metadata privacy and lifecycle ordering; PID/start/version/session isolation; subagent refusal; private records; setup/upgrade/removal and preservation; guarded picker/session-only apply; staged/edited/uncertain Send; Claude-specific Queue/Send-now; question/approval changes and checkbox toggles; mixed banks, Collapse and replacement processes; provider-specific artwork/captions and Codex-cache isolation; and scoped Herdr keys with no composer writes. The full suite has **33 groups**, plus seven distribution tests.

Before enabling by default or merging to a release: validate hook ancestry/file-watcher behavior with the native installer, status-line chaining and live renames, the exact native modal/composer layouts, default and customized keybindings, permission/checkbox prompts, session-only model/effort persistence, draft/queue semantics, focus changes, restart/reconnect and physical mixed-bank navigation. No live or physical Claude check has been claimed in this preview.

References: [Claude hooks](https://code.claude.com/docs/en/hooks), [status-line fields](https://code.claude.com/docs/en/statusline), [interactive controls](https://code.claude.com/docs/en/interactive-mode), [model and session-only effort selection](https://code.claude.com/docs/en/model-config).
