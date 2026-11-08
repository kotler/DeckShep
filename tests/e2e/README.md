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

`herdr-app-panes` uses App pane records without synthetic provider PIDs/chat
identity. Its request backend exists only in the substituted fixture bundle;
no native helper/Swift build is needed. Set an absolute synthetic App home and
`herdrAppFocusRequestEnabled` explicitly to exercise requests. Selection and Next
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
hardware scaling. Inspector UI is outside this phase. No scenario uses randomness
or a model account; the manual clock starts at 10000 ms on every reset.
