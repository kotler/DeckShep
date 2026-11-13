# Disposable native calibration

The separate [Herdr App calibration harness](APP-CALIBRATION.md) is source-only,
uses no providers or credentials and requires its own opt-in. Its first native
attempt is blocked by post-reply peer proof; see the linked guide and findings.
Its exact-file invocation avoids starting the provider suites described below.

## TUI/provider calibration

Run only with current explicit authorization for new disposable agents and model
usage. Never reuse a historical scratch session. Ordinary `npm test` skips this
group; CI always refuses it. Build first so the harness can copy the bundled
Claude hook/configure entries into its temporary plugin directory.

On macOS with signed-in Codex and Claude CLIs:

```sh
npm run build -- --universal
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only ASW_LIVE_AUTH=signed-in \
ASW_CODEX_MODEL=gpt-6-luna ASW_CLAUDE_MODEL=haiku npm run test:live
```

Choose supported models covered by the account before running. Haiku is suitable
for these small Claude scenarios. Fable and Mythos are not calibration defaults.
Alternatively, omit `ASW_LIVE_AUTH` and provide test-only `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY` in the shell, never in source or chat.

The signed-in path reads Codex's private file cache and the default macOS Claude
Keychain entry. It uses access credentials only: no shared refresh token reaches
the test agents. Expiring credentials and custom Claude credential stores refuse
this path. It never runs login, logout, daemon bootstrap, updates or setup against
the developer's home.

The harness creates a canonical private temporary root, a git repository, an
allowlisted environment, an owned foreground Codex server and a separate Herdr
socket. Provider versions and Herdr protocol are pinned. Socket identity is
rechecked immediately before writes; every discovered agent must have ancestry
to a process spawned by this run. Settings, auth-file and Keychain fingerprints
must match afterward. Cleanup waits for agents to exit and bounds graceful server
shutdown, then force-stops only recorded test-owned processes if necessary.

Assertions use native daemon settings/turns, topology and private Claude hook
records. Model text is never a success assertion or retained report artifact.
Question/approval preparation uses disposable prompts; the only approval command
prints a fixed test marker, and persistent approval rules must remain unchanged.
Native identity transitions require explicit reselection in the driver; production
stale-input guards remain enabled. Mutations are never retried.

The Rex test launches the installed macOS Rex Beta CLI as a foreground server.
It creates a temporary Git repository, checks that the owned server holds its
private Unix socket before each CLI request, and verifies input in an owned
cat pane. Run just this scenario with current authorization:

```sh
ASW_LIVE=1 ASW_LIVE_REX=1 ASW_LIVE_AUTHORIZATION=test-owned-only \
  node --import tsx --test tests/live/rex.test.js
```

Add `ASW_LIVE_REX_PROVIDERS=1 ASW_LIVE_AUTH=signed-in` for the native picker
checks using disposable Codex Luna (with `--no-daemon`) and Claude Haiku panes.
Claude runs hook-free by default. Add `ASW_LIVE_REX_CLAUDE_HOOKS=1` to
install the bundled Claude hooks in the disposable home. Each interactive
Claude case then validates its hook record against the actual foreground PID,
process start, version and working directory before exercising native controls.
The probes open a model picker and attempt Escape after recognition. They
send no inference prompts. GUI focus, Stream Deck routing and physical key
timing require separate verification.

For the provider state matrix, use the same command with
`ASW_LIVE_REX_PROVIDERS=1 ASW_LIVE_REX_STATES=1 ASW_LIVE_AUTH=signed-in`.
This starts fresh Luna and Haiku panes for each of five cases. Permissions and
Mode run from an empty composer. Interrupt requires an active turn, Queue
checks that two distinct answers appear in order, and choice selection checks
the highlight and the provider's answer. The latter three cases use inference.
The private-server checks cover native CLI behavior. The virtual deck and
controller suites cover button mapping, stale presses, opt-in and display state.

To exercise a single Codex Interrupt action during text streaming, select
`ASW_LIVE_REX_CASES=codex-interrupt-stream-early` or
`ASW_LIVE_REX_CASES=codex-interrupt-stream` with the state-matrix flags above.
Run each in a fresh disposable server. Luna receives a synthetic prompt at
launch. The early case waits for the first output lines and the scrolling case
waits for later lines. Both exercise the plugin's keyboard action, assert
exactly one Escape, and require Codex to acknowledge interruption.

`OwnedProcesses` and fingerprint refusals have ordinary unit tests. A separate
shape-only real host capture still needs an explicitly authorized plugin dev
launch: `ASW_CAPTURE_HOST=1 node scripts/capture-host.mjs <launch args>`. It records
types of allowlisted fields, never values. This calibration does not launch the
installed Stream Deck plugin or capture the developer's active host connection.

For browser-driven native checks, add `ASW_LIVE_REX_BROWSER=1` to the Rex
state-matrix command. Select `codex-browser-ready,claude-browser-ready` with
`ASW_LIVE_REX_CASES` for Permissions, Codex Mode, and Effort → Model → Effort.
Queue, choice, and Interrupt cases also use browser clicks with this flag. Playwright clicks
the rendered web-deck key, forwards its pointer events to the plugin controller,
and checks the disposable CLI. The headless server supplies an owned pane in
place of a GUI display client. USB, LCD, and native Mac GUI focus remain
physical smoke checks. Queue and choice success require the selected CLI to expose the identity and
state required by the key. The no-daemon Codex launch has no turn binding.

Set `ASW_LIVE_REX_CODEX_HOOKS=1` for the Codex browser-ready case.
The harness verifies the private home contains exactly the three expected
DeckShep commands before trusting them in the disposable CLI. It sends a
short Luna prompt and checks the resulting hook report against the test pane.
This exercises keyboard settings with lifecycle hooks installed. The
no-daemon launch does not exercise a daemon-backed thread binding.
Use `ASW_LIVE_REX_CLAUDE_HOOKS=1` to test Claude's Queue and choice keys.
Without hooks, the browser cases verify those controls stay unavailable.
