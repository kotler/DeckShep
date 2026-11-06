# Herdr backend (experimental)

This branch adds support for agents running in **Herdr TUI 0.9.5, socket protocol 22**, initially on a local Mac. Rex remains the default backend. The installed Rex beta is separate from this development branch.

The adapter uses Herdr's documented public socket API and the schema bundled with the installed CLI. It connects only to the session socket explicitly selected in preferences. It never starts, stops, upgrades or attaches to a server automatically.

## Setup

1. Run a local Herdr session and enable its official Codex integration. The integration supplies the agent's native chat ID.
2. In a Stream Deck key's settings, choose **Controller → Herdr (experimental)**.
3. Enter the session socket, for example `~/.config/herdr/herdr.sock` or `~/.config/herdr/sessions/NAME/herdr.sock`.
4. Select the agent on the deck. The local foreground process must be owned by the current user, and its native chat must agree with the reported process directory.

Herdr focus checks use its API; they do not use the clipboard. Switching controllers clears selection and pending actions. Switch back to Rex in the same settings to use the existing Rex profile and its saved preferences.

## Controls

| Control | Implementation on this branch |
| --- | --- |
| Agent row, bank, Next agent, Collapse | Herdr topology and foreground identity; stable slot behavior shared with Rex |
| Zoom | Explicit pane target through Herdr |
| Model, Effort, Reviewer | Existing guarded Codex daemon controls, bound to Herdr's official native session reference |
| Plan / Default | One native Shift+Tab key; verified native mode readback |
| Interrupt | Active native turn verification, then one explicit Escape key |
| Stop terminals | Existing ended-turn and exact terminal-ID checks |
| Questions and approval choices | Native Codex waiting flags, foreground ownership, pane identity and current-view checks |
| Review / Tests / Continue / Send | Unavailable; use the Herdr keyboard |
| Steer / Queue | Unavailable; use the Herdr keyboard |

Codex gets native controls. Other foreground agents whose executable matches Herdr's detected agent kind can appear for status, focus and Zoom; their native settings and input controls are not verified.

The public pane-read result supplies text and revision but no composer cursor. This branch therefore cannot safely tell typed input from ghost suggestions or prove the editing position. It does not substitute a text-only guess for the Rex draft checks. On Herdr, the Prompts page displays **Use Herdr keyboard**, and the running row omits Steer and Queue.

Backend focus is the session API's focused pane, not proof of which of several attached terminal clients is in front. Multiple-client behavior requires live validation. The adapter does not bring an outer terminal app to the foreground.

## Verification

Automated tests cover the real newline-delimited Unix-socket transport against isolated fake servers, including split UTF-8 frames, endpoint permissions, unsupported versions, malformed replies, disconnects, timeouts and no mutation replay. Fixture tests cover foreground/process/session replacement, native waiting states, explicit pane actions, stale presses, changed approval views, scroll position and controller changes during an active action. These are not evidence of live Herdr or physical-key compatibility.

Remaining live checks, in a named disposable session:

- [ ] Confirm actual foreground identity, integration chat ID, focus and display labels.
- [ ] Exercise banks, Next agent wraparound, stable gaps and Collapse.
- [ ] Verify Zoom and host-terminal presentation.
- [ ] Verify model, effort, reviewer and Plan readback with full permission boundaries unchanged.
- [ ] Exercise Interrupt and background-terminal Stop separately.
- [ ] Exercise native multiple-choice and approval prompts; confirm view/selection guards.
- [ ] Verify reconnect/version refusal and switching back to Rex.

Full draft-submission parity requires an API exposing a trustworthy input cursor and terminal mode alongside a consistent current-pane snapshot.

References: [Herdr socket API](https://herdr.dev/tui/docs/socket-api/), [agent identity and lifecycle](https://herdr.dev/tui/docs/agents/). Protocol details were also checked against the installed 0.9.5 schema.
