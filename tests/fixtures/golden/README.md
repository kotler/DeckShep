# Baseline behavior contracts

Captured from plugin 1.3.4, commit `0262267`, tagged `v1.3.4-pre-refactor`.
No production source changed for this capture. Fixtures use synthetic processes,
private records, terminal views and transports; no installed agent is contacted.

The owner-approved 2026-11-10 UI changes replace the original 96 interaction-page
cases with 32 dynamic Home cases. See the mapping and snapshot justification in
[the validation record](../../../docs/validation/2026-11-10-rex-rendering-controls.md).
Native traces and refusals retain their original coverage.

The owner-approved Rex navigation separation strips provider proof from Rex
agent-button dispatch targets. Layout actions and native traces/refusals stay
unchanged. See the [navigation validation record](../../../docs/validation/2026-11-10-rex-navigation-independence.md).

- `layouts.json`: 32 backend × provider × dynamic Home state combinations, each with
  all 15 key actions. Includes approval, completion and error in addition to the
  five states required by the plan. Background-only is deliberately Codex-only;
  the Claude combination preserves the baseline's working layout.
- `presses.json`: each of those 480 keys pressed in a fresh controller fixture,
  recording provider dispatch, fixture backend calls, result label and alert.
  Provider operations are injected here; this captures controller routing, not
  evidence that a native operation succeeded.
- `native-traces.json`: actual guarded provider/backend implementations with
  injected transports, recording exact CLI arguments, RPC methods, key sequences
  and outcomes for cycles, staging/Send, running submission, background stop,
  questions, approvals, Herdr focus and Zoom. These complement the controller
  routing snapshots; the existing focused tests cover races and other refusals.
- `controller-refusals.json` and `native-refusals.json`: explicit refusals with
  independent assertions that no input was dispatched.

Run with `node --test tests/integration/golden.test.js` (about four seconds on
the baseline). To intentionally recapture, set `ASW_UPDATE_GOLDEN=1` for that
command. Every changed snapshot after Phase 0 requires a written behavior-change
justification in the PR; never update snapshots merely to make a refactor pass.

The fixtures in `../backends/` were copied from the corresponding baseline
regression tests. The Claude cycle fixture additionally records transport calls
before dispatching its synthetic native state changes.

Claude’s ready, done and error layouts leave the former Mode slot blank. Permissions covers its mode cycle. The matching press baselines expect no input from that slot or the grey, idle Interrupt key.
