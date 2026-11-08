# Herdr App selection feedback checkpoint

Date: 2026-11-08. Scope: Phase 2a after the owner's H1/H4 amendment to
discovery/status and plain focus requests. No native App/core/agent process
was started, inspected or contacted. No mod was installed, upstream contacted,
production capability enabled or verification record created.

## Change

`src/domain/app-selection.ts` defines pane/model selection independently of
provider-bound `AgentSnapshot`: no invented PID, core ID or chat identity.
`src/terminals/herdr-app/selection.ts` reads status/list/status through the
existing read-only client. It validates schemas and stable endpoint generation,
requires unique topology IDs and consistent active space/tab/pane mapping,
omits remote panes and refuses remote selection, overlays, floats, host errors,
missing panes and conflicting shown-agent addresses. Empty App/tab states do
not fabricate a selected agent. UI-scale changes are not pane Zoom.

Reads have a 1,000 ms total monotonic budget, propagate cancellation and refuse
overlap. Responses whitelist model identifiers and App-reported display fields;
raw paths, errors and source objects are not returned. Matching reads produce
`provenance:'app-model'` and `verifiedFocus:false`, not native focus authority.
An intervening change that returns to the same state can remain undetected;
these reads are not an atomic snapshot.

The reader is unwired. This checkpoint adds no generic writer, focus sender,
input path, production profile change or consent. Production peer/build identity,
the narrow request sender, request consent and controller integration remain.

## Validation

- New contract group: **11 passed**, including a private temporary fake socket
  that receives exactly status/list/status. Other cases use synthetic ports.
- Full `npm run test:coverage`: **199 tests; 197 passed, 2 disabled live tests
  skipped, 0 failed**. Existing coverage thresholds are unchanged.
- Coverage: lines/statements **95.25%**, functions **89.92%**, branches **86.58%**.
  Versus the preferences checkpoint: −0.09, +0.06 and +0.15 percentage points
  respectively. c8 counts the new type-only domain file as unexecuted;
  no coverage exception was added. The selection reader itself has 99.42%
  lines/statements, 100% functions and 97.33% branches.
- Typecheck, lint, dependency boundaries, Knip, formatting, version and generated
  compatibility checks passed; `git diff --check` passed.
- Existing golden files are unchanged and their source tests passed in the full
  suite. No browser baseline was regenerated. Bundled/browser/package checks
  were not rerun: the new reader is disconnected from the production entry.

The full fixture suite needed sandbox escalation solely to bind its own private
temporary sockets. Its log is local at
`/private/tmp/deckshep-herdr-app-selection-coverage.log`. Fixture results do not
establish a native App build, peer ownership, completed focus or release readiness.
