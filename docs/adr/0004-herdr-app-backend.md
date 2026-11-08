# 0004 — Herdr App foundation, with no production input

Status: source spike complete; native validation remains required.

Revision, 2026-11-08: [ADR 0007](0007-herdr-app-0.1.14-source-review.md)
pins App 0.1.14 and the core 0.1.18 release, distinguishes the earlier
development snapshots, and records the control/read/isolation constraints.
In particular, `terminal.peek` opens an overlay; the richer mod focus/zoom
snapshot is not exposed by the ordinary control socket. Production
capabilities remain empty pending the planned review and native evidence.

Phases 1–1b now provide unwired read-only transports, per-control gates, and
independent App settings/routing under the existing experimental flag. The
preview remains inactive and default builds retain v2. See the current
[implementation checkpoint](../plans/HERDR-APP-PLAN.md); no native capability
claim supersedes the limits recorded here and in ADR 0007.

Sources inspected on 2026-11-07:

- [herdr-app 7fe7ac3](https://github.com/herdrdev/herdr-app/tree/7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8), Cargo version 0.1.13.
- [herdr-core cd12ddd](https://github.com/herdrdev/herdr-core/tree/cd12ddd88bc11490228343291dc1096c9ed3bf77).

The plan's earlier “not documented” assumptions have changed. App
`src/control.rs` documents a per-home `herdr-app.sock`: one JSON line each way,
with `ls`, `status` and `do`; `commands` lists statically without opening a window.
`src/main.rs` implements `--version`. This is separate from TUI protocol 22 and
from core's endpoint. No TUI session or agent can be adopted as an App session.

Core's `schema/README.md` and generated `hc.openrpc.json` describe JSON-RPC 2.0
plain mode, a hello response with generation/version/features, multiplexed
streams and event subscriptions. The schema now documents terminal input and
read methods. Terminal records include addresses, initial PID/cwd and optional
foreground PID/name/argv/cwd, labels and agent status. An initial PID is not proof
of the current foreground agent or of a Codex/Claude chat binding.

App `src/commands.rs` and `src/window.rs` expose `agent.focus`, `pane.focus`,
`pane.zoom` and `terminal.peek`. Core terminal state and App window focus are
different authorities. `src/mods.rs` publishes a focused view; App screens have
independent focus/zoom. Native OS foreground-window truth, exact pane/core
binding across reconnects, composer cursor/edit mode, process lifetime and chat
identity have not been verified by this project.

| Capability | Source surface | Shipped verdict |
| --- | --- | --- |
| discover | App ls / core terminal.list | Fixture only |
| focus / zoom | App actions | Disabled pending native focus proof |
| verifiedFocus / paneIdentity | App focused view + core foreground | Not verified |
| readPane / composerCursor | Core reads; no proven composer binding | Disabled |
| sendKeys | Core input exists | Disabled until full identity/focus validation |
| events | Core subscription/stream API | Not integrated |

`HerdrAppBackend` has no production transport. Only the exact
`fixture:herdr-app:0.1.13` transport version exposes fixture discovery. Every real,
unknown or changed version receives zero capabilities; every input variant is
refused regardless of permit. Reconnect/disposal invalidates generations.

The `experimental.herdrApp` config flag defaults false. A build with it explicitly
true includes a third preview-only profile; the app renders inactive preview
keys. Fixed profile/page IDs are reserved in `scripts/profiles.mjs`. Experimental
preferences use v3; v1/v2 migrate without changing consent, v3 round-trips, and
`rollbackV2` provides an explicit projection. With the flag off, the original v2
codec and wire shape remain in use.

The owner amended the first release on 2026-11-08 to discovery/status and plain
focus requests, without a verified-focus claim, Zoom, contextual input or mod
installation. A separate request-only control must preserve existing verified
focus/input guards; see H1/H4 and Phase 2 of the current plan. Production
capabilities above remain empty until implementation and validation pass.
Input remains a separate milestone. Revisit this ADR against each exact native
version, and validate only disposable processes with current authorization.
