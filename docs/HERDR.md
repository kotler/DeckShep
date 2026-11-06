# Herdr backend (experimental)

This branch adds support for agents running in **Herdr TUI 0.9.5, socket protocol 22**, initially on a local Mac. Rex remains the default backend. The installed Rex beta is separate from this development branch.

The adapter uses Herdr's documented public socket API and the schema bundled with the installed CLI. It connects only to the session socket explicitly selected in preferences. It never starts, stops, upgrades or attaches to a server automatically.

## Setup

1. Run a local Herdr session and enable its official Codex integration. Advanced controls require both its native chat ID and a verified connection from that foreground Codex process to the local daemon. This combination is not yet verified in live Herdr testing; see the validation gap below.
2. In a Stream Deck key's settings, choose **Controller → Herdr (experimental)**.
3. Enter the session socket, for example `~/.config/herdr/herdr.sock` or `~/.config/herdr/sessions/NAME/herdr.sock`.
4. Select the agent on the deck. The local foreground process must be owned by the current user, and its native chat must agree with the reported process directory.

Herdr focus checks use its API; they do not use the clipboard. Switching controllers clears selection and pending actions. Switch back to Rex in the same settings to use the existing Rex profile and its saved preferences.

## Controls

| Control | Implementation on this branch |
| --- | --- |
| Agent row, bank, Next agent, Collapse | Herdr topology and foreground identity; stable slot behavior shared with Rex |
| Zoom | Explicit pane target through Herdr |
| Model, Effort, Reviewer | Implemented through the guarded Codex daemon path; live validation blocked by native identity/transport availability |
| Plan / Default | Implemented as one native Shift+Tab key; live mode readback not yet verified |
| Interrupt | Active native turn verification, then one explicit Escape key |
| Stop terminals | Existing ended-turn and exact terminal-ID checks |
| Questions and approval choices | Native Codex waiting flags, foreground ownership, pane identity and current-view checks |
| Review / Tests / Continue / Send | Unavailable; use the Herdr keyboard |
| Steer / Queue | Unavailable; use the Herdr keyboard |

Codex gets native controls. Other foreground agents whose executable matches Herdr's detected agent kind can appear for status, focus and Zoom; their native settings and input controls are not verified.

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
- [ ] Native model, effort, reviewer and Plan changes with full settings readback.
- [ ] Interrupt, background-terminal Stop, multiple-choice and approval prompts in Herdr.
- [ ] Actual reconnect, multiple attached clients and installed controller switching.

### Native-control validation gap

The installed Codex 0.166.0 warning explains that command-line configuration overrides (`-c`, `--enable`, `--disable`, `--search`) require embedded mode. The isolated agents started with `-c` supplied official Herdr chat references after a harmless first turn, but had no accessible shared daemon. A fresh agent started without these overrides did connect to the existing daemon, but Herdr did not report its native chat reference, including after a completed turn. An explicit remote-daemon connection also lacked the reference. No user agent or existing daemon was restarted to change this behavior.

Native controls require both independently verified pieces. The adapter refuses to guess a chat from its title, footer text, directory or the daemon's loaded-chat list. Further integration work is required before claiming Herdr native-control compatibility. The source branch and package remain experimental; the installed validated Rex plugin has not been replaced.

Full draft-submission parity requires an API exposing a trustworthy input cursor and terminal mode alongside a consistent current-pane snapshot.

References: [Herdr socket API](https://herdr.dev/tui/docs/socket-api/), [agent identity and lifecycle](https://herdr.dev/tui/docs/agents/). Protocol details were also checked against the installed 0.9.5 schema.
