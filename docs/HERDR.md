# Herdr backend (experimental)

> **Not in the first release.** DeckShep's first release ships only the Rex
> profile (owner decision, 2026-11-10). This backend stays in source; build with
> `experimental.herdr: true` in `config.json` to add its profile for testing.

The experimental backend supports agents running in **Herdr TUI 0.9.5, socket protocol 22**, initially on a local Mac. The 1.2.1 baseline passed local physical Codex checks, with Rex restored afterward. Rex remains the default backend in distributed settings.

The adapter uses Herdr's documented public socket API and the schema bundled with the installed CLI. It connects only to the session socket explicitly selected in preferences. It never starts, stops, upgrades or attaches to a server automatically.

The 1.3.1 development preview also adds [Claude and mixed-agent routing](CLAUDE.md). Claude identity uses its own optional hook records; the Codex title-ID adapter is never used for Claude. Claude validation is in progress. The [Herdr validation record](validation/2026-11-06-herdr.md) identifies the tested Codex paths; see the [Claude record](validation/2026-11-07-claude.md) for later Claude checks.

## Setup

1. Run a local Herdr session with Codex connected to its existing local daemon. Codex command-line configuration overrides can force embedded mode, which has no accessible daemon for these controls.
2. Select **Herdr** in Stream Deck’s profile selector. In a key’s settings, enter the session socket, for example `~/.config/herdr/sessions/NAME/herdr.sock`.
3. Enable **Match Codex thread-ID titles (experimental)**. It is off by default.
4. In each intended Codex pane, with an empty composer, run `/title thread-id`. Use this title item alone. Select the agent on the deck.

This native slash command changes the current chat's title display without persisting global settings. In Codex 0.166.0 it resets after `/new`; reapply it and reselect the agent. The plugin never types the command or changes global Codex settings for you. Titles, process identity and the same process's daemon must agree before native controls are enabled. Missing or ambiguous identities disable native controls, and losing or changing an established binding clears deck selection. An old press remains invalid after the same title is restored.

The adapter does not use hook-reported session claims as authority for native controls. The upstream shared-daemon issue can leave those claims missing or misattributed. Title matching does not repair Herdr's own saved session references or restore behavior.

Herdr focus checks use its API; they do not use the clipboard. Switch back using Stream Deck’s **Rex** profile. Navigation and connection settings are independent; switching clears tracked pending submissions. See [profile behavior](PROFILES.md).

## Controls

| Control | Implementation |
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

The public pane-read result supplies text and revision but no composer cursor. The adapter therefore cannot safely tell typed input from ghost suggestions or prove the editing position. It does not substitute a text-only guess for the Rex draft checks. On Herdr, the Prompts page displays **Use Herdr keyboard**, and the running row omits Steer and Queue.

Backend focus is the session API's focused pane, not proof of which of several attached terminal clients is in front. Multiple-client behavior requires live validation. The adapter does not bring an outer terminal app to the foreground.

## Verification and limits

Each ordinary request opens a fresh connection for Herdr 0.9.5. The adapter checks
protocol 22, foreground process ownership, pane/terminal identity, native focus,
scroll position and current request/view before input. Timeouts never retry a
mutation. Fixture tests include fragmented UTF-8, private endpoint permissions,
malformed replies, disconnects and stale controls.

Codex title binding accepts only an entire native UUID or its exact 29-character
UUID prefix followed by three ASCII dots. It requires a unique match across all
loaded-ID pages in that foreground process's daemon, matching cwd, an interactive
root thread and known daemon versions (0.166.0/0.167.0). Missing identity, changes
in title/foreground/server generation, or a new binding invalidate old presses.
Hook-reported chat references and human chat names are not independent authority.

Local API and physical results, including the shared-daemon hook investigation,
are retained in [the November 6 validation record](validation/2026-11-06-herdr.md).
Remaining release gates are in [the beta checklist](BETA-CHECKLIST.md). Reconnect,
multiple attached clients, physical overflow/Collapse and outer-terminal
presentation still need validation. Draft-submission parity requires a trustworthy
composer cursor and terminal mode API; use the Herdr keyboard for those controls.

References: [Herdr socket API](https://herdr.dev/tui/docs/socket-api/),
[agent identity and lifecycle](https://herdr.dev/tui/docs/agents/).
