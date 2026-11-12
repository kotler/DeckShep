# Recorded terminal frames

Frames a provider really drew, used as input for the screen readers. Tests that
only use a hand-written simulator pass whenever the simulator and the reader
share the same guess; these frames are the check against the real layout.

Layout: `<provider>/<release>/<scenario>-<NN>.json`, for example
`claude/2.1.322/picker-03.json`. Each file holds the plain text, the raw VT
stream, the cursor, the key that produced the frame (`after`) and `expect`.

## Recording

Recording is part of a live run and needs the same explicit authorization as
any test in `tests/live` (see `tests/live/README.md`). It uses only the
provider process that run starts in its own private Rex session.

```sh
ASW_RECORD_FRAMES=1 ASW_LIVE=1 ASW_LIVE_REX=1 npm run test:live
```

Without `ASW_RECORD_FRAMES=1` nothing is written.

## Before committing a frame

1. Read it. Home and temp paths, the user and host name, addresses and long
   tokens are masked with `x` of the same length, so columns do not move. Mask
   anything else that is private the same way: never change a line's length.
2. Fill in `expect` with what a person sees on that screen. The corpus test
   checks only the keys you give:
   - `"ready": true` for an empty prompt the idle keys may act on,
   - `"effortSlider": "high"` for the highlighted level of the open slider,
   - `"settings": { "model": "…", "effort": "…" }` for the idle footer,
   - `"interruptCue": true` when the working screen offers Escape.
3. Run `npm test`. A reader that disagrees with `expect` fails by file name.

A release counts as tested (`src/agents/claude/tested-range.ts`) once its
frames are recorded, reviewed and passing.
