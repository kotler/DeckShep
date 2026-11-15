# Model delivery through a Herdr mod

Date: 2026-11-14

## Result and scope

Herdr's existing mod framework can deliver a native Model cycle to a real,
isolated Codex CLI while Herdr remains behind an editor. The prototype changed
GPT-6-Luna to the next entry in that session's native picker, GPT-5.6-Sol, and
preserved High effort. A separate operation reopened the picker, read its current
model and effort markers, and cancelled without applying a setting. The saved
defaults and the other CLI instance remained unchanged.

No Herdr App, Core or Codex source changes were needed. The owner has ruled
upstream changes out. This supersedes the earlier categorical feasibility
conclusion in the [observation-only prototype](herdr-model-prototype.md).

This is a test harness implementation, not an installed control or a qualified
production backend. The browser key dispatches to the mod through a test adapter;
it does not enable the production controller's informational Model key. The local
helper runs inside the test parent and is not packaged as a service. The
[validation record](../../validation/2026-11-14-herdr-mod-model-delivery.md)
and its JSON separate actual native results from fixture coverage.

## Supported delivery path

1. Capture the App-selected space/tab/pane/terminal and process facts before the
   test key press. Put one nonce and the original press time in a private request
   file, then notify the mod through its fixed App command.
2. The non-focusable JavaScript mod runs the unchanged Rex
   `cycleCodexSetting` algorithm. Each read or input goes through
   `herdr.exec` to a fixed, bounded C relay and its private Unix socket.
3. The test helper verifies the owned App/Core endpoints, connected Core identity,
   CLI lifetime, captured target, fresh mod observation, observed focus revision,
   view digest, sequence, retirement and original two-second deadline. Each input
   also passes through the real `DeliveryKernel` and its single-use permit, using
   an explicitly test-only backend and verification key.
4. A Core framed `terminal.attach` stream supplies the screen and cursor.
   `@xterm/headless` decodes the paint and subsequent output. Input uses ordinary
   DATA on that exact terminal's stream. The helper sends no OS keyboard events,
   activation requests, focus frames, resize frames or AUTOMATIC_INPUT frames.
5. Reopen the actual picker in a separate guarded operation to read back current
   model and effort, then cancel. Preserve uncertainty after any possible effect;
   never retry, fall back or send cleanup keys after a failed cycle.

The important addition to the earlier investigation is the direct attach stream.
It avoids the ordinary quiet-period wait of `terminal.keys`, and exposes a real
cursor through the terminal paint. These are documented existing interfaces.
[Core protocol](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/schema/README.md) ·
[Viewer input](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/viewers.rs)

The fixture tests exercise the actual bundled mod and Rex parser, including a
lost reply, observed focus ABA, cursor-only changes, changed views, replayed
steps, expiry and process replacement. The native test also holds work inside
the helper before a first write, changes selection or authorization, then
releases it. It separately stops a cycle after opening the picker and requires
an uncertain result without compensating input.

## Isolation and remaining qualification

The signed App 0.1.14/Core 0.1.19 pair runs under the reviewed owned launcher.
Two copied Codex 0.169.0 processes use a fresh home, private configuration, a
custom offline provider endpoint, no credentials and `--no-daemon`. No prompt,
model inference, owner agent or shared daemon is used. The relay and CLI bytes
are pinned in the native report. Codex's startup preference synchronization
needs scoped read access to its managed-preference domain, its preference shared
memory and disk-space information. Preference writes, external file writes and
arbitrary network access remain denied.

The native held tests stop work before the helper writes to Core. They do not
prove conditional enforcement inside Core after DATA has been accepted. Core
can hold viewer bytes while another automated input is active; the stream has no
captured deadline or retirement field. That busy-input case was not exercised
in this run. [Core input gate](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/input.rs)

The mod's render counter records observed transitions. It is not a guarantee
that every coalesced App focus change or reconnect is observed. The test-owned
launch supplies the App/Core/CLI relationship; arbitrary already-running agents
still need authoritative connection and root-chat binding. Standalone helper
installation, lifecycle and production controller integration also remain.

The attach is an active Core viewer. Although the helper sends no resize frames
and attaches at the observed dimensions, attaching or typing can affect Core's
viewer/size ownership. Safe coexistence with an independently resized App viewer
has not been qualified.

Keep the approved guards and background behavior as requirements. Keep both
delivery candidates documented and the installed Model key informational while
these qualification gaps are resolved within the no-upstream constraint.

## Reproduction

Fixture checks need no live flags:

```sh
node --import tsx --test tests/unit/herdr-app-mod-delivery.test.js tests/unit/herdr-app-binding-probe.test.js
```

With current authorization for test-owned native instances:

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only \
ASW_LIVE_HERDR_APP=1 ASW_LIVE_HERDR_APP_RELEASE=1 \
ASW_HERDR_APP_MOD_MODEL=1 \
ASW_HERDR_APP_RELEASE_ARTIFACTS=/absolute/path/to/reviewed-candidate \
ASW_HERDR_APP_MOD_CODEX=/absolute/path/to/codex \
npm run test:e2e:herdr-app-live -- --grep 'Herdr mod delivers Model'
```

The separate `ASW_HERDR_APP_MODEL_PROTOTYPE=1` flag retains the older
observation/reference experiment in the navigation test. It does not enable
this real CLI delivery test.
