# Herdr backend (experimental)

This branch adds support for agents running in **Herdr TUI 0.9.5, socket protocol 22**, initially on a local Mac. Rex remains the default backend. The installed Rex beta is separate from this development branch.

The adapter uses Herdr's documented public socket API and the schema bundled with the installed CLI. It connects only to the session socket explicitly selected in preferences. It never starts, stops, upgrades or attaches to a server automatically.

## Setup

1. Run a local Herdr session with Codex connected to its existing local daemon. Codex command-line configuration overrides can force embedded mode, which has no accessible daemon for these controls.
2. In a Stream Deck key's settings, choose **Controller → Herdr (experimental)** and enter the session socket, for example `~/.config/herdr/sessions/NAME/herdr.sock`.
3. Enable **Match Codex thread-ID titles (experimental)**. It is off by default.
4. In each intended Codex pane, with an empty composer, run `/title thread-id`. Use this title item alone. Select the agent on the deck.

This native slash command changes the current chat's title display without persisting global settings. In Codex 0.166.0 it resets after `/new`; reapply it and reselect the agent. The plugin never types the command or changes global Codex settings for you. Titles, process identity and the same process's daemon must agree before native controls are enabled. Missing or ambiguous identities disable native controls, and losing or changing an established binding clears deck selection. An old press remains invalid after the same title is restored.

The adapter does not use hook-reported session claims as authority for native controls. The upstream shared-daemon issue can leave those claims missing or misattributed. Title matching does not repair Herdr's own saved session references or restore behavior.

Herdr focus checks use its API; they do not use the clipboard. Switching controllers clears selection and pending actions. Switch back to Rex in the same settings to use the existing Rex profile and its saved preferences.

## Controls

| Control | Implementation on this branch |
| --- | --- |
| Agent row, bank, Next agent, Collapse | Herdr topology and foreground identity; stable slot behavior shared with Rex |
| Zoom | Explicit pane target through Herdr |
| Model, Effort, Reviewer | Guarded Codex daemon path, with explicit title-ID binding; live API changes and restoration verified |
| Plan / Default | One native Shift+Tab key; live Plan/Default round-trip verified |
| Interrupt | Active native turn verification, then one explicit Escape key |
| Stop terminals | Existing ended-turn and exact terminal-ID checks |
| Questions and approval choices | Native Codex waiting flags, foreground ownership, pane identity and current-view checks |
| Review / Tests / Continue / Send | Unavailable; use the Herdr keyboard |
| Steer / Queue | Unavailable; use the Herdr keyboard |

Codex gets native controls only with a verified, opted-in title binding. Other foreground agents whose executable matches Herdr's detected agent kind can appear for status, focus and Zoom; their native settings and input controls are not verified.

The public pane-read result supplies text and revision but no composer cursor. This branch therefore cannot safely tell typed input from ghost suggestions or prove the editing position. It does not substitute a text-only guess for the Rex draft checks. On Herdr, the Prompts page displays **Use Herdr keyboard**, and the running row omits Steer and Queue.

Backend focus is the session API's focused pane, not proof of which of several attached terminal clients is in front. Multiple-client behavior requires live validation. The adapter does not bring an outer terminal app to the foreground.

## Verification

Ordinary requests use a fresh Unix-socket connection because Herdr 0.9.5 closes it after one response. Live testing caught and corrected an initial persistent-connection assumption. Automated tests cover this lifecycle and the real newline-delimited transport against isolated fake servers, including split UTF-8 frames, endpoint permissions, unsupported versions, malformed replies, disconnects, timeouts and no mutation replay. Fixture tests cover foreground/process/session replacement, native waiting states, explicit pane actions, stale presses, changed approval views, scroll position and controller changes during an active action. Waiting-context tests bind presses to the prompt body, preserving whitespace and ignoring only numbered-option selection markers. A changed approval selection style during an action is also refused. These fixture tests are not evidence of physical-key compatibility.

Live API checks on November 6, 2026 used a separate named headless session, leaving the user's open Herdr session untouched:

