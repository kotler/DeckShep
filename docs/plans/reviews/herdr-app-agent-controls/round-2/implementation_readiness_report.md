# Fresh Implementation Readiness Review

**Stage** 9  
**Date** 2026-11-14  
**Target** [Frozen reviewed design](reviewed-design.md), detailed lines 159–620

Three fresh-context reviewers completed. Readiness and Codebase Details used the Implementation Readiness standard. Style used its persona without an additional standard. Findings below preserve each reviewer's severity before cross-stage calibration.

## Readiness

### R2-1 — Major — Normal-key checkpoint precedes required controller wiring

Affected lines 534–543, with 453–455. Step 4 requires an ordinary host key-down positive through service, kernel, backend and receiver. Controller factory injection, Model mapping, presented capture and dispatch arrive in step 5, and step 4's file boundary omits those controllers. At that checkpoint, `h.profilePress('herdr-app', 2, 0)` still maps to `none`. Move the ordinary-key positive and its integration-test entry into step 5. Keep step 4's direct service/kernel/receiver contract validation, then require normal-key success before browser expansion.

Evidence: root controller construction at 202–249 and dispatch at 1693–1711; App controller mapping at 176–192 and `none` refusal at 529–533; existing App daemon-control integration cases at 91–122.

## Codebase Details

### B2-1 — Blocker — The specified returned generation does not exist

Affected line 451. `TerminalBackend.connect()` returns `BackendInfo`, which has no generation. `GuardedBackend.connect()` increments the connected instance's `generation` property and returns other metadata. The proposed change adds route metadata only. Following the instruction literally fails typechecking or yields undefined through legacy untyped code. Await connection, verify current service ownership, then read `kernel.backend.generation`.

Evidence: `src/domain/backend.ts:28` and `src/terminals/contract/backend.ts:77`. This duplicates independent verification V2-1, whose reviewer classified the same wording as Nit. Consolidation records the severity calibration.

### B2-2 — Major — Native transition rejects a supported command footer

Affected line 336, with Rex-equivalence requirements at 349, 365 and 595. The table requires an unchanged footer after pasting `/model`. Existing `command()` checks a recognized `singleLine` surface, exact command and cursor, and permits a context-only footer. The existing regression changes the idle footer to `100% context left` during command entry. A stricter receiver would stop after its first write and leave partial UI state. Reuse recognized command-surface rules, retaining external-revision checks independently, and add a positive command-footer transition case.

Evidence: `keyboard-settings.ts:76–89, 340–349`; `rex-keyboard-settings.test.js:346–365`.

### B2-3 — Major — Browser command entry point is missing

Affected lines 558–561 and exact-file claim at 587. Browser tests invoke `window.deck[method]`, whose methods are registered in a fixed list in `tests/e2e/virtual-deck/app.js:132–146`. New `VirtualDeck.execute()` commands do not become browser-callable automatically. Add that browser script to the P3 file table and register the same bounded method names. Evidence: browser helper at `tests/e2e/helpers.ts:13` and dispatch at `virtual-host/deck.ts:54`.

## Implementation Style

### IS2-1 — Major — Calibrate the post-command footer rule

Affected lines 334–336, 365 and 595. CALIBRATE. Same underlying issue as B2-2. Define the post-paste surface through existing `prompt`/`singleLine` checks, allow their recognized footer variants, and retain support for footerless initial empty composers.

### IS2-2 — Major — Ordinary-key success precedes composition

Affected lines 455 and 519–550. Same underlying issue as R2-1. Move minimum composition earlier or put the ordinary-key checkpoint after step 5. Evidence: root dispatch at 1693–1729 and App controller mapping/press at 176–192, 529–617.

### IS2-3 — Major — Retirement needs a stable recipient identity

Affected lines 471 and 552, with binding declaration at 188–199. “Same App/Core/CLI lifetime” and “genuinely distinct binding” do not specify the exact quarantine comparison. `ModelBinding` contains source, connection, focus and readiness revisions that can change while queued work still belongs to the same recipient. Keying quarantine only by source/operation may clear it on reconnect. Declare a stable recipient projection separate from callback/lock ownership. Enumerate observer and revision fields that cannot clear a tombstone and process/session replacement fields that identify a distinct recipient.

### IS2-4 — Nit — Remove repeated retirement rules

Affected line 616. DROP. The reconciliation paragraph repeats acknowledgement, late-effect and partial-completion rules from 322–324 and 463–471. Remove it or cross-reference the canonical recovery section.

## Read provenance

All three read their complete persona and assigned detailed range, feature definitions, reading list, AGENTS, App/profiles guides, ADR 0002/0007, controls brief/evaluation and pinned upstream snapshots. No historical review, resolution or closure claim was opened.

Readiness fully inspected the listed source/test infrastructure except root-controller sections were bounded to 1–320 and 1550–1774. Additional reads covered navigation and TypeScript, coverage, Knip and dependency configuration. An optional guessed golden-test path was corrected with `rg`; truncated required passages were recovered.

Codebase Details fully read delivery, five listed App modules, listed domain/guard/backend/selection/schema modules, inspector, native settings, plugin/keyboard/backend harnesses, virtual scenarios/dependencies/deck/server/browser script, E2E README and App spec, delivery and App-daemon integration tests. Bounded reads covered root controller 1–270 and 1580–1774, daemon 1–210, 408–510 and 640–984, transport 69–192, selected App-controller/verified-control/native-setting tests and host/helper passages. Other ordinary tests were searched for relevant names and assertions. Additional configurations were inspected. A nonexistent helper `.ts` path was corrected to `.js`; an exploratory glob failed; truncated relevant material was reread.

Style fully read native settings, delivery/prototype/view/inspector/diagnostics, domain/guard/backend/selection/Core/schema modules, keyboard/plugin harnesses, E2E README, App daemon/schema/view tests and relevant native-setting test bodies. Controller, daemon, registry, inspector and remaining integration/browser passages were scoped to relevant entry points. Additional process identity source was read after correcting an exploratory filename. Truncated required material was reread.

No required input remained unavailable. No reviewer changed files, ran tests/builds/live probes, or spawned subagents. Native qualification dependencies remain explicit gates rather than evidence that an active route exists.
