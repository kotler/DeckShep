# Herdr-side Model prototype

Date: 2026-11-14

This records the earlier observation/reference phase. The subsequent
[mod delivery prototype](herdr-mod-model-delivery-prototype.md) demonstrated a
real native Model change using existing extensions and a direct Core stream.
Upstream changes are out of scope; the full production guard contract remains
unqualified.

This phase kept the installed Model button informational and established useful
background observations. It did not establish the full binding and
recipient-enforced conditions required by the approved design. Later work used
the existing attach stream to demonstrate real Model delivery; broader
production qualification still needs these guarantees.

## What was built

An observation-only mod runs in the test-owned App home. Its private layout
places a non-focusable probe above the active terminal. It reads `focused()`,
`panes()`, `terminals()` and `window()` and answers one fixed snapshot command
through a precreated private file. Existing-file replacement uses Herdr's
`writeTextFile` expected-content check. The mod never calls `exec`, `hc`, `run`,
focus operations or terminal input. It records address/process metadata and
available field names, without titles, folders, terminal contents or prompts.

The live virtual deck compares these snapshots with peer-verified reads from
the owned App/Core. A disposable Cocoa editor remains frontmost. The experiment
also switches A → B → A without asking the mod for an intermediate snapshot.
The final snapshot can match the first focused target while exposing no
receiver-issued focus revision. The mod's response sequence counts snapshot
requests and cannot stand in for focus continuity.

A separate in-memory reference receiver demonstrates proposed guarded Model
semantics for both paths. It uses the real Rex `cycleCodexSetting` parser and
an owned `KeyboardScreen`, with single-use captures, immutable binding/route
checks, initial arming, an original press deadline, ordered invalidation and a
comparison immediately before each effect. It rejects held work after focus,
App/Core/connection/terminal/CLI/chat replacement, readiness or view changes.
It preserves uncertainty and partial state without retry or cleanup keys.

The API reference uses a copy of the screen and the real Rex cycle as its
eligibility/order oracle. That supplies a fixture comparison, not a method of
discovering a real CLI catalog. It changes only in-memory state. Neither
reference path sends input to Herdr or changes a real Codex model. The full
production kernel/service integration remains gated by the real mapping.

## Evidence boundaries

The native run uses the reviewed signed App 0.1.14/Core 0.1.19 pair. It exercises
the actual mod runtime, App selection and Core process metadata. Its agent
programs are fixed OSC reporters. They are not Codex or Claude sessions.
The reference receiver's model cycles are simulated. No owner agent, daemon,
installation, profile or credential is changed by this prototype.

Static inspection also examined current upstream heads, pinned in the
[source manifest](prototype-source-manifest.json). Native results do not claim
to validate binaries built from those heads. Offline generation inspected the
installed Codex 0.169.0 protocol using a fresh private HOME with no credentials
or daemon. Its exact fields are in the
[Codex contract record](prototype-codex-contract.json).

## Existing extension points

| Surface | Available evidence or behavior | Remaining requirement |
| --- | --- | --- |
| App mod `focused`/`panes` | Selected context and cached pane facts, including selection behind another Mac app. | App process/window binding, connected Core identity and connection lifetime, continuous focus revision and keyboard-view eligibility. |
| Mod `terminals` | Initial PID, creation time and other cached Core terminal metadata. These can agree with a direct Core read in the owned run. | Fresh process owner/start/executable proof and exact provider root-session identity. Cached agreement alone cannot prove the App's current connection. |
| Mod `nextCommand`, private file exchange | A custom command can trigger an observation reply while Herdr is in the background. | The callback reads the latest published snapshot; it does not establish a publication barrier or recipient guard. Arguments are not forwarded as a conditional operation. |
| Mod `exec`/`hc` | Can start separate commands with the App's environment. | A new `hc hello` describes that new connection. It does not expose the App's existing `Core` object's connection lifetime. A forwarding helper still needs enforcement where input/settings are committed. |
| Core `terminal.read` | Text, completeness and read method. | A passive text/cursor observation sufficient for the native empty-composer and menu guards. |
| Core `terminal.keys` | Addressed named keys after the quiet-period queue. | Expected binding/focus/state/view/authorization revisions and deadline checked before each write. |
| Core `terminal.send` | An `if` status condition and cancellation checks during parts of waiting. | Exact App/session conditions, original press expiry and ordered retirement at each effect. It also pastes and submits, rather than exposing the complete native picker cycle. |
| Codex `thread/settings/update` | A thread-addressed settings write. | Expected App focus, provider state/settings, deadline and retirement coordination. Its existing model catalog selection also needs Rex parity. |

