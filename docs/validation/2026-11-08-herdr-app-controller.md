# Herdr App helper, controller, consent and reporting checkpoint

Date: 2026-11-08. Phase 2c, following the approved focus-only H1/H4 amendment.
Implementation commits: `09c38c1` (helper packaging) and `196354a` (controller,
consent, reporting and tests), on `codex/herdr-app-controller`.
No existing App/core/Rex/agent was started, contacted, inspected or given input.
Live tests remain disabled; production App build records/capabilities are empty.

## Changes

- Build/package now includes `bin/herdr-app-peer` alongside the existing clipboard
  helper. Both are compiled for arm64/x86_64 and signed under the existing build
  policy. Package checks require both architectures and entry points. The fallback
  installer fixture requires the new file without changing backup/merge behavior.
  No installer/restart/link operation was run against real HOME.
- The experimental App scope routes through `HerdrAppController`, separate from
  provider/legacy dispatch. It owns App pane references without invented PID,
  chat or core identity. Selection and Next call the guarded request sender;
  banks/Collapse are local. Closed/remapped slots and unsupported overrides cannot
  send requests. Context, appearance, visibility, generation, endpoint, record,
  target and 350 ms arming checks remain in effect.
- `herdrAppFocusRequestEnabled` is separate and off by default. v1/v2 and older
  v3 stores grant none; the v2 rollback preserves legacy data/revision. Request
  consent neither inherits from nor enables read-back, input or Claude controls.
  Revocation bypasses the ordinary event queue, disposes the pending sender and
  invalidates the captured press before a possible final write.
- Request acknowledgement displays **Focus requested / Not verified**. Later
  **Deck selected** describes the local choice used by Next, while **App reported**
  marks model/status information. Neither means verified keyboard/OS focus.
  Feedback is scoped to its presentation so Collapse/replaced slots cannot retain
  a previous key's notice. Native timeout/uncertain completion still never retries
  or compensates.
- Setup exposes only the App home and separate request consent for the App scope,
  hides legacy/provider setup and disables unsupported action choices. App doctor
  reporting is passive, path-free and independent of Rex/TUI discovery. CLI
  `--herdr-app` reports the fixed plugin helper/static records without connecting
  and leaves profile-only home/consent unknown.
- The helper path comes only from the plugin directory; preferences cannot choose
  an executable. `APP_FOCUS_RECORDS` remains frozen/empty. With default production
  composition, no sender/discovery/request is activated even if an App home and
  every opt-in are configured. The experimental flag remains off in default
  packages, which still have v2 and the existing two profiles/identities.

## Fixture and browser evidence

Ten new root tests cover the controller, separate consent migration and passive
setup/doctor/factory behavior. The controller fixtures exercise the actual guarded
sender with private fake App sockets and synthetic build artifacts/evidence; those
artifacts are never executed. Existing inspector, routing and distribution groups
were extended. Old source-control/provider guards were not removed or bypassed.

The bundle-only `herdr-app-panes` virtual scenario contains App panes, not fake
provider processes. Its in-memory request backend uses the actual request
authority and emits only synthetic `['pane.focus', pane]` traces. It needs no
Swift/helper/App. Four new browser cases cover consent, selection/Next labels,
banks/closed slots/Collapse, unsupported input overrides, revocation while paused
and a profile switch before dispatch. Production bundle/archive audits reject the
new fixture markers. The legacy scenario loop now expects zero Rex agents for
App-only data, rather than fabricating process identity to meet its old assumption.

## Validation results

- Full `npm run test:coverage`: **233 tests; 231 passed, 2 disabled live groups
  skipped, 0 failed**. Coverage: lines/statements **94.76%**, functions **90.10%**,
  branches **86.69%**. Versus Phase 2b: −0.41, −0.51 and −0.11 percentage points.
  All existing thresholds pass; no threshold or exclusion was changed.
- `npm run test:e2e`: **22 passed**, including all 18 previous cases and six
  existing deck-only visual smoke images. After the App-only local-selection label
  clarification, all four App cases were rerun and passed. Existing golden JSON,
  SVG hashes and PNG baselines are unchanged; nothing was regenerated.
- Typecheck, lint, dependency boundaries, Knip, formatting, version identity,
  generated compatibility and `git diff --check` passed.
- Universal build, all four bundled golden groups and private-review package
  validation/packing/audits passed. The final distribution includes the App setup
  guide. After adding that guide to the exact payload inventory, all eleven
  distribution fixtures and a `--skip-build` package/audit passed again.
- Native producer fixtures still inspect only their own signed process/private
  peer. These results do not validate an actual Herdr App build or a physical deck.

Logs are local under `/private/tmp/deckshep-herdr-app-controller-` with suffixes
`coverage.log`, `build.log`, `bundled.log`, `e2e.log`, `e2e-app.log` and `package.log`.
Build/package never installs, restarts, uploads or publishes. Unrelated untracked
owner documents are preserved.

## Remaining gates

The controller/helper/consent/reporting integration is ready for review while
disabled for production. Separately authorized, isolated native App calibration
and exact approved build records remain required before any production request
capability. The later product/default-profile, physical, clean-Mac and release
gates also remain. No core/provider correlation, native keyboard ownership,
completed focus, Zoom, contextual input or optional mod is approved by this record.