- [x] Actual 0.9.5/protocol 22 handshake, topology, foreground process ownership and directories.
- [x] Official `herdr:codex` chat references from embedded agents after their first completed turn; titles retained when daemon metadata is unavailable.
- [x] Six live agents, forward Next-agent wraparound, a stable closed slot and explicit Collapse preserving relative order.
- [x] Explicit pane focus and Zoom round-trip in a split layout.
- [x] Missing native identity refused a settings operation before any write.
- [x] After stopping the owned test session, offline discovery was refused without discarding known slots.
- [x] Test session stopped; original Rex agent PIDs remained running. Global Codex configuration and hooks matched their original SHA-256 hashes.
- [ ] Physical keys, bank captions and outer-terminal presentation.
- [x] Opt-in title-bound Model, Effort and Reviewer changes, with restoration and full settings comparisons. Plan/Default round-trip restored the original settings hash; Plan uses its own native effort preset.
- [x] Native Interrupt confirmed the active turn was interrupted; scoped Stop terminated its remaining background sleep.
- [x] A native multiple-choice answer and one-time print-only approval passed with title matching.
- [ ] Broader approval choices, including Deny and Esc, in Herdr.
- [ ] Actual reconnect, multiple attached clients and installed controller switching.

### Hook identity limitation

The installed Codex 0.166.0 warning explains that command-line configuration overrides (`-c`, `--enable`, `--disable`, `--search`) require embedded mode. The isolated agents started with `-c` supplied official Herdr chat references after a harmless first turn, but had no accessible shared daemon. A fresh agent started without these overrides did connect to the existing daemon, but Herdr did not report its native chat reference, including after a completed turn. An explicit remote-daemon connection also lacked the reference. No user agent or existing daemon was restarted to change this behavior.

Native controls require both independently verified pieces. The adapter refuses to guess a chat from its title, footer text, directory or the daemon's loaded-chat list. Build 1.2.1 adds the opt-in title-ID adapter described above; the earlier hook-only path is no longer used for native control identity. The source branch and package remain experimental; the installed validated Rex plugin has not been replaced.

### Chat-ID investigation — November 6, 2026

The missing reference matches an existing upstream limitation, rather than a missing hook installation. Herdr 0.9.5's managed Codex hook v10 requires `HERDR_ENV=1`, `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` in its own process environment. The installed hook matches the upstream implementation. The existing Codex daemon had none of these three variables. Codex 0.167.0's hook registry snapshots the server process environment, and its command runner replays that snapshot when launching hooks. Its daemon README explicitly states that per-client environment isolation is not provided. A new terminal's correct pane environment therefore does not supply the missing hook context.

An isolated reproduction ran the installed hook against a private capture socket with fixture IDs, without calling any real Herdr API. With no Herdr environment it exited successfully and sent zero reports. Supplying the pane context produced one report. A mismatched inherited `CODEX_THREAD_ID` and a missing transcript path each produced zero reports. This establishes the hook's gates; it does not claim to have instrumented a real SessionStart invocation inside the user's daemon.

