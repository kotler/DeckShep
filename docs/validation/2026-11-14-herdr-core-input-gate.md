# Core input gate and delayed Model delivery

On November 14, 2026, the signed test-owned Herdr App 0.1.14/Core 0.1.19 pair delivered ordinary viewer DATA after DeckShep's two-second press deadline. Closing the writer did not discard input already held in Core. This disqualifies raw attach DATA as the production delivery route under the approved controls design. The actual recipient measurements and build hashes are in the [JSON record](2026-11-14-herdr-core-input-gate.json).

## Experiment

The reviewed isolated launcher started a disposable raw-mode input recorder in a third owned pane. That program accepts a fixed six-byte alphabet and records only those synthetic bytes and their receipt times. A separate Core connection issued a bounded key sequence with a known first marker, repeated middle markers and a final marker. Receiving the first marker establishes that Core has entered its busy interval.

The writer then submitted one ordinary DATA byte. A subsequent terminal.get reply on that same framed connection fences acceptance of the earlier DATA frame. Core's reader invokes viewer_input synchronously before dispatching that request. The recipient log contained neither the viewer byte nor the final competitor marker at this fence. Completion of terminal.keys, its final recipient marker and receipt of the held byte establish the later drain. Every case received exactly one held viewer byte.

| Case | Acceptance fence | Writer closed | Recipient received held byte |
| --- | --- | --- | --- |
| Valid positive control | 0 ms | After delivery | 1039 ms |
| Original deadline elapsed | 0 ms | After delivery | 3901 ms |
| Writer closed during busy interval | 1 ms | 13 ms | 3926 ms |
| Earlier viewer effect already received | 0 ms | After delivery | 3043 ms |

Times are relative to the local press timestamp immediately before the viewer write. Recipient timestamps use the same host wall clock. The close column and JSON retiredAtMs field measure the local writer's close request. Core provides no retirement acknowledgement. These timings establish the reproduced failure on this run. The source explains why this queue has no deadline enforcement. The partial case first delivered one separate viewer byte before starting its competing sequence.

A fifth case checked ordinary terminal.keys as a potential replacement transport. The client queued one fixed key while the competitor was active, fenced request acceptance, and closed its connection at 7 ms. The client promise rejected on stream closure. The recipient still received that key at 3937 ms. Core's per-connection request tasks run independently, and cancellation tracking in the reviewed server applies to machine.exec. Socket closure therefore supplies no terminal-key retirement barrier either.

Core's Gate holds bytes per terminal, and set_busy(false) forwards the entire buffer after the automated sequence. The buffer has no operation, connection, retirement or deadline fields. Disconnecting a viewer cannot identify and remove its contribution from that buffer. The newer inspected Core input implementation retains this behavior. [Reviewed Core input](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/input.rs) · [Reviewed viewer input](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/viewers.rs) · [Framed connection ordering](https://github.com/herdrdev/herdr-core/blob/06793ede1bedb1fed8d22d3cae476d3eb239edf0/crates/herdr-core/src/server.rs)

## Executed validation

The final native Playwright experiment passed in 41.0 seconds. It characterizes the delayed-input failures for viewer DATA and the ordinary key RPC. It launched the reviewed private App/Core pair, its private updater containment and a fixed input recorder. Cleanup and unchanged tracked owner settings passed. The experiment used no Codex account or inference.

The 15 mod delivery unit tests, including a new regression for bounded probe sequences and the acceptance fence, passed. Together with the existing native/API comparison file, 23 targeted tests passed. Repository typecheck, lint, formatting, dependency and unused-code checks also passed. Codex's offline protocol compatibility check found all ten existing methods. The ordinary sandbox denied fixture socket creation, so those fixture tests were rerun with permission to create their private temporary sockets.

The final repository regression run completed with 765 passed, four skipped and zero failures across 769 tests. Native evidence here covers the owned input-gate experiment. Physical Stream Deck qualification and active-control production qualification remain outstanding.

The current Core head was rechecked at c84d6e76156a6c2aac1da20efbe800f10acfe897 and App at 5216e6f9f8c0c281a65e09816c66e4319e671784. Their documented mod and input interfaces supply no combined press deadline, App focus revision and retirement condition. Core terminal.send has an optional status condition and a wait timeout. terminal.keys takes caller, terminal and keys. terminal.interrupt has an observation timeout. The Codex 0.169.0 settings schema likewise supplies no App focus/deadline condition. The native/API comparison fixtures reproduce the latter gap, with no native API qualification claimed. [Core schema](https://github.com/herdrdev/herdr-core/blob/c84d6e76156a6c2aac1da20efbe800f10acfe897/schema/hc.openrpc.json) · [Current input gate](https://github.com/herdrdev/herdr-core/blob/c84d6e76156a6c2aac1da20efbe800f10acfe897/crates/herdr-core/src/input.rs) · [Mod API](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/defaults/herdr.d.ts) · [Recorded Codex schema](../plans/herdr-app-agent-controls/prototype-codex-contract.json)

The [Model production plan](../plans/HERDR-APP-MODEL-PRODUCTION-PLAN.md) retains authoritative binding, focus continuity, guarded mutation and readback requirements. Ordinary terminal.keys also uses Core's input queue. AUTOMATIC_INPUT uses this same busy gate and is reserved for terminal-generated replies. The provider API remains a separately evaluated candidate with existing binding, application-ordering and Rex-equivalence gaps.

## Alternative mod paths checked

The follow-up source audit used App 5216e6f9f8c0c281a65e09816c66e4319e671784. Calling terminal.paste through a mod reaches TerminalView::paste, then TerminalView::send, then Core::input. Core::input emits ordinary DATA on the App's existing attach channel. Calling paste inside the App therefore reaches the same Core gate tested above. The clipboard command also provides no captured press deadline. [App terminal input](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/terminal.rs) · [App stream input](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/hc.rs)

The mod host's run function validates commands and enqueues Request::Run. It exposes no terminal commit callback or cancellation barrier for accepted input. Its focused and terminals readers return snapshot values. The Rust host tracks snapshot revisions internally for render invalidation, but those counters are absent from the public mod values. Incrementing a JavaScript counter on renders cannot supply an authoritative revision to Core when it later releases held bytes. [Mod host implementation](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs)

These findings leave the same production constraint for the supported mod paths. Implementing full controls through them requires an explicit change to the approved delivery contract or a compatible receiver that enforces it. The active goal does not itself authorize weakening that contract. The examined alternative paths were traced in source, with native evidence limited to the previously described input-gate experiment.

## Reproduction

Use the current test-owned live authorization and the reviewed candidate directory described in the [runbook](../../tests/e2e/README.md).

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only \
ASW_LIVE_HERDR_APP=1 ASW_LIVE_HERDR_APP_RELEASE=1 \
ASW_HERDR_APP_INPUT_GATE=1 \
ASW_HERDR_APP_RELEASE_ARTIFACTS=/absolute/path/to/reviewed-candidate \
npm run test:e2e:herdr-app-live -- --grep 'Core holds accepted viewer'
```
