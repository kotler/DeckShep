# Codex Model delivery evaluation

**Date** 2026-11-14  
**Scope** Automatic focus tracking and one Rex-equivalent Model control in Herdr App

**Later experiment:** The [mod delivery prototype](herdr-mod-model-delivery-prototype.md)
proved an actual native Model change through a mod, local relay and existing
Core attach DATA stream, including background operation. This corrects the
earlier conclusion that upstream work was necessarily required for delivery.
The full approved production guard contract remains unqualified, and upstream
changes are out of scope.

**Production qualification result:** The [native Core gate experiment](../../validation/2026-11-14-herdr-core-input-gate.md)
subsequently reproduced delivery after the press deadline and after viewer
closure. Ordinary attach DATA therefore fails the approved retirement/expiry
contract. Helper checks and disconnects cannot qualify this route. The
provider API retains its separate application-ordering and identity gaps.

**Updated native pair:** The November 15 authorized run against signed App
0.1.16/Core 0.1.21 passed lifecycle calibration and real background Model
delivery, and reproduced late input on both native transports. Virtual-deck
navigation also failed its editor foreground assertion with Chrome frontmost.
See the [updated validation](../../validation/2026-11-15-herdr-app-0.1.16-core-0.1.21.md)
for each run's outcome and retained evidence.

## Result

