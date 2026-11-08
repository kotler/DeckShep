# Virtual deck validation — 2026-11-08

Scope: approved virtual-deck plan, Phases A–E, stacked independent draft PRs.
The identity reset was merged separately in PR #7 (`141237f`). No installed
plugin/profile, real agent, account, hook, terminal or production settings were
used or changed. No release or repository visibility change was made.

| Phase | Commit | Review |
| --- | --- | --- |
| A: reusable fixture host | `f715b7a` | [#8](https://github.com/kotler/DeckShep/pull/8) |
| B: scenarios/manual time | `107ba70` | [#9](https://github.com/kotler/DeckShep/pull/9) |
| C: loopback browser preview | `209747f` | [#10](https://github.com/kotler/DeckShep/pull/10) |
| D: Playwright/exact SVG checks | `402fbc5` | [#11](https://github.com/kotler/DeckShep/pull/11) |
| E: CI/contributor instructions | `091588c` | [#12](https://github.com/kotler/DeckShep/pull/12) |

All ten local checks passed: lint, formatting, strict production/e2e type checking,
dependency boundaries, tests, coverage, golden tests, knip, version consistency
and compatibility. Node suite: 129 tests, 127 passed, two explicitly disabled live
tests skipped. Four new subprocess/protocol tests cover scenario switching/time,
packaging isolation and loopback server/control lifecycle. The prior host test
retains its assertions. Coverage remains 93.86% lines/statements, 85.57% branches
and 88.01% functions. All five existing golden JSON files remain byte-identical.

The browser suite has 18 tests. A complete run passed; two repeated executions
passed 36/36 without retries, randomness or observed flakiness. Each reset starts
the manual clock at 10000 ms. Ten named scenarios are synthetic. Exact assertions
cover all coordinates, labels, selected dots, normalized SVG hashes and input
traces. New SVG baselines contain 105 hashes across seven states. Exactly six
reviewed deck-only macOS screenshots cover idle, working, question, Herdr,
offline and overflow. These are initial baselines of existing plugin behavior,
not replacements for the existing golden files.

Playwright 1.65.0 is exactly pinned in tools and the root lock file. Installation
used only Chromium headless shell revision 1254 plus its standard FFmpeg companion,
from Playwright's CDN into the user cache. No full browser or system dependency
was installed; npm ci/build/package never download browsers. Full-tree
`npm audit --audit-level=high` passed without audit exclusions (existing low and
moderate advisories remain). Universal build, package, ZIP verification and both
synthetic media checks passed. The package audits refuse fixture-only code,
tests, reports and browser-cache artifacts.

## Preserved behavior and limits

Actions execute on key-down, with no separate production key-up action. Pending
verification is paused only inside the fixture to test state/profile changes
before delivery. Brief short refusal images are recorded in the trace even when
a new context replaces them. A disappeared key is unregistered and ignores later
presses; the preview dims/disables it instead of inventing a production alert.

The offline placeholder's existing second `UNKNOWN` text element has an undefined
y-coordinate. The smoke baseline preserves that renderer defect; a separate
production fix needs a focused regression test. Unsupported synthetic native
operations fail closed. These checks do not establish native provider/focus/
clipboard correctness or hardware scaling; the property inspector remains out
of scope.

## CI platform calibration

The virtual host needs only Rollup bundling; it does not invoke Swift. The first
[CI calibration](https://github.com/kotler/DeckShep/actions/runs/42507632483)
passed the [macOS 15 browser job](https://github.com/kotler/DeckShep/actions/runs/42507632483/job/128813613933)
and the [Ubuntu 24.04 trial](https://github.com/kotler/DeckShep/actions/runs/42507632483/job/128813613685).
Linux generated six own baselines and passed a second run against them (18 tests
each time). The comparison step reported: “Linux fixture checks passed with six
own baselines; 6/6 PNGs differ from macOS.” These are PNG-byte differences; exact
SVG/label/trace assertions passed on both platforms. No system dependencies or
full browsers were installed. Linux report/images were uploaded as the temporary
`virtual-deck-linux-trial` artifact with seven-day retention.

Decision: retain macOS 15, as required when platform output differs. Remove the
temporary Linux job instead of paying for duplicate platform calibration on every
PR. No Linux baseline is promoted into the required macOS smoke suite. The final
browser job caches by exact lock-file Playwright version, OS and architecture;
failure reports/traces/diffs are uploaded for seven days. Existing full-tree
audits and the production verify job remain intact.
