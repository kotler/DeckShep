# Claude Code and mixed agent banks (development preview)

Implemented on `codex/claude-mixed-agent-support`, version **1.3.4**. At the November 7, 2026 checkpoint, physical Model/Effort cycles passed in Rex and Herdr; Herdr single-choice and Deny/Allow once/Esc approval checks passed. Native multi-select Toggle/Review/Submit passed through the API, with the physical check still pending. Claude running/Zoom controls and Rex question/approval/submission checks remain pending. The earlier Codex hardware results do not validate these new Claude paths.

Claude and Codex share discovery, stable slots, bank cycling, Next agent, Collapse, selection dots and project/status labels within the chosen controller. Selecting an agent changes the contextual controls for its provider. Each controller still connects to its own Rex or explicit Herdr session; this does not aggregate Rex and Herdr into one bank.

## Capabilities

| Feature | Claude in Rex | Claude in Herdr |
| --- | --- | --- |
| Discovery, selection, banks, Next agent, Collapse, Zoom | Implemented | Implemented |
| Session identity, title, model and effort | Optional local metadata integration | Same integration; independent of Codex title matching |
| Model / Effort | One-press session-only cycles | One-press session-only cycles |
| Native question / approval navigation and Confirm / Esc | Guarded native keys | Guarded native keys, pane must be at bottom |
| Multiple-select question | Toggle for verified checkbox layouts; Home Review then Submit | Same |
| Interrupt | One Escape, verified working CLI registration or hook lifecycle, and visible interrupt-hint checks | Same; scoped to explicit pane |
| Review / Tests / Continue and guarded Send | Implemented for recognized composer | Unavailable; cursor API missing |
| Queue / Steer | Ctrl+X Enter queues; Ctrl+X Ctrl+S sends now | Unavailable; cursor API missing |
| Permission modes / Plan | Permissions advances one native Shift+Tab step | Keyboard only |
| Stop background tasks/terminals | Not implemented for Claude | Not implemented for Claude |

**Model** and **Effort** now cycle directly from Home and show the current value. Model cycles the available concrete models in the native picker’s primary list, skipping Default duplicates and More models. It retains effort where the next model supports it. On Rex, when Claude shows its native effort badge above the composer, the Effort key displays that level directly. A press opens the built-in `/effort` slider, moves to the next level offered by the current model, applies it to this session with `s`, and checks the resulting badge when visible. If the slider is already open, **Apply effort** shows the highlighted level and applies it with one press. When Claude hides the badge, a trailing `?` marks the last observed level for that focused CLI. If no level has been observed yet, the key shows **Press to cycle**. This works without a configured status line. A configured footer that supplies effort without a native badge continues to use the model picker. Effort advances through the native levels and wraps at the upper bound to Low, respecting native caps. Rex can verify these three idle settings from the foreground native Claude process and its own interactive CLI registration. Enable visible-pane verification and Claude native controls in the Rex profile. DeckShep metadata hooks remain optional for these settings and enable Queue, Steer and native question or approval controls. Interrupt can also use the focused CLI’s busy registration and native Escape hint or working spinner, with an empty composer.

A press opens the native picker, verifies the selection, changes it and uses Claude’s visible `s` action to apply only to the current session. It never sends Enter to save a default. The Rex pane picker requires an empty prompt and default keybindings. The hook-bound path preserves typed drafts; Herdr’s text-only view is used only for this non-submitting configuration shortcut. Unknown dialogs, changed lists, focus/session changes, unsupported bindings and unverified results stop the operation. Credit/consent prompts are never accepted automatically. No inference request is sent by a configuration cycle.

In Rex, Permissions uses Claude’s own permission-mode cycle, which includes Plan and may include Accept edits, Bypass and Auto. Each press advances once from a verified empty composer. An extra confirmation stays open for the user.

## Optional setup for later live validation

Do not follow these steps just to run the fixture tests. The local physical test installed these hooks with a backup; downloaded builds still leave them opt-in.

Prerequisites: local macOS, **native Claude Code** (any release installed under `claude/versions/`; no version is pinned), Node 20+ for the metadata helper, and a running preview plugin. The reader checks the actual foreground PID, owner, executable version, process start time, session ID and matching directory. The npm/wrapper executable path and other Claude versions are not enabled for native controls yet. A custom `keybindings.json` disables native controls in this preview; its bindings have not been validated. The integration never removes or rewrites that file. Signing in to Claude is needed for live agent work, not for the plugin's automated tests. The plugin has no separate Claude login or API key.

After intentionally installing the preview and leaving agents running, preview setup from Terminal:

```sh
plugin_dir="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.kotl3r.deckshep.sdPlugin"
node "$plugin_dir/configure-claude.js"
```

To apply that setup with a backup:

```sh
node "$plugin_dir/configure-claude.js" --apply
```

This explicitly adds only this integration's command hooks to Claude settings and leaves your status line alone ([hooks-only mode](#hooks-only-mode)). DeckShep never changes a Claude Code status line, and `--statusline` is refused.

