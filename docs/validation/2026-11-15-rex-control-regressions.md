# Rex control regression run — 2026-11-15

The owner requested agent switching and return, complete third-row setting
cycles, Interrupt, and removal of the Herdr agent tile's **On deck** caption.
The owner authorized disposable native Rex/Codex/Claude sessions, then chose
to finish without further live testing when fresh Claude access was unavailable.

## Fixes and reproducible regressions

- A confirmed Rex setting waited for optional Codex metadata before publishing
  its frame and releasing the serial press queue. A controller fixture reproduced
  the old Effort caption and pending press while the native fixture had already
  applied the next level. The fix awaits the pane observation independently.
  The regression also exercises subsequent settings and Interrupt while metadata
  stays pending.
- Codex puts Mode beside shortcuts and warnings, then leaves a bare **Plan mode**
  status while a slash command is being typed. These exact native shapes caused
  Mode and a switch-back Model press to refuse. The strict footer grammar now
  accepts both shapes. Tests reproduced both errors before the fix and retain
  refusals for extra draft text and altered hints.
- Claude's native max-effort badge uses a diamond. Missing that glyph prevented
  recognizing the captured level when the badge expired over the slider.
  The parser and existing badge-expiry comparison now recognize it. The new
  regression failed before the fix and still distinguishes level, marker and
  draft changes.
- Herdr agent tiles omit **On deck**. The App dot and consent-off **Deck only**
  caption remain. Local selection still drives navigation destinations.

## Completed non-live checks

| Check | Result |
| --- | --- |
| Full fixture/coverage suite | 837 passed, four live-only skips; 95.36% lines |
| Virtual Stream Deck browser suite | 61 passed |
| Bundled golden suite | Four passed |
| Lint, format, TypeScript, dependency boundaries, Knip | Passed |
| Source privacy, version, compatibility | Passed |
| Marketplace media/check and both dependency audits | Passed; zero audit findings |
| Universal build and package/identity/privacy audits | Passed |

The new controller fixtures use actual host key-down/key-up routing and guarded
delivery. They cover Codex-to-Codex and Codex-to-Claude selection, return, every
offered Model/Effort/Permissions/Mode value, wrapping, other-pane isolation and
bound/unbound working Interrupt. Bound Interrupt exercises the real active-turn
verifier with synthetic transport replies. Existing stale-press, changed-turn,
focus, process, consent, visibility and uncertain-delivery tests remain enabled.
Full Access remains outside the permission cycle. No thresholds or golden JSON,
SVG hash or PNG baselines were changed.

## Native evidence and limits

Native runs used Node 22, Rex `0.1.0-preview.19` / API 14, Codex `0.169.0` and
Claude `2.1.325`. Each run used its own server, private socket, temporary HOME,
repository and owned provider processes. Browser cases substitute a headless
display selection for a Mac GUI client; their button inputs traverse the controller
and guarded delivery. Direct state calibrations exercise native picker algorithms
without Stream Deck routing. Native helpers are copied into the owned root before
launching providers.

Completed native action assertions include Codex Permissions, entering/leaving
Plan, working Interrupt, early and later streaming Interrupt, Claude working
Interrupt, and a complete max-effort browser cycle. Interrupt cases asserted one
Escape and the provider's interruption acknowledgement. The max-effort run
passed its cleanup and unchanged-settings checks.

The broader switching run found the bare-Plan slash-command refusal after cycling
Codex, switching to Claude and returning. That last shape is fixed and covered by
the final fixture suite, but its complete native rerun was not qualified. A
separate Codex question-preparation case did not produce the required native
choice dialog, so it supplies no native question-control claim.

One broader run's final fingerprint check detected changes to Claude's regular
state file. An exact pre-run backup comparison found only
`cachedGrowthBookFeaturesAt` and `cachedFeatureFlagsAt` changed; project,
configuration and credential fields were unchanged. The writer was not traced.
The owner reported idle regular sessions and closed them. The fingerprint check
was retained, and the regular file was left as found.

Subsequent native attempts stopped before provider launch because the default
Claude Keychain access token lacked the required 20 minutes of validity. The
driver neither borrowed a refresh token nor ran login against the regular HOME.
The owner then requested finishing without further live testing. The test-owned
processes were cleaned up. These results do not qualify the complete native matrix,
Mac GUI focus, USB routing or physical MK.2 timing.

## Installed update

The guarded local installer refreshed version `1.5.0.0` after the owner chose
to finish without another native run. It verified preservation of all six
existing profiles (76 files), the integration setup record and merged settings,
plus a complete backup. Stream Deck and the plugin runtime reopened. Installed
runtime bytes matched the tested build.

Runtime SHA-256:
`ebf766400472378cb0520da1c3283ba5b7770a55e1e07556c1aa544cf2ae53fa`.

## Fresh Codex startup follow-up

After that installation, the owner reported Model, Effort, Permissions and Mode
headings without subtitles on a fresh Codex session. A Model press showed
**Unavailable / Agent view…** and left the native screen unchanged.

A controller fixture reproduced that symptom by tearing only the first passive
pane read. With no previous complete observation, the ready keys had no view
digest; the first Model press correctly refused before sending anything. The
regression failed before the fix and passed afterward. This establishes the
failure mechanism in the fixture; no native capture establishes why the owner's
initial read failed.

The observation module now makes one recovery read after 50 ms when its initial
Codex view is unreadable but process proof exists. It rechecks the observation
lifetime, visibility, pane, process identity, chat, directory and state before
starting that read and before publishing. The reader obtains fresh process proof.
Retirement releases waiters immediately and prevents a delayed recovery read.
Recovery never repeats an input. If both reads fail, a Model press still refuses
without sending anything, even if a later native read succeeds. A torn warm read
still loses its digest and retains only its existing bounded display captions.

The final follow-up checks passed: 852 fixture tests with four live-only skips,
95.36% line coverage and 88.51% branch coverage; all 61 browser tests; and four
bundled golden tests. Lint, formatting, types, dependency boundaries, Knip,
source privacy, version, compatibility, Marketplace checks and both dependency
audits passed. No thresholds, golden JSON, SVG hashes or PNG baselines changed.
The controller regressions also cover switching agents and back, every offered
setting and bound/unbound Interrupt. No further live tests ran, as requested.
Fresh native startup and physical deck behavior still need the owner's check.

The follow-up universal build, Elgato validation and package privacy/identity
audits passed. The guarded installer then installed this build and verified all
six profiles (76 files), the integration setup record, merged settings, runtime
bytes and backup. Stream Deck and the DeckShep runtime reopened. This is
installation verification, not a native provider regression run.

Follow-up runtime SHA-256:
`c0dbc34124b09edcb9369f0615c509e934c8180efffdcc410a78817678d85feb`.
