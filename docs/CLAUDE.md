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
| Interrupt | One Escape, current lifecycle and visible interrupt-hint checks | Same; scoped to explicit pane |
| Review / Tests / Continue and guarded Send | Implemented for recognized composer | Unavailable; cursor API missing |
| Queue / Steer | Enter queues; Ctrl+X Ctrl+S sends now | Unavailable; cursor API missing |
| Permission modes / Plan | Keyboard only; Mode is informational | Keyboard only |
| Stop background tasks/terminals | Not implemented for Claude | Not implemented for Claude |

**Model** and **Effort** now cycle directly from Home and show the current value. Model cycles the available concrete models in the native picker’s primary list, skipping Default duplicates and More models. It retains effort where the next model supports it. Effort advances through the native levels and wraps at the upper bound to Low, respecting native caps. Both controllers use the same flow.

A press opens the native picker, verifies the selection, changes it and uses Claude’s visible `s` action to apply only to the current session. It never sends Enter to save a default. Typed drafts are preserved; Herdr’s text-only view is used only for this non-submitting configuration shortcut. Unknown dialogs, changed lists, focus/session changes, unsupported bindings and unverified results stop the operation. Credit/consent prompts are never accepted automatically. No inference request is sent by a configuration cycle.

The normal Claude Home row keeps Zoom in the middle. The Codex Reviewer key becomes a Claude information key. Mode says Use keyboard because Claude's permission-mode cycle can include Accept edits, Bypass and Auto; it is not equivalent to Codex Plan/Default. The integration does not automatically cycle those modes, accept an approval or create permission rules.

## Optional setup for later live validation

Do not follow these steps just to run the fixture tests. The local physical test installed these hooks with a backup; downloaded builds still leave them opt-in.

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

Select the intended Rex Agents or Herdr Agents profile. In a key’s settings, explicitly enable **Claude native controls after hook setup**. In Rex, visible-pane consent is still required. In Herdr, choose the intended local session socket; Claude identity does not require `/title thread-id`. Reselect the desired agent after changing opt-in or controller settings.

## Metadata, identity and input guards

The helper reads hook/status-line JSON in memory. It stores only session/name/model/effort metadata, process start/version, the configuration-directory path, lifecycle epochs, optional vim mode, and request digests under the plugin's private `state/claude/` directory. Prompt bodies, assistant responses, transcript files, tool inputs/outputs, account data and cost/rate-limit fields are not stored or logged. Tool input is hashed for request identity; transcripts are never opened. The status-line wrapper passes its input to the user's existing command, whose behavior remains their own.

Subagent/teammate hook events are ignored. A status-line callback cannot establish or replace the root session identity. A different root ID revokes the old record; a fresh matching status-line report is required for controls. Losing that heartbeat for 15 seconds disables ordinary controls and invalidates captured presses. A known root chat retains its selected dot through freshness changes. A picker opened by the deck, or an exact waiting request from an already confirmed root, can continue for up to five minutes while Claude pauses status-line updates, provided the root identity and default keybindings still match and each fresh native dialog read is recognized. Lifecycle writes serialize for up to one second; a skipped lifecycle write marks the record invalid until a subsequent root SessionStart or UserPromptSubmit report; status-line refreshes cannot repair it. Missing, changed, expired, ambiguous or unsupported records disable native controls and invalidate old bindings, including when the same session record later returns. Claude uses hook lifecycle/input epochs rather than Codex daemon turn IDs. Native status can override a stale working hook after an interrupt.

Fresh status-line data supplies the actual model, effort and custom/AI-generated session name. Unavailable titles use a short session-ID label; aliases still override it. Model/effort captions expire after 15 seconds without fresh status-line data. This preview also requires the matching heartbeat for native controls, so install the status-line bridge along with the hooks. Custom `--agent` status-line payloads are not enabled yet. Native permission mode is not presented as a continuously verified setting.