**Older setups** chained DeckShep's wrapper as the status line. It still works: it forwards the original JSON to your previous command and keeps its output (or shows a simple Claude/model/effort line when there was none), and keeps the 15-second heartbeat check. To return to your own status line and hooks-only mode, choose **Restore your original status line** in the setup panel, or run `node "$plugin_dir/configure-claude.js" --restore-statusline` and then the same with `--apply`. It restores the recorded original only while DeckShep's wrapper is still the status line; one you changed since is left alone. Hooks stay installed.

Setup never modifies authentication, permission rules, sandbox settings or existing unrelated hooks. Settings backups use a `settings.json.deckshep-backup-…` suffix and private permissions.

The default target is `~/.claude/settings.json`, honoring `CLAUDE_CONFIG_DIR`; use `--settings /absolute/settings.json` for a different settings file. To run the script from the checkout while targeting an installed copy, also pass `--plugin-dir "$plugin_dir"`. Hooks reference that absolute installation and Node executable; remove the previous setup before moving either.

Claude normally notices settings-file edits through its watcher; check its read-only `/hooks` menu when validating setup. Identity needs a root SessionStart or UserPromptSubmit event, so an already-open idle chat can remain unverified until its next user-submitted message. The plugin never sends that message or restarts the chat automatically. Project or managed settings can disable/override these hooks; the integration does not bypass those settings.

Select the intended Rex or Herdr profile. In a key’s settings, explicitly enable **Enable Claude native controls**. In Rex, visible-pane consent is still required. In Herdr, choose the intended local session socket; Claude identity does not require `/title thread-id`. Reselect the desired agent after changing opt-in or controller settings.

## Metadata, identity and input guards

The helper reads hook/status-line JSON in memory. It stores only session/name/model/effort metadata, process start/version, the configuration-directory path, lifecycle epochs, optional vim mode, and request digests under the plugin's private `state/claude/` directory. Prompt bodies, assistant responses, transcript files, tool inputs/outputs, account data and cost/rate-limit fields are not stored or logged. Tool input is hashed for request identity; transcripts are never opened. On older setups, the legacy status-line wrapper passes its input to the user's existing command, whose behavior remains their own.

Subagent/teammate hook events are ignored. A status-line callback cannot establish or replace the root session identity. A different root ID revokes the old record. On older setups with the wrapper, a fresh matching status-line report is required for controls; losing that heartbeat for 15 seconds disables ordinary controls and invalidates captured presses. A known root chat retains its selected dot through freshness changes. A picker opened by the deck, or an exact waiting request from an already confirmed root, can continue for up to five minutes while Claude pauses status-line updates, provided the root identity and default keybindings still match and each fresh native dialog read is recognized. Lifecycle writes serialize for up to one second; a skipped lifecycle write marks the record invalid until a subsequent root SessionStart or UserPromptSubmit report; status-line refreshes cannot repair it. Missing, changed, expired, ambiguous or unsupported records disable native controls and invalidate old bindings, including when the same session record later returns. Claude uses hook lifecycle/input epochs rather than Codex daemon turn IDs. Native status can override a stale working hook after an interrupt.

