# Opt-in native validation

Never run in CI, against an existing session, or on historical authorization.
Default `npm test` skips these tests. After current explicit authorization:

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only npm run test:live
```

Herdr requires explicit cheapest-model selections `ASW_CODEX_MODEL` and
`ASW_CLAUDE_MODEL`, and test credentials `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
The harness starts a headless server with a unique private socket, temporary
HOME/XDG/config/state/repo, creates disposable providers, proves their ancestry,
and checks native selection/Next/wrap/Zoom and stale-focus refusal. It hashes the
real global settings before and after and never copies global auth/config files.
It refuses any version other than the existing verified TUI 0.9.5 / protocol 22.

Effort restoration, question/print-only approval, successful Interrupt and native
Collapse scenarios still require calibration against newly authorized native
agents; their safety/control sequences are covered by fixtures meanwhile. The
harness deliberately does not invent unverified live setup or approval commands.
Do not describe a skipped run as native validation.

Rex also requires `ASW_LIVE_REX=1` and `ASW_REX_ISOLATED_LAUNCHER`. The launcher must
start a disposable GUI instance under the supplied private home. The harness
proves ownership only for processes it spawned; it never adopts an ordinary Rex
app or existing agent. Native Rex control scenarios remain gated on this proof.

`OwnedProcesses` and settings-fingerprint refusal cases have ordinary unit tests.
Capture a real SDK host frame shape once during an explicitly authorized plugin
dev launch using `ASW_CAPTURE_HOST=1 node scripts/capture-host.mjs <launch args>`.
The proxy records types of allowlisted fields only, never values. This tool has
not been run against the developer's active Stream Deck during the refactor.
