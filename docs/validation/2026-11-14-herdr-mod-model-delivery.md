# Herdr mod Model delivery validation

Date: 2026-11-14

## Native result

The actual JavaScript mod changed a real, test-owned Codex 0.169.0 instance
from GPT-6-Luna to GPT-5.6-Sol, the next entry in its native picker. High
reasoning effort was preserved. A separate guarded inspection reopened the
native picker and read the current model/effort markers, then cancelled both
menus. The seven-write Model cycle completed inside the original two-second
client deadline; exact timings and binary hashes are in the
[sanitized JSON](2026-11-14-herdr-mod-model-delivery.json).

The disposable editor stayed frontmost with zero key events and no focus loss.
The other CLI instance received no Model input. Saved model/effort/provider
defaults and the full private config bytes matched the post-startup baseline.
No account credentials, inference requests, owner agents or shared daemon were
used. Owned process cleanup and unchanged tracked owner settings were required
assertions.

The final native invocation ran both the new Model test and the existing
virtual Stream Deck navigation/observation regression on separate owned pairs.
Both passed. App 0.1.14/Core 0.1.19 were the reviewed signed artifacts; the report
records their source mapping and executable hashes without claiming reproducible
binaries from newer source heads.

## Refusal and uncertainty evidence

| Native case | Observed result |
| --- | --- |
| Press already expired | Refused; zero writes |
| Captured pane no longer selected | Refused; zero writes |
| Retired operation | Refused; zero writes |
| First input held in helper, then retirement | Refused; zero writes |
| First input held, then selection changed | Refused; zero writes |
| First input held, then selected away and back | Refused; zero writes |
| First input held past its original deadline | Refused; zero writes |
| Selection changed after paste/Enter opened the picker | Uncertain; exactly two writes; picker remained open with the current model unchanged; no retry, fallback or cleanup keys |

These holds are in the helper before a Core DATA write, not inside Core after
acceptance. The observed focus revision is not an authoritative App publication
counter. Core busy-input holding, arbitrary existing CLI/root-chat binding,
reconnect continuity and active-viewer size ownership remain unqualified.
Production capabilities and the installed Model key are unchanged.

## Harness corrections during development

Earlier attempts stopped during isolated Codex startup. Read-only configuration
diagnostics identified failed managed-preference synchronization. Scoped native
denial logs identified a disk-space query and preference shared-memory reads.
The model-specific containment policy now permits those reads and the Codex
preference domain; it grants no preference writes or arbitrary network access.
CoreFoundation's home is also directed to the disposable home.

Another initial assertion compared config bytes with the pre-launch template.
The final assertion uses the actual post-startup baseline and checks both
semantic defaults and full bytes. The native picker inspection handles the
CLI's footerless composer without installing or editing a status line.

Failed development attempts are not recorded as passed acceptance runs.

## Evidence boundaries

The browser Model key uses a prototype test adapter that invokes the real mod.
It does not exercise an enabled Model action in the production controller.
The separate navigation regression does use the existing virtual Stream Deck
plugin harness. Neither result grants hardware or release qualification.

The [prototype report](../plans/herdr-app-agent-controls/herdr-mod-model-delivery-prototype.md)
describes the supported extension route and reproduction command. No upstream
source change, installation, Stream Deck restart, golden update or screenshot
baseline update was performed.

## Executed checks

| Check | Result |
| --- | --- |
| Final `npm test` | 764 passed, four skipped, zero failures (768 total); includes Rex and golden regressions |
| Mod delivery and binding-probe unit files | 17 passed; 14 cover the new mod/stream/relay path |
| Live Model and virtual Stream Deck navigation tests | Both passed, 37.5 s and 35.1 s respectively; 1.2 minutes total |
| `npm run typecheck` | Passed; the new stream helper is now included in the CI typecheck |
| `npm run lint`, `format:check`, `deps`, `knip` | Passed |
| `npm run version:check`, `compatibility:check` | Passed |
| `git diff --check` | Passed |

Coverage, packaging, a universal release build and physical Stream Deck testing
were not run for this test-only prototype. No production source or capabilities
were changed.