Both delivery paths were evaluated through repository source, existing fixture tests and focused in-memory probes. Each needs additional capability before it meets the approved requirements. Keep delivery selection open. The next technical work is to establish an authoritative App-to-Core binding and a recipient that enforces the captured focus/session/state when Model first takes effect. The passive tracker can be developed independently. [Technical plan](../HERDR-APP-AGENT-CONTROLS-DESIGN.md#technical-plan)

Background operation remains a requirement for both candidates. A terminal-addressed key call and a thread-addressed API call can avoid global keyboard injection by construction. Actual behavior while an editor remains frontmost requires an isolated native experiment for the selected runtime. The existing fixtures supply no evidence about macOS activation, real keyboard ownership or real receiver scheduling.

## Evidence examined

The repository comparison uses `cycleCodexSetting`, `performRexKeyboard`, `DaemonControls.cycle`, `AppCodexControls`, App selection and Core reads, and their tests. The local working tree contains the ongoing Herdr navigation changes. This evaluation examines that state. [Native cycle](../../../src/agents/codex/keyboard-settings.ts) · [Rex adapter](../../../src/app/rex-keyboard-settings.ts) · [Daemon cycle](../../../src/agents/codex/daemon.ts) · [App prototype](../../../src/app/herdr-app-codex.ts)

Upstream inspection used the previously reviewed fixed revisions plus the public `master` sources retrieved on November 14. Moving branch links below document that inspection and require an exact revision capture before native qualification. The schema check found a text-only read result and terminal key parameters limited to caller, terminal and keys. Those fields provide no expected App focus revision, session identity or expiry for a queued key. The App source continues to distinguish model selection and terminal keyboard ownership. [Fixed Core protocol](https://raw.githubusercontent.com/herdrdev/herdr-core/3965a46caae095a3ead01de237fa13955e52b8c6/schema/README.md) · [Inspected Core schema](https://raw.githubusercontent.com/herdrdev/herdr-core/master/schema/hc.openrpc.json) · [Inspected App window](https://raw.githubusercontent.com/herdrdev/herdr-app/master/src/window.rs)

## Comparison

| Requirement | Native picker through Herdr | Provider API |
| --- | --- | --- |
| Model order matches Rex | Reusing `cycleCodexSetting` uses the actual picker’s order, including its checks for changed menus and wrapping. | The existing daemon cycle follows `model/list` order, optional configured ordering and effort filtering. Fixture probes demonstrate different choices are possible. |
| Preserve reasoning effort | The native cycle reads effort, selects it for the new model and applies with the session-only action. Unsupported effort stops the cycle and can leave a picker open. | The daemon writes the model alone and verifies unchanged effort afterward. Catalog filtering can skip the picker’s next entry. Equivalent selection semantics need an explicit implementation and comparison. |
| Draft behavior matches Rex | Rex refuses Model from a nonempty composer before typing the command. The native route needs equivalent cursor and empty-composer evidence. | The daemon path can change model without reading the composer. Preserving a nonempty draft is useful behavior, but strict Rex equivalence requires the same availability rule or a separately approved behavior change. |
| Herdr stays in the background | Pane-addressed input could provide this. It needs verified pane reads and delivery to the actual terminal, plus native evidence. | A proven thread-addressed call could provide this. It needs the exact App/Core/CLI/chat binding, plus native evidence. |
| App pane belongs to this session | Existing navigation observations do not prove the active Core connection. Matching local addresses cannot bind it. | The App prototype receives a configured Core and a terminal address. Its title-based lookup verifies a candidate daemon chat but lacks proof that the App is using that Core. |
| Passive screen and cursor evidence | Core `terminal.read` with `lines:0` supplies text. Its reviewed result supplies no cursor location or edit-mode proof. A new supported observation would be necessary. | A settings write avoids keyboard navigation. A session mapping and any required parity checks, including draft eligibility, still need authoritative observations. |
| Focus changes invalidate pending work | A receiver must reject the first key if focus, session or ready state changed, including A → B → A. The current keys request has no complete captured-context condition. | The current settings write carries a thread ID and model. It has no expected App focus, previous setting, readiness revision or request expiry. Client checks leave an interval before application. |
| Readback proves success | Native parser and same-session setting evidence must agree after applying. Request acknowledgement alone is insufficient. | Existing daemon fixtures verify the same loaded chat’s model and unchanged effort. This confirms the setting while leaving App focus continuity unproven. |
| Failure after dispatch | A picker may be partly open or changed. Stop subsequent writes, preserve uncertainty and require a new user action. | A timeout can leave an applied update. Preserve uncertainty and avoid a second settings write. |

The native path needs a richer read and conditional terminal delivery. The API path needs a verified parity policy and conditional provider delivery. Both depend on the same authoritative App/Core ownership chain. A helper that observes and then forwards an unconditional request leaves the time interval unresolved.

## Checks actually run

Ran the following four existing files together with `node --import tsx --test`. All 24 tests passed with zero skips or failures.

- `tests/unit/rex-keyboard-settings.test.js` exercises model and effort cycles, picker wrapping, draft refusals, changed menus, and per-write Rex context checks. It also includes other existing keyboard-control cases.
- `tests/unit/herdr-app-codex.test.js` exercises the dormant App bridge with fake Core/provider dependencies, changed-process refusals and the single-write guard. Its mock Model operation deliberately requests a forbidden method to check rejection. It does not demonstrate a successful real App Model change.
- `tests/integration/daemon-controls.test.js` exercises fake daemon routing, catalog filtering, model-only updates and readback, busy/chat/process checks, and absence of retries after uncertain delivery.
- `tests/integration/herdr-app-daemon-controls.test.js` verifies read-only App behavior and inactive saved provider overrides even with former opt-ins enabled.

These tests use fixture processes or in-memory ports. They do not connect to the owner’s running Herdr or Codex sessions.

### Reproduced order difference

An in-memory probe ran the real native `cycleCodexSetting` against `KeyboardScreen` with model names Alpha, Beta and Gamma in that order. Starting at Alpha with High effort, it selected Beta and kept High. The real exported daemon `nextModel` helper was then given API order Alpha, Gamma, Beta, all supporting high effort. It selected Gamma.

A second probe gave the daemon helper catalog order Alpha, Beta, Gamma with Beta supporting only low effort. From Alpha/high it selected Gamma. Given an absent current model it selected the first compatible entry, Alpha. These are fixture counterexamples to treating the API helper as interchangeable with Rex’s next-picker-entry behavior. They do not establish the order of any live catalog.

### Reproduced interval after the client check

An in-memory probe called the real `DaemonControls.cycle` with fake loaded-thread metadata and a fake settings receiver. The bridge asserted that focus was A during both its context check and its final pre-write callback. The fake receiver then changed focus to B before applying the captured update to A. It applied one model change and the client returned a successful Beta result after readback.

This reproduces a client-side success path with stale App focus. The update still addressed A’s thread. It demonstrates the missing focus-at-application condition in this client contract. Real daemon execution timing and queued delivery were not measured by this probe.

## Consequences for the design

1. Implement the passive focus projection from accepted App observations. Keep the App-selected control target independent of local deck navigation. The existing reader can support this display milestone.
2. Define and prove the App/Core/CLI/session binding on a disposable pair. Capture process and connection lifetimes so same-address terminals and reused processes cannot satisfy old captures.
3. Exercise both candidate delivery contracts. The native candidate needs exact text/cursor evidence, expected menu transitions and conditional writes. The API candidate needs exact model ordering, compatible effort behavior, equivalent draft eligibility and conditional application to the proven session. For either route, a stale press must expire before its first effect.
4. Select a delivery route only after one satisfies the common contract. An outcome where neither currently qualifies keeps Model unavailable and records the concrete upstream dependencies. Any later relaxation of Rex equivalence or background operation requires an owner decision.
5. Use the same isolated native acceptance cases for both routes. Record exact App, Core and CLI revisions and a proven test-owned launcher before enabling native delivery. Test foreground and background positives, A → B → A, a wrong Core with the same address, busy-state changes, process/chat replacement, changed drafts, expiry and disconnect. Wait for accepted work to drain before checking stale-operation effects.

The next architecture decision needs evidence of the required recipient contract. A completed Herdr Model change and native background mutation remain unverified. Passive background tracking has now been tested separately below.

## P2 implementation checkpoint, 2026-11-14

The comparison is now reproducible in
[`herdr-app-model-probes.test.js`](../../../tests/unit/herdr-app-model-probes.test.js)
using the real native cycle and daemon cycle with in-memory ports. All eight
tests passed. The probes reproduce different catalog ordering, effort-based
skipping and an absent-current-model guess. They also hold the fake settings
receiver after the client's final check. Focus change, A → B → A, expiry and
authorization invalidation each still permit one update in that deliberately
unconditional receiver. These are counterexamples to client-only validation,
not qualification of a new receiver. Native positive probes preserve a
footerless composer and a recognized command-time footer change.

The signed native test pair is App 0.1.14 and Core 0.1.19. Its reviewed artifact
record names App source `2405bf388c568c3ed479f05b8e405ccfa44b3f2c` and Core source
`06793ede1bedb1fed8d22d3cae476d3eb239edf0`, without claiming binary
reproducibility. The newer fixed Core schema was also checked during this
checkpoint. Its key request accepts caller, keys and terminal. Its screen read
returns text/completeness/method information, without a cursor position or the
combined captured conditions needed here.
[Core 0.1.19 schema](https://raw.githubusercontent.com/herdrdev/herdr-core/06793ede1bedb1fed8d22d3cae476d3eb239edf0/schema/hc.openrpc.json)

The installed Codex CLI reported 0.169.0 during the schema-only compatibility
check. All ten methods and parameters currently used by DeckShep were present.
No Codex agent, account or daemon was started for this check. Method presence
does not add App focus or authorization conditions to a settings operation.

| Required fact | Native candidate | API candidate |
| --- | --- | --- |
| App-selected local pane | Supported as a passive observation | Supported as a passive observation |
| Authoritative App → Core connection and exact CLI/root chat | Missing from the reviewed navigation interface | Same missing binding; configured socket/title matching is insufficient |
| Continuous focus/ready revision at commit | No captured App revision in current key request | No captured App revision in current settings request |
| Original deadline and ordered authorization retirement | No qualifying combined interface identified | Counterexample demonstrates the client-only gap; no qualifying receiver identified |
| Native-equivalent initial eligibility | Passive cursor evidence missing | Shared view/cursor evidence and current-picker semantics unqualified |
| Picker order and unchanged effort | Real native cycle is the fixture baseline | Current helper ordering/filtering/absent-current behavior differs |
| Herdr stays behind an editor | Passive projection passed the owned live run | Same passive result; active settings operation unqualified |
| Active same-session setting readback | Not run through real Herdr | Not run through real Herdr |

The live virtual Stream Deck suite passed against the owned signed pair. A
disposable Cocoa editor retained macOS keyboard focus throughout background
selection following and an inert Model press, with zero recorded key events.
Cleanup and unchanged tracked settings were required assertions. The pane
programs emit fixed OSC reports and are not real Codex/Claude sessions.

**Decision:** P1 and the P2 comparison are deliverable. Neither active route
qualifies. P3 shared-contract changes and active P4 qualification remain gated
by a supported recipient mapping. Keep informational Model, both delivery
paths and background/Rex-equivalence requirements. The
[native validation runbook](native-model-validation.md) specifies the future
owned-session experiment without approximating missing guarantees.

The subsequent [Herdr-side prototype](herdr-model-prototype.md) exercises an
actual observation mod in the isolated App and a guarded reference receiver
for each candidate. Existing extension points cover background observations;
the required binding/continuity and conditional-commit interfaces still need
upstream work or equivalent integration inside the owning components.
