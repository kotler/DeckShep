# Refactor implementation status

Source baseline: plugin 1.3.4 / `v1.3.4-pre-refactor`. Work remains on
`refactor/v2-foundation`; no main merge, push, installation or release publication
was performed. Display names, plugin/action UUIDs, existing profile/page IDs,
UUID5 key IDs and default consent remain unchanged.

## Implemented

- Phases 0–2: golden safety net, isolated Node runner/workspace, strict typing.
- Phase 3: typed domain/render/guard contracts, private delivery permits,
  independent backend/provider adapters, platform discovery/execution, injectable
  application/controller and dependency rules. Native compatibility engines keep
  their original checks. Delayed CLI/socket writes, activation and host disconnect
  recheck visibility; current consent is checked immediately before mutation.
- Phase 4: bounded Zod boundaries for every application JSON parse, all config
  fields and versioned settings. Native semantic validators remain in place.
- Phase 5: official SDK action/settings/image/title/alert adapter, Rollup bundles,
  stable root hook/configure entry points, local sdpi-components and bundled
  upgrade tests. SDK host close/error preserves baseline exit/invalidation.
- Phase 6: manifest-registered profiles, setup panel with real version/private
  session probes, hook preview/apply/backup/undo/removal, doctor and developer
  watch/link/restart command. Python build/install/package/tests are replaced by
  Node, retaining the external-backup recovery installer and all eight original
  distribution groups plus ZIP64/CRC/source-symlink cases.
- Phase 7: macOS CI, full-tree and omit-dev high-severity audits, version sync,
  coverage ratchets, weekly updates, Conventional Commits, ADRs, security model,
  changelog and draft-only release workflow. The SDK's old transitive Zod copy is
  overridden to patched 4.6.7 and compatibility-tested.
- Phase 8: bundled SDK fake host, all 15 coordinates, inspector settings, stale
  presses/disappearance/disconnect, bundled golden runner, opt-in private live
  harness with PID ancestry and settings fingerprints, shape-only host capture
  tool and nine-press manual checklist.
- Phase 9: source-pinned App/core spike, strict fixture-version/read-only skeleton,
  disabled experimental flag, hidden preview profile, v3 migration/round-trip/v2
  rollback, and generated compatibility matrix. Reused preview contexts explicitly
  detach their previous controller and cannot deliver input.

## Verification

- Clean locked `npm ci` completed.
- Node 22.23.4: 112 tests, 110 passed, two opt-in live tests skipped; no failures.
- Four unchanged golden suites pass against the bundled controller. Golden JSON
  is byte-identical to the Phase 0 checkpoint (`496fb05`).
- Coverage: 93.86% lines/statements, 85.53% branches, 87.97% functions; recorded in
  `coverage-refactor.json`, above the original baseline in every metric.
- Strict typecheck, lint, formatter, dependency rules, knip, versions and generated
  compatibility checks pass. There are no TypeScript error suppressions.
- The formatting-only checkpoint preserves normalized ASTs for 116 JS/TS files
  and is listed in `.git-blame-ignore-revs`.
- Universal helper, Elgato validation/packing, nested archive/default/identity/
  path/privacy audits and checksums are verified locally. The final artifact's
  BUILD-INFO records its exact commit and clean/dirty status.
- Omit-dev audit: zero findings. Full tree: no high/critical findings; 15 low or
  moderate development-tool findings remain. CI rejects high severity in both
  views because build dependencies can be bundled.
- `doctor-fixture.json` demonstrates the support report format using injected
  fixture probes. It is not a native machine validation result.

## Remaining external gates

These are deliberately not claimed as completed definitions of done:

1. Native Stream Deck installer preservation of customized plugin-folder config
   and Claude records. The tested Node stopped-app recovery installer remains
   available; it preserves existing profile bytes, config and records with an
   external backup. Fresh installs use one plugin file.
2. Independent fresh-account five-action setup, physical USB/LCD/profile checks,
   Intel helper execution and Developer ID/notarization when secrets are supplied.
3. Authorized native Herdr calibration for successful Interrupt, Effort restore,
   question/print-only approval and Collapse drivers. Current live harness covers
   isolated startup, selection/Next/wrap/Zoom and stale-focus refusal; these tests
   were not run here. Rex additionally needs an isolated GUI ownership proof before
   native control scenarios. No existing agents may be adopted.
4. One real shape-only Stream Deck recording, remote CI execution/required branch
   protection and a remote draft-release dry run. The tooling is present; none was
   activated against the developer's running installation or remote repository.
5. Owner decisions about license/artwork, naming, merge timing and notarization.

`AGENTS.md` requires `ASW_LIVE=1` and current explicit authorization for native
runs. Pending authorization is not permission; advanced native behavior is not
guessed from fixture success.

## Isolation incident

An early fake-host run did not apply its fixture-factory alias and timed out while
waiting for fixture IPC. It may have issued production Rex discovery/focus calls;
the retained test output cannot establish whether a focus call completed. No
restorative live command was attempted. The alias is corrected and a mandatory
fixture marker is asserted before every host-test launch, preventing production
fallback in all subsequent runs. Production bundles are separately asserted to
contain no fixture switch. This uncertainty was reported to the owner.
