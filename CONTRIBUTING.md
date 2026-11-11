# Contributing to DeckShep

Use macOS, Node 22.13+ (`.nvmrc` selects 22), and Xcode Command Line Tools.
The installed plugin uses Stream Deck's own Node runtime.

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run deps
npm test
npm run test:coverage
npm run test:golden
npm run knip
npm run version:check
npm run compatibility:check
npm run build -- --universal
```

Type checking uses TypeScript 7 through the pinned `@typescript/native` alias.
The existing TypeScript 6 package supplies the compiler API used by Rollup,
inspector fixtures and typed ESLint rules; it is not the type-check command.

These commands build locally and run isolated fixtures. They do not install the
plugin or authorize live testing. Coverage thresholds must not be lowered.
Read [AGENTS.md](AGENTS.md) for architecture and standing safety requirements.
Use Conventional Commits, separate logic, moves, formatting and documentation,
and describe behavior changes, validation, golden changes and open questions.

## Browser fixture preview

After npm ci, run `npm run deck:preview` and open its printed random loopback
URL. It displays the actual 15 SVG/title frames from a disposable bundled plugin.
Scenario/profile controls, manual time and a synthetic input trace need no agent
account, installed Stream Deck, hardware or Swift build. Ctrl-C cleans up the
owned child, temporary HOME/plugin directory and sockets.

Run `npm run e2e:install` once, then `npm run test:e2e`. The exactly pinned
tools-workspace Playwright version determines the Chromium build. Installation
fetches only its headless shell and standard FFmpeg companion from Playwright's
CDN; it installs no full browser or system dependencies. This download is outside
the npm lock file's integrity checks and lands in the OS user cache:
`~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux.
Neither npm ci nor build/package downloads or distributes a browser. Remove the
cache with `node scripts/tool.mjs @playwright/test uninstall`, or run
`npx playwright uninstall` from tools. See [Playwright browser documentation](https://playwright.dev/docs/browsers).

The suite checks exact normalized SVGs, labels and input traces. Its six deck-only
PNG smoke images have OS-specific baselines. `npm run test:e2e:update` is an
explicit baseline change: review the images and explain the reason in the PR.
Never regenerate existing golden JSON to accommodate the browser harness.
CI caches browsers by exact lock-file version, OS and architecture, and uploads
failure reports/diffs for seven days. Reports contain synthetic fixture activity.
An Ubuntu 24.04 trial passed both runs, but all six PNGs differed from macOS;
CI retains macOS 15. The harness itself requires only Node/Rollup, not Swift.
Native provider/focus/clipboard behavior and physical deck scaling still need
their separate validation. See [the harness guide](tests/e2e/README.md).

## Safety boundaries

Keep identity, process ownership, stale-press, focus, cursor/digest, generation,
visibility and consent checks. Unknown or incomplete native state must refuse
the affected control. Mutating requests must never retry after uncertainty.
Do not change plugin/action UUIDs, profile/page/key identities, settings v2/v1
migration, config semantics or stable Claude helper paths as routine cleanup.
Fresh clipboard checks, Herdr title identity and Claude hooks/controls stay off.
The owner-approved prelaunch IDs are documented in [IDENTITY.md](docs/IDENTITY.md);
old preview profiles require recreation and exact hook removal before new setup.
Herdr App remains a disabled fixture foundation with no production capabilities.

Default tests use temporary homes, sockets and test-owned processes only. Never
attach to, start, stop, restart or send input to a developer's existing Rex,
Herdr, Codex daemon or agent. Never use installation, `npm run dev`, optional
integration setup or `streamdeck restart` as a test shortcut. `npm run clean`
removes generated output and coverage only; preserve all private backups.

Live tests need **current explicit maintainer authorization**, `ASW_LIVE=1`,
isolated sockets/repos, test-owned PIDs and before/after settings fingerprints.
Rex also requires `ASW_LIVE_REX=1` and ownership proof. Never run live tests in CI.
Historical validation is evidence, not authorization to reuse a session.

Do not include prompts, transcripts, credentials, raw settings, home paths or
private workspace paths in fixtures, logs, issues or artifacts. Use synthetic
identities and content. Keep key errors within 15 characters and inspector
messages within 160. Do not bypass the package privacy/path/default audits.
Report potential guard bypasses privately using [SECURITY.md](SECURITY.md).

## Verifying another upstream version

Unverified versions disable affected controls by design. An upstream version
number alone does not establish compatibility. Keep any verification change
small and include the exact application/provider versions and evidence scope.

1. Inspect the new protocol and capture sanitized fixtures with synthetic IDs,
   state and content. Verify discovery, identity, native focus, capabilities,
   controls and refusal cases, including incomplete/malformed responses,
   unsupported versions, stale targets, reconnects, changed drafts and cursors.
2. Add fixture/contract tests before changing a version gate. Codex versions
   are not pinned (owner decision, 2026-11-10): `knownServerVersion` in
   `src/agents/codex/daemon.ts` only requires the daemon to report a release
   version. Each control still checks its own native contract on every press;
   when a Codex release changes one, fix that check rather than adding a pin.
3. For Herdr TUI, verify both the snapshot check in `src/app/herdr-session.ts`
   and ping handshake in `src/terminals/herdr-tui/rpc.ts`. Both currently require
   `0.9.5` (including its suffix variants) and protocol `22`. Extending only one
   check does not establish a supported session. No composer cursor means no
   staged Send, Steer or Queue, even after version verification.
4. Claude native controls accept any native Claude Code release (owner decision,
   2026-11-10; no version is pinned in source) and require explicit hook/control
   opt-ins. A new release must still pass request, process, root identity,
   focus and completion checks; never substitute transcript matching for them.
5. Run the full commands above. Golden JSON must stay byte-identical unless a
   deliberate behavior change is independently justified in writing. Do not
   regenerate snapshots merely to make a new version pass. Update capability
   declarations only for verified behavior, then run `npm run compatibility` and
   check the generated matrix. Fixture success does not prove native or hardware
   compatibility. Request authorization before any isolated live calibration.
6. Record remaining native, physical, clean-Mac and CPU checks in the beta
   checklist. Do not expand public support claims beyond the evidence.

## Licensing and branding

Contributions are provided under [Apache-2.0](LICENSE). Keep notices and
third-party attribution intact. The DeckShep name and key-and-crook artwork are
reserved; renamed forks must replace them as described in [TRADEMARKS.md](TRADEMARKS.md).
Provider marks remain their owners' trademarks with permission pending.
Publishing, merging, releases and Marketplace submission remain maintainer actions.
