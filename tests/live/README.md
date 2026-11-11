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

`OwnedProcesses` and fingerprint refusals have ordinary unit tests. A separate
shape-only real host capture still needs an explicitly authorized plugin dev
launch: `ASW_CAPTURE_HOST=1 node scripts/capture-host.mjs <launch args>`. It records
types of allowlisted fields, never values. This calibration does not launch the
installed Stream Deck plugin or capture the developer's active host connection.