Current App mods expose internal cached values; their per-field redraw counters
are not public delivery tokens. Core's input implementation prepares steps and
later sends individual writes, with pauses in between. A mod or proxy that checks
once and then calls an unconditional key/settings method leaves the same queue
interval reproduced by the earlier probes.

The pinned [App mod host](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs)
and [Core input implementation](https://github.com/herdrdev/herdr-core/blob/c84d6e76156a6c2aac1da20efbe800f10acfe897/crates/herdr-core/src/input.rs)
support this distinction between observation, request preparation and effect
commit. The source manifest supplies the full inspected file list.

## Remaining production requirements from this phase

These are required guarantees, not existing wire fields. The source changes
discussed below were proposals from the earlier investigation, not an approved
implementation dependency. The owner has since ruled upstream changes out.

1. **App observation and continuity.** Expose the exact connected Core identity
   and connection epoch alongside the App process/window and selected terminal.
   Supply revisions that advance on every relevant selection/eligibility change,
   including away-and-back and reconnects. Provide a supported freshness barrier.
   The App already owns its `Core.hello` and focused terminal view; the public
   mod snapshot currently omits the needed lifetime and revision contract.
2. **Provider binding.** Associate the proven terminal process lifetime with
   the exact Codex root chat through trusted provider registration/evidence.
   Keep names and working directories as display facts. This may use a supported
   bridge rather than a new Herdr provider implementation, but the association
   must survive the two-chats-in-one-folder and PID-reuse tests.
3. **Conditional commit and retirement.** At the actual terminal/settings
   committing authority, consume an exact one-use request only while the captured
   identities/revisions, authorization and original deadline still hold. Order
   invalidation and commit on the same authority and acknowledge the committed
   effect count and absence of future effects. Cancellation after a write cannot
   undo it; report partial/uncertain outcomes and require explicit recovery.
4. **Route evidence.** For native delivery, expose a passive view/cursor and
   conditional writes so the existing Rex picker algorithm can be reused. For
   API delivery, prove equivalent catalog order, effort, composer/picker
   eligibility and session-only behavior, plus enforcement at settings commit.

The source investigation located snapshot publication in `mods.rs`, selection
and view ownership in `window.rs`, the connection owner in `hc.rs`, and queued
input in Core. These explain the missing guarantees; they are not tasks to
change upstream components. A standalone forwarding mod does not by itself
establish conditional commit in those authorities.

Both delivery paths remain open. The native path can reuse Rex's picker order;
the API path still needs a demonstrated equivalent catalog/eligibility source.
Neither route has been promoted into production capabilities or the installed
private preview. The next production gate is a supported recipient contract
that passes the same held-work and background cases as this reference receiver.

## Reproduction

Run the fixture tests without live flags:

```sh
node --import tsx --test tests/unit/herdr-app-guarded-model-prototype.test.js tests/unit/herdr-app-binding-probe.test.js
```

With current authorization for the owned signed pair:

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only \
ASW_LIVE_HERDR_APP=1 ASW_LIVE_HERDR_APP_RELEASE=1 \
ASW_HERDR_APP_MODEL_PROTOTYPE=1 \
ASW_HERDR_APP_RELEASE_ARTIFACTS=/absolute/path/to/reviewed-candidate \
npm run test:e2e:herdr-app-live
```

The flag adds only the test-owned mod and reference comparison. The report is
written under `test-results-live/` after the full run verifies cleanup and
unchanged tracked settings. The [validation record](../../validation/2026-11-14-herdr-model-prototype.md)
records only checks actually completed.
