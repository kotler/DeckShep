# Herdr App Phase 1a control gates — 2026-11-08

Scope: per-control verification plumbing, with no production Herdr App controls
or verified versions enabled. Native focus, Zoom, keys and provider writes remain
disabled in its existing preview backend. No live application was used.

Backend reports now include verified control IDs and a verification record key.
Herdr App availability requires both the control's capabilities and that exact
control entry. Selection/Next map to native `focus`; pages, banks and Collapse
are local deck operations and cannot authorize input. Legacy backends report
their existing capability-supported vocabulary and retain all existing guards.

The layout and controller's custom override mapping gate native App actions.
Presses capture the control and record; provider dispatch also checks that the
requested action matches the captured one. The delivery kernel refuses before
issuing a permit, rechecks at the final I/O callback, and the backend checks the
input control/kind. Permits bind the control/record and remain single-use even
after refusal. Record replacement copies the set and bumps generation.

Six new integration cases cover a question-navigation-only record; inactive
approval Confirm/Esc, Model, Effort and Interrupt; custom override refusals;
zero permits before unsupported actions; stale captures/tokens after record
replacement; late revocation; payload/control mismatches; and missing records.
The only App-capable backend is an explicit test injection. No production
fixture switch or record was added. The optional delivery factory prepares
composition without interpreting an App backend as Rex.

| Check | Result |
| --- | --- |
| Full coverage suite | 181 tests: 179 passed, 2 opt-in live cases skipped, 0 failures |
| Coverage | Lines/statements 95.15%; functions 89.70%; branches 86.05%; existing gates unchanged |
| Source golden groups | All 4 passed; existing JSON byte-identical |
| Bundled golden groups | All 4 passed |
| Lint, typecheck, dependency rules, knip | Passed |
| Version, compatibility and formatting | Passed |

Runtime was Node 26.13.0. No dependencies, lockfiles, IDs, profile names,
preferences or consent defaults changed. These fixture checks do not establish
App focus/Zoom truth, process/chat identity, native keys or hardware behavior.
The source review's native and read-back questions remain open.