On older setups with the wrapper, fresh status-line data supplies the model, effort and custom/AI-generated session name, and captions expire after 15 seconds without it. Hooks-only setups work as described in [Hooks-only mode](#hooks-only-mode). Unavailable titles use a short session-ID label; aliases still override it. Custom `--agent` status-line payloads are not enabled yet. Native permission mode is not presented as a continuously verified setting.

In Rex, submissions require a recognized bordered Claude composer, a matching visible cursor, session/lifecycle identity and unchanged input digests. Send consumes its staged token before the write; edited/manual submissions, failed reads and changed sessions invalidate it. Only plain text is accepted. Vim modes other than visibly confirmed INSERT, unfamiliar footers, very narrow/wrapped views and overlays are refused. Custom status lines can prevent verification; a custom keybindings file explicitly disables controls. No uncertain submission is retried.

Questions and approvals require the matching hook request and a recognized native option list. Request bodies and selection styling are rechecked before a single key. Confirm accepts the choice actually shown. A multi-select Toggle appears for a native Space hint or the verified checkbox/header/Submit layout. On Home, Review opens the native answer review without submitting; the button then becomes Submit. A captured Review press cannot become Submit after the transition. The exact recognized question review remains actionable when Herdr reports it as done, while the matching private question is still open. Unrecognized questions, free-text fields and authentication dialogs require the keyboard. An Interrupt is a request, not proof of termination; it requires a visible interrupt hint and is sent once per lifecycle epoch. A transient native redraw disables uncertain dialog input while retaining an independently verified root selection; UI epochs keep old approval presses invalid after the view recovers. Claude can continue queued work or background tasks according to its native behavior.

## Hooks-only mode

Hook-bound turn controls use hooks-only mode on setups without the legacy DeckShep status line. For these controls, each refresh and press checks the following:

- **Process proof:** the pane's foreground process is the recorded PID, with the same start time, native executable and version it had when the record was written.
- **Lifecycle proof:** the record's root session was established for this process by a SessionStart or UserPromptSubmit hook. There must be no SessionEnd and no lost-event marker since then. `/clear`, `/resume` and restarts start another session or generation, which re-binds the key identity and refuses older presses.
- **Pane proof:** a fresh read of the native dialog or picker right before input, as for every Claude control.

The existing guards still apply: default keybindings, focus checks, generation/visibility gates, request digests, single-use permits and no retry. An open chat set up before this version shows **Wait for a Claude prompt** until its next prompt or session start. Legacy installs with the DeckShep status line keep the heartbeat check.

Model and Effort read the current setting from the native picker before changing anything. After a session-only change (`s`), the caption comes from the picker state DeckShep verified before pressing `s`, after confirming the session and turn did not change and the draft is intact. Otherwise, captions show the last value a hook reported: SessionStart `model`, PostModelSwitch `to_model`, or the `effort.level` on tool events. A caption older than 30 minutes shows a trailing `?`. Captions are display only and never enable or disable a control. Session names come from `session_title`, which Claude sends only for `--name` or `/rename` titles, so other chats show the short session-ID label.

Setup also registers PostModelSwitch (Claude Code 2.1.251+) to refresh the Model caption. It is optional: the doctor checks only the original lifecycle events, and removal deletes the owned PostModelSwitch entry with the rest.

Reapplying the Claude hook setup also registers StopFailure, Elicitation and ElicitationResult. A terminal failure shows Error. An MCP form shows **Answer in Rex** and a URL request shows **Open browser**. Both are informational keys. A matching result, the originating tool finishing, or a new turn clears the wait. DeckShep stores no form fields, answers or URLs. Existing hook installations can continue using the original events.

### Hook fields on the pinned version

Observed on 2026-11-10 with disposable headless sessions on 2.1.319 and 2.1.322 (the same on both), alongside the [hooks reference](https://code.claude.com/docs/en/hooks):

| Event | `model` | `effort.level` | `session_title` |
| --- | --- | --- | --- |
| SessionStart | Not sent | No | When the session has a name (`--name`, `/rename`) |
| UserPromptSubmit | No | No | When the session has a name |
| PreToolUse / PostToolUse / PermissionRequest | No | Yes | No |
| Stop | No | Yes | No |
| PostModelSwitch | `from_model`, `to_model` | No | No |

So the Model caption stays empty until the first model switch. PostModelSwitch fired for `/model` in a session that kept running; a print-mode session whose only prompt was `/model` ended first (2.1.322 sent only PreModelSwitch). Notification did not fire headless. There is no effort-change event. Whether PostModelSwitch fires for a session-only `s` change in the interactive picker is still a validation item; until then DeckShep relies only on the picker read.

## Remove the optional integration first

Before uninstalling the Stream Deck plugin, preview and then remove its Claude hooks (and any legacy status-line wrapper) while the files still exist:

```sh
node "$plugin_dir/configure-claude.js" --remove
node "$plugin_dir/configure-claude.js" --remove --apply
```

Removal deletes only exact owned hook commands. It restores the saved original status line only if the active command still belongs to this integration; a subsequent user customization is preserved. Then follow [plugin/profile uninstall](UNINSTALL.md). Keep the setup record and private backup until removal succeeds. If the plugin is already gone, manually remove only hook commands pointing to its `claude-hook.js` and restore the previous status-line command from the saved record/backup; do not replace unrelated settings or delete the Claude configuration directory.

## Automated coverage and remaining gates

Five added regression groups cover metadata privacy and lifecycle ordering; PID/start/version/session isolation; subagent refusal; private records; setup/upgrade/removal and preservation; guarded picker/session-only apply; staged/edited/uncertain Send; Claude-specific Queue/Send-now; question/approval changes and checkbox toggles; mixed banks, Collapse and replacement processes; provider-specific artwork/captions and Codex-cache isolation; and scoped Herdr keys with no composer writes. The full suite has **36 groups**, plus eight distribution tests, including separate-profile routing and preference migration.

Before enabling by default or merging to a release: validate hook ancestry/file-watcher behavior with the native installer, the hooks-only fields and flows, legacy status-line restore and live renames, the exact native modal/composer layouts, default and customized keybindings, permission/checkbox prompts, session-only model/effort persistence, draft/queue semantics, focus changes, restart/reconnect and physical mixed-bank navigation. Only the checks explicitly recorded here are validated; other native and physical paths remain pending.

References: [Claude hooks](https://code.claude.com/docs/en/hooks), [status-line fields](https://code.claude.com/docs/en/statusline), [interactive controls](https://code.claude.com/docs/en/interactive-mode), [model and session-only effort selection](https://code.claude.com/docs/en/model-config).

## Validation record

See [the November 7 local validation record](validation/2026-11-07-claude.md) for
passed physical/API checks and observed latency. Physical multi-select,
running/Zoom, Rex submission paths and approval responsiveness remain pending;
[the beta checklist](BETA-CHECKLIST.md) tracks the release gates.
