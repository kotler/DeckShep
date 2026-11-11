# Optional Codex hook identity

The owner approved implementing a hook approach on 2026-11-10. This explicitly
amends the footer-only identity rule for Rex while preserving all existing
native focus, provider-state, composer, stale-press and delivery guards.

The source review used Codex `rust-v0.167.1` hook command execution and root
lifecycle serialization. Command hooks receive a session environment snapshot
and may be spawned by a shared daemon. Parentage or inherited Rex environment
alone therefore cannot prove the foreground CLI's selected thread. This initial
implementation additionally requires one external Unix client of the exact
CLI-connected daemon and one loaded thread. Both sets are bracketed around the
metadata-only thread read; ambiguous cases retain independent footer verification
before capture. A captured hook never changes source or epoch in flight.

The new fixed native helper reads only the requested owned PID's kernel facts,
bracketing PID, owner, parent, microsecond start time and executable identity.
It launches no agent and opens no socket. Its output contains an image-path
hash instead of an executable path. The contract fixture compiles a private
copy and invokes only its self-inspection mode; it does not inspect any existing
agent. Universal packaging audits include all three native helpers and preserve
their signed bytes and executable archive modes.

The hook writer strips prompt/transcript/tool fields, rejects subagents and
oversized payloads, checks its native reporter and current private consent, then
atomically publishes a minimal record. Setup previews by default; applying adds
only its three exact commands to hooks.json with a private original-byte backup.
Removal revokes the setup epoch first. Neither path writes config.toml or a
provider status line, changes existing agents or grants Codex's hook trust.
The stable helper entry points and lifecycle records are covered by temporary-
HOME install/restore/removal tests. Fresh Codex reports win over saved reports;
stale temporary files are not restored.

Guard review added three deliberately failing race tests: setup revocation and
report replacement during the final peer query, and revocation during the
publisher's final process query. Final consent/report checks now happen after
all awaited work, immediately before commit/return. The new tests then passed.

Synthetic integration tests exercise actual Bridge context/focus and provider
controls for Model, Effort, Permissions, Mode and Interrupt without footer reads.
Other cases cover multiple clients (including Desktop), multiple loaded threads,
same-daemon CLI PID reuse, changed process images, root report ambiguity, changed
records, subagents, expiry, private-file guards and revocation. Browser fixtures
test hook-bound Interrupt and pending-press epoch replacement without changing
any screenshot or golden baseline. No existing Rex/Codex agent or daemon was
used as a calibration fixture. Native hook-environment and hardware delivery
validation remain pending; singleton restrictions must not be relaxed based on
the fixture results. Message composition retains its existing viewport proof.

Validation passed: 392 isolated tests, zero failures, four live suites skipped;
30 browser checks against unchanged images; four bundled golden groups.
Coverage gates passed at 95.39% lines/statements, 87.13% branches and 91.13%
functions, with unchanged thresholds. Typecheck, lint, architecture dependencies,
Knip, formatting, version/compatibility checks, universal build, executable-mode
and architecture checks for all three native helpers, private package audits and
ZIP verification passed. No release, upload or native agent calibration occurred.

Deployment used the already approved stopped-Stream-Deck backup/installer path.
The installed runtime/inspector and all helper entry bytes matched the build.
All 73 profile files and control consent values matched the fresh backup. The
explicitly requested hook integration added exactly three owned lifecycle
entries; removing those entries from the post-install document reproduced the
entire original hooks document. The Codex config.toml hash was unchanged.
Private original-byte hook backups and the pre-deployment plugin backup were
retained. Stream Deck reopened with the existing layout. Codex's own hook trust
review is still a user action; files installed on disk do not prove an active
hook binding, native environment inheritance or successful input delivery.

## Follow-up: discovery selection and visible diagnostic

The owner approved the hooks and generated a normal lifecycle report without
enabling a status line. Passive observation of the installed inspector initially
showed no binding diagnostic. A regression test reproduced render hydration
overwriting the shared discovery object while metadata awaited I/O. Metadata
now reads a private snapshot and publishes its epoch and safe notice after the
read completes. The deliberately failing race test passes with this change.