In Rex, submissions require a recognized bordered Claude composer, a matching visible cursor, session/lifecycle identity and unchanged input digests. Send consumes its staged token before the write; edited/manual submissions, failed reads and changed sessions invalidate it. Only plain text is accepted. Vim modes other than visibly confirmed INSERT, unfamiliar footers, very narrow/wrapped views and overlays are refused. Custom status lines can prevent verification; a custom keybindings file explicitly disables controls. No uncertain submission is retried.

Questions and approvals require the matching hook request and a recognized native option list. Request bodies and selection styling are rechecked before a single key. Confirm accepts the choice actually shown. A multi-select Toggle appears for a native Space hint or the verified checkbox/header/Submit layout. On Home, Review opens the native answer review without submitting; the button then becomes Submit. A captured Review press cannot become Submit after the transition. The exact recognized question review remains actionable when Herdr reports it as done, while the matching private question is still open. Unrecognized questions, free-text fields and authentication dialogs require the keyboard. An Interrupt is a request, not proof of termination; it requires a visible interrupt hint and is sent once per lifecycle epoch. A transient native redraw disables uncertain dialog input while retaining an independently verified root selection; UI epochs keep old approval presses invalid after the view recovers. Claude can continue queued work or background tasks according to its native behavior.

## Remove the optional integration first

Before uninstalling the Stream Deck plugin, preview and then remove its Claude hooks/status-line wrapper while the files still exist:

```sh
node "$plugin_dir/configure-claude.js" --remove
node "$plugin_dir/configure-claude.js" --remove --apply
```

Removal deletes only exact owned hook commands. It restores the saved original status line only if the active command still belongs to this integration; a subsequent user customization is preserved. Then follow [plugin/profile uninstall](UNINSTALL.md). Keep the setup record and private backup until removal succeeds. If the plugin is already gone, manually remove only hook commands pointing to its `claude-hook.js` and restore the previous status-line command from the saved record/backup; do not replace unrelated settings or delete the Claude configuration directory.

## Automated coverage and remaining gates

Five added regression groups cover metadata privacy and lifecycle ordering; PID/start/version/session isolation; subagent refusal; private records; setup/upgrade/removal and preservation; guarded picker/session-only apply; staged/edited/uncertain Send; Claude-specific Queue/Send-now; question/approval changes and checkbox toggles; mixed banks, Collapse and replacement processes; provider-specific artwork/captions and Codex-cache isolation; and scoped Herdr keys with no composer writes. The full suite has **36 groups**, plus eight distribution tests, including separate-profile routing and preference migration.

Before enabling by default or merging to a release: validate hook ancestry/file-watcher behavior with the native installer, status-line chaining and live renames, the exact native modal/composer layouts, default and customized keybindings, permission/checkbox prompts, session-only model/effort persistence, draft/queue semantics, focus changes, restart/reconnect and physical mixed-bank navigation. Only the checks explicitly recorded here are validated; other native and physical paths remain pending.