Herdr tracks this in [#4649](https://github.com/herdrdev/herdr/issues/4649) and [#4814](https://github.com/herdrdev/herdr/issues/4814). The maintainer identifies the shared daemon's inherited environment as the problem and is waiting on Codex. The relevant Codex requests are [hook-specific client context #44902](https://github.com/openai/codex/issues/44902) and [terminal misattribution #48500](https://github.com/openai/codex/issues/48500). Their proposed configuration is not an available setting. Disabling the daemon is the documented temporary workaround, but removes the daemon access required by this plugin's native controls. Restarting the shared daemon from one Herdr pane would also not establish independent identities for other panes.

Upstream reports also describe existing hook references pointing to the wrong pane or a child thread. That was not reproduced on this host, whose daemon has no Herdr context. It nevertheless means a reported `herdr:codex` ID plus matching directory is not independent proof of the displayed chat. The title-ID adapter therefore ignores hook claims and binds to the displayed native ID in the foreground pane, even when a hook claim is populated.

A bounded alternative was probed in two disposable daemon-backed TUIs in the same project:

- The native session-only command `/title thread-id` made Herdr expose distinct thread-ID prefixes for both panes. Each prefix uniquely matched a loaded ID in that foreground process's daemon; the full ID, directory and displayed native footer agreed in this controlled test.
- Codex 0.166.0 truncates each title item to 32 characters: a 29-character UUID prefix followed by `...`. Any future resolver must require an explicit title-ID mode, a complete unique match, stable foreground/process/server identity and fresh title reads. It must refuse missing, truncated-beyond-recognition or ambiguous matches and subagent references. A human chat-name match is not equivalent.
- After `/new` and choosing the current worktree, the session-only title setting reset to the default project title. Reapplying `/title thread-id` exposed the new ID without changing the TUI PID; the other pane retained its original ID. Automatic new/resume/fork tracking is not validated.
- At the investigation checkpoint the title route was not implemented. Build 1.2.1 now implements it behind explicit opt-in; it still does not repair Herdr's own saved native session references.

Both disposable TUIs and their named server were removed. Global Codex configuration and hooks retained their original hashes, and the original Rex agents remained running. No runtime or installed-plugin change was made for this investigation.

Source references: [Herdr v0.9.5 hook](https://github.com/herdrdev/herdr/blob/v0.9.5/src/integration/assets/codex/herdr-agent-state.sh), [Codex v0.167.0 hook registry](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/hooks/src/registry.rs), [Codex daemon environment contract](https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-daemon/README.md), [native title commands](https://learn.chatgpt.com/docs/developer-commands#configure-terminal-title-items-with-title).

Full draft-submission parity requires an API exposing a trustworthy input cursor and terminal mode alongside a consistent current-pane snapshot.

References: [Herdr socket API](https://herdr.dev/tui/docs/socket-api/), [agent identity and lifecycle](https://herdr.dev/tui/docs/agents/). Protocol details were also checked against the installed 0.9.5 schema.

## Title-ID adapter validation — build 1.2.1

The resolver accepts only an entire UUID title or Codex's exact 29-character UUID prefix followed by three ASCII dots. It reads all loaded-ID pages from the daemon connected to the foreground process and requires one unique match, a matching directory and an interactive root thread with no parent. Known daemon versions are 0.166.0 and 0.167.0. It rechecks the socket generation and then rereads the pane's title, terminal generation and foreground identity. Hooks, human names, transcript files and recency are not fallback identity sources.

Binding generations invalidate old presses even if a missing title is later restored to the same ID. Changing identity preferences rebuilds the adapter after any active action finishes. Metadata caches and settings captions are isolated by binding generation; delayed metadata cannot replace fresh native turn or background-terminal identities. A new active turn is checked again before a native Interrupt key.

Live checks used two disposable, read-only agents in the same project on the existing daemon:

- Both were independently identified and their model/effort metadata read correctly.
- Model, Effort and Reviewer were changed through the actual adapter and restored; the untouched agent's full settings stayed unchanged.
- Native Plan/Default toggling restored the entire original settings snapshot.
- Removing the title disabled native controls and cleared selection; an old captured Model action was refused. Restoring the title did not revive that captured action.
- Interrupt stopped the verified active turn; a separate scoped Stop terminated its remaining background sleep.
- A native multiple-choice question accepted Blue through the adapter. A one-time approval executed only its intended print command and retained the full settings snapshot.
- A native new chat changed the ID without restarting the TUI. Reapplying the title established a new binding; the old chat's captured action was refused and the second agent stayed unchanged.

Automated resolver tests cover complete pagination, collisions across pages, missing/duplicate/malformed IDs, wrong folders, subagents, unsupported versions and socket replacement. Adapter tests cover title/process changes during verification, changed active turns and rebindings. Physical Stream Deck validation remains outstanding; this build has not replaced the installed Rex beta.
