# Virtual deck checks

`npm run deck:preview` prints a random `http://127.0.0.1:PORT` URL. It serves
only this fixture page and its script, accepts same-origin control connections,
and forks a bundled plugin in a disposable OS temporary directory with its own
HOME. Ctrl-C stops that child, closes its sockets and removes its directory.
No real agents, terminals, installed plugin, accounts or Stream Deck app are used.

Run `npm run e2e:install` once, then `npm run test:e2e`. Playwright is pinned
exactly in the tools workspace; the lock file fixes its Chromium revision.
The install command downloads only Chromium's headless shell and the standard
FFmpeg companion, without a full browser or system dependencies. Downloads come
from Playwright's CDN, outside npm lock-file integrity verification, and land in
the OS user cache (macOS: `~/Library/Caches/ms-playwright`; Linux:
`~/.cache/ms-playwright`). Neither npm ci nor build/package downloads a browser.
Use `node scripts/tool.mjs @playwright/test uninstall` to remove Playwright's
cached browsers. `npx playwright uninstall` also works from the tools workspace.

The page exposes `window.deck.ready`, `press(row,col)`, `down/up`,
`setScenario(name | object)`, `advance(ms)`, `switchProfile('rex' | 'herdr' | 'herdr-app')`,
`setKeySettings(row,col,settings)`, `setPreferences(patch)`, `keys()`, `trace()`
and `reset()`. Preferences have the real profile restrictions; they affect only
the disposable fixture. The trace includes guarded synthetic native inputs,
hardware alerts and short refusal frames. Time never advances on its own.
The fake native operations fail closed if an unsupported read/control is invoked.

`pauseFocus()` pauses the next fixture focus verification. A following `down()`
returns when that verification is suspended; scenario/profile changes may then
interleave, and `up()` releases it. Production actions run on key-down and ignore
key-up: this tests a pending guarded action, not a new long-press behavior.
A disappeared key is unregistered, dimmed and disabled in the page; a synthetic
press on its former context is ignored with no input. No production error is
invented for that event. Context changes can replace a brief refusal image with
the new layout; the original short refusal remains in the trace.

The Rex/TUI deck now stays on dynamic Home. Group controls are Next agent,
Page (agent banks) and Collapse, and hide when they have no work. The old
interaction-page actions are inactive, including explicit legacy overrides.
Question/approval controls remain contextual in row 3.
The Rex navigation case removes provider chat/native identities and verifies
agent selection, Next, Page and Collapse using synthetic terminal titles/status.
The production Bridge/provider-failure boundary is covered separately by the
Rex navigation integration tests; browser fixtures never probe a real provider.

To run just the automated Herdr App navigation walkthrough from the repository root:

```sh
npm run test:e2e -- tests/e2e/herdr-app.spec.ts
```

Playwright clicks virtual keys, checks the displayed mode and selection, and
compares the recorded focus requests with the expected panes. It also pauses a
press between key-down and dispatch to exercise changes in rank or App selection.

`herdr-app-panes` uses App pane records without synthetic provider PIDs/chat
identity. Its request backend exists only in the substituted fixture bundle;
no native helper/Swift build is needed. Set an absolute synthetic App home and
`herdrAppFocusRequestEnabled` explicitly to exercise requests. Selection, Next and Attention
trace only `['pane.focus', pane]`, return requested/not verified, and never change
the model selection merely because a request was acknowledged. App banks and
Collapse are local. The pause API also covers request-consent revocation and
profile changes before the final fixture write. Production records remain empty.

## Baseline review

`expected/svg-sha256.json` stores SHA-256 hashes of all 15 normalized SVGs for
startup and six representative states. Only whitespace between XML elements is
normalized. These checks, labels and exact input traces are browser independent.
The six PNGs in `__screenshots__` cover idle, working, question, Herdr, offline
and overflow, cropped to the deck. They are the only screenshot assertions.
`npm run test:e2e:update` updates them deliberately; review every changed image
and SVG hash, explain the reason in the PR, and keep existing golden JSON intact.
The initial baselines capture existing plugin output without a production change.
Each OS has separate PNGs because font rasterization can differ.

The offline placeholder currently emits a second `UNKNOWN` text element with an
undefined y-coordinate; Chromium places part of it above the key. The baseline
records that pre-existing renderer defect. Fix it in a separate production change
with a focused regression test, rather than silently changing this harness phase.

These tests prove fixture logic/rendering and host-protocol routing. They do not
verify native Rex/Herdr/provider behavior, actual clipboard/focus or Stream Deck
hardware scaling. Separate inspector browser tests use the pinned sdpi library
with mocked host replies: refresh routing, missing-reply feedback and the Rex
footer-check message staying in view. No scenario uses randomness or a model
account; the manual clock starts at 10000 ms on every reset.

Interrupt has explicit browser cases for one Escape on a bound working agent,
no input for an idle agent, and no input without a Codex chat binding. The
fixture must refuse a missing captured chat ID just as the real Bridge does;
two absent IDs are not a verified match. Metadata acquisition and the native
active-turn read are substituted here. The Rex integration tests separately
exercise the real Bridge/footer/active-turn guards with synthetic transport
replies. Neither level proves that an installed agent currently has the required
footer, metadata hooks or control consent.

The startup baseline leaves all five contextual keys blank until Rex has a selected agent. Closing the selected pane clears that row as well.

## Live Herdr App navigation

The separate `npm run test:e2e:herdr-app-live` suite runs the virtual deck
against test-owned copies of the reviewed signed App 0.1.14 and Core 0.1.19.
The release launcher verifies the copies, contains the updater and checks
process and socket ownership. Its two calibration terminals stay plain.
Two additional disposable programs emit fixed OSC 7501 reports for idle Codex
and waiting Claude. Neither program uses a provider account.

With current authorization for that pair, set the candidate path to the private
folder containing the matching `release-candidate.json` and run:

```sh
ASW_LIVE=1 ASW_LIVE_AUTHORIZATION=test-owned-only \
ASW_LIVE_HERDR_APP=1 ASW_LIVE_HERDR_APP_RELEASE=1 \
ASW_HERDR_APP_RELEASE_ARTIFACTS=/absolute/path/to/reviewed-candidate \
npm run test:e2e:herdr-app-live
```

Chromium clicks the virtual deck on a real clock. The test checks local
selection, consented Next and Attention requests and consent revocation.
An independent peer-verified App read checks which pane Herdr selected.
A pass also requires verified cleanup and unchanged tracked settings.
The ordinary Playwright suite keeps the synthetic stale-press and timing cases.