References: [Claude hooks](https://code.claude.com/docs/en/hooks), [status-line fields](https://code.claude.com/docs/en/statusline), [interactive controls](https://code.claude.com/docs/en/interactive-mode), [model and session-only effort selection](https://code.claude.com/docs/en/model-config).

## Local physical validation in progress — November 7, 2026

- Installed hooks/status-line bridge with a private settings backup; settings outside those two fields matched the backup exactly. Existing agents were not restarted.
- Enabled Claude controls for Rex. Physical third-agent selection and a manually typed print-only response established the root identity; model Opus 5.5 and Medium effort read back.
- Fixed the actual native prompt delimiter (NBSP after ❯); the corrected composer preflight passed against the live idle viewport.
- Physical Model opened the native picker. Its recognized footer explicitly offers session-only apply.
- Picker pauses the native status line; discovered a resulting selection loss and added modal/readiness handling plus stable same-root selection and regression checks. The physical 20-second picker retest retained the dot. Physical model navigation and session-only Apply selected Sonnet; effort Right selected High, Apply committed it, and the original Opus / Medium values were restored. Global settings outside hooks/statusLine were unchanged.
- One-press cycles supersede the manual model/effort picker flow. Live Rex API checks passed Opus → Sonnet and Medium → High → Xhigh → Max → Low → Medium; model changes took about 1.7 seconds and effort changes 1.4–1.8 seconds in the disposable agent. The Rex physical Effort cycle and direct Model cycle passed on Home. A transient redraw initially cleared the selection after Model; the corrected build passed the physical retest with the dot retained. Herdr API and physical Model/Effort cycles passed with the dot and Home page retained.
- Herdr physical single-choice Down/Confirm accepted Blue. The first waiting-key optimization felt faster physically but retained noticeable arrow lag. The second removes the post-arrow refresh wait, uses parallel snapshot pairs, and validates navigation once immediately before sending against the exact root/request and unchanged prompt body. Confirm retains fresh preflight and exact-view checks. Two consecutive arrows measured 221 and 424 ms locally versus 1162 and 1272 ms through the prior installed path. The second physical Down → Up → Down retest kept up well and finished with Blue selected. The measurements are local API samples, not a hardware latency guarantee. Individual read-only Herdr RPCs sometimes took approximately 100 ms. Changed viewport body/focus/request/terminal/scroll and style-only mid-read changes still refuse input.
- Real permission callbacks can omit the tool ID. The hook helper now preserves the earlier PreToolUse ID only for an identical tool-input digest within the same turn; mismatched bodies and parallel completions cannot clear a waiting prompt. No question, command or answer text is stored. The new live color question retained its tool ID and physical completion returned to Done. Native No/Esc can omit completion and Stop hooks. Recovery now requires native idle/done, a fresh post-request heartbeat and a verified empty composer; drafts, still-visible prompts and stale metadata remain Unknown. The private lifecycle record is never rewritten by this reconciliation.
- Remaining approval, multi-select, running and Rex submission checks are pending.
- Physical Confirm after the revised arrow path accepted Blue and returned the deck to its ready controls.
- The first Herdr print-only approval navigation test moved once, then refused further arrows because Claude hides the optional "Tab to amend" footer hint away from choice 1. Approval request comparison now normalizes that footer while preserving the complete command and option list; Confirm still checks the full styled viewport. Regression coverage reproduces the real footer transition. The test prompt was cancelled without submitting a Yes choice; the corrected physical retry is pending.
- Corrected physical arrows reached No, but Confirm exposed a blinking chat activity marker above the dialog. Recognized Bash approvals now bind the complete bordered approval panel, including all command/choice text and styled selection, rather than unrelated chat repainting. Bounded retries repeat only snapshot reads; no input is retried. Real CRLF and styled padding are covered by fixtures. A native API test navigated three arrows, verified No, denied once and returned to an empty composer; ready recovery was verified against the same running process. The installed physical retry passed: Confirm closed the No prompt and restored Model/Effort controls.
- Agent waiting status now reads CHOICE for permission prompts; contextual choice subtitles use the same wording. Internal approval policies and mode names are unchanged.
- Physical Herdr Allow once passed for a print-only command, returned exactly CLAUDE_ALLOW_ONCE_OK and restored Model/Effort. Fingerprints of global and project settings/local-settings files were unchanged, including absent files; no persistent allow rule was saved.
- Physical Herdr Esc passed on a separate print-only approval, restoring Model/Effort and an empty composer. The same global/project settings fingerprint checks passed.
- A native API multi-select test passed Red/Blue Space toggles, Review with both answers, explicit Submit, exact CLAUDE_MULTI_RED_BLUE response and ready recovery. Native checkboxes omit the Space footer hint and the review page omits the ordinary navigation footer; those exact layouts now have regression coverage. Physical Toggle/Review/Submit remains pending.
- Remaining latency includes Herdr 0.9.5's [100 ms pending-read polling](https://github.com/herdrdev/herdr/blob/v0.9.5/src/api/server.rs#L738-L779). Local read-only RPC timings showed approximately 100 ms spikes consistent with that server-side interval. Approval arrows still felt laggy physically, so responsiveness is not signed off.