The owner also reported that starting Codex did not select it on the deck.
After initial successful discovery, exactly one new Rex process now receives a
fresh local selection and its agent page. Empty-to-first and same-pane restarts
are covered. Several simultaneous arrivals, reconnect and staged work preserve
selection. A provider-label change under the same PID is not a new launch.
Tests verify zero focus reads/requests during automatic selection, refusal of a
stale pre-restart press, and no provider write when native focus differs.
This deliberately changes the lifecycle test's local selection expectation;
the stale-process refusal remains asserted. No golden or image changed.

Final follow-up checks passed: 400 isolated tests, four live suites skipped;
30 browser checks; four bundled golden groups; coverage 95.44% lines/statements,
87.20% branches and 91.15% functions. Typecheck, lint, formatting, dependencies,
Knip, version/compatibility, universal build and private package audits passed.
The approved stopped-Stream-Deck backup/installer deployed the update. Installed
bytes matched; profiles, plugin configuration, hook helper bytes/hooks.json
and Codex config.toml matched the private pre-deployment baseline.

The installed inspector now reports: "Codex hooks: multiple daemon clients;
the selected CLI cannot be bound safely." This is a real unresolved binding
limitation, not evidence that the owner's missing status line is a refusal.
No singleton guard was relaxed, no native agent was started or controlled,
and successful native hook-only controls or new-launch hardware selection
have not been claimed. Distinguishing the selected CLI under a shared daemon
needs additional independent ownership proof before broadening this route.

## Shared-client follow-up and Token Meter source review

The owner requested shared-daemon controls without a status line, then explicitly
chose unchanged terminal titles and unmodified Codex. No title configuration,
client integration, native status probe or shared-client authority was enabled.

Review of [Token Meter's Codex adapter](https://github.com/splunk/token-meter/blob/main/token_meter/runtimes/codex.py)
found useful discovery and relationship evidence. It scans local JSONL rollouts,
reads the first session_meta identity, distinguishes physical `id` from logical
`session_id`, and tracks `parent_thread_id`, nested thread-spawn metadata and
`forked_from_id`. Its index supplies thread names. The opaque agent ID derives
from the physical trace ID. Metadata caching checks file revision/identity and
its tests cover copied parent metadata, conflicting duplicate identities,
root-versus-internal relationships and ambiguous logical sessions.

This is session-file discovery, not a live terminal binding: `discover()` ignores
its context and emits the generic runtime label `client_id="codex"`. The adapter
has no PID, daemon connection or current TUI selection proof. File recency also
serves activity estimation; it cannot authorize a control. These findings may
inform display-only discovery and future root/subagent validation, but do not
replace the shared-client guard. No user's transcripts or databases were read.

The official Codex rust-v0.167.1 source review also confirmed that Hooks::new
captures `std::env::vars_os()` in the process hosting the session. A shared daemon
can therefore replay one inherited Rex context for sessions used by other
clients. Matching that context, a hook session ID, a directory or a recent file
cannot independently identify the foreground CLI's selected thread. Root session
IDs normally equal root thread IDs, while descendants share the root session
identity; this distinction matters when examining rollout metadata.

Source references:

- [Token Meter identity and lineage tests](https://github.com/splunk/token-meter/blob/main/tests/runtimes/test_codex_adapter.py)
- [Codex hook environment capture](https://github.com/openai/codex/blob/rust-v0.167.1/codex-rs/hooks/src/registry.rs)
- [Codex root/descendant session identity](https://github.com/openai/codex/blob/rust-v0.167.1/codex-rs/core/src/session/session.rs)

A proposed read of Rex's live terminal-title method schema was rejected by
automatic approval review under the standing no-attach rule. It was not retried
indirectly. Public documentation and static source review continued instead.
The title route was subsequently excluded by the owner's explicit preference.
The native `/status` implementation can display a session ID, but automatically
typing it would require a separately established empty-composer/readback contract;
it is not a silent hook fix and was not implemented or run. Shared-client binding
remains unresolved under the owner's current constraints, and no success or native
calibration is claimed from this research.
