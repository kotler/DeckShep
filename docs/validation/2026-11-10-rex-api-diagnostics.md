# Rex API diagnostics and reconnect regression coverage

The owner approved implementing the changelog review's recommendations: report
API revisions and add reconnect tests. This is separate from the earlier deck
layout changes. No focus/identity guard, provider setting or golden snapshot is
changed by this work.

Sources:

- [November 5 CLI release notes](https://discord.com/channels/1546797889009881158/1547349572299395172/1567962016591650817)
  announce real `api_revision` / `api_min_revision` fields in `whoami --json`.
- [server.version reference](https://www.superlogical.com/rex/docs/reference/api#serverversion)
  defines zero for omitted legacy revision fields.
- [November 10 Mac notes](https://discord.com/channels/1546797889009881158/1547349572299395172/1569745909322092606)
  describe reconnect/title preservation and update/relaunch fixes.

The doctor/setup checklist adds a separate `rex-api` row alongside the app
version. The read uses the discovered binary (including the inspector's config
override), `--autostart=false`, a two-second CLI timeout, a 2.5-second process
timeout, a 16 KiB output cap and no inherited `REX_SERVER` route. It sends no
terminal input and uses no clipboard or AppleScript. The parsed output retains
only nonnegative safe-integer revision numbers and a legacy-fields indicator.
Malformed/inverted revision ranges, oversized output and execution failures
produce a fixed private error with no retry. Herdr profiles do not make this
new Rex API read. These numbers do not assert compatibility or mint authority.

Tests inject every CLI/process/visible-pane effect. Reconnect cases keep the
actual Bridge discovery, native-focus/context and final-delivery checks, and
cover: offline refusal followed by a replacement client for the same agent;
stable slots and retained titles; another visible pane despite stale server
focus; process replacement; a changed waiting request; overlapping app clients;
a relaunch between preflight and the final focus check; and an uncertain write
with exactly one attempted delivery and no compensating action. Virtual hosts
also inject synthetic doctor results so opening a fixture inspector cannot
probe the host Rex installation.

The new API probe and native reconnect scenarios were not run against existing
Rex/provider sessions for verification. Fixture success is not native reconnect
calibration. The existing
clipboard consent, process checks, Codex footer binding and provider opt-ins
remain in force. No new API-version pin or production capability is introduced.

Validation passed: 341 non-live tests, zero failures, four live suites skipped;
all 24 browser tests against unchanged image baselines; all four bundled golden
groups; typecheck, lint, dependency rules, Knip, formatting and version/
compatibility checks; universal build, private packaging and ZIP verification.
Coverage gates passed at 95.14% lines/statements, 87.01% branches and 90.37%
functions with unchanged thresholds. Native trace/refusal snapshots were not
updated for this work.

The already approved stopped-app deployment path installed the tested build
after a new private backup. All 73 profile files matched the backup, and the
installed runtime, doctor, native helper and hook/configure entry bytes matched
the build. Stream Deck reopened with the existing Home arrangement. Its normal
discovery resumes on launch; no agent input or agent restart was performed by
the assistant. The new API read remains part of setup/doctor diagnostics and
does not run in ordinary background status polling.
