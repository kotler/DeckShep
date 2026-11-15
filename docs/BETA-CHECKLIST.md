# Beta verification gates

Use the [current Rex beta plan](plans/REX-BETA-PLAN.md) for the verification order and the [Rex walkthrough](validation/2026-11-11-rex-beta-walkthrough.md) for per-control results.

Current setup and control limits are in [Installation](INSTALL.md), [Herdr](HERDR.md),
[Claude](CLAUDE.md) and [Compatibility](COMPATIBILITY.md).

Historical results are retained in the [November 7 checkpoint](validation/2026-11-07-beta-checkpoint.md),
[Herdr validation](validation/2026-11-06-herdr.md) and
[Claude validation](validation/2026-11-07-claude.md). Passing fixture tests does not
establish hardware or live compatibility. Historical scratch-session permission
is not authorization to reuse a running agent.

## Automated release gate

- [ ] Run `npm ci`, `npm run lint`, `npm test`, `npm run test:coverage` and `npm run build`.
- [ ] Validate and audit the packaged archives and checksums using the release procedure.
- [ ] Confirm fresh consent, Herdr identity and Claude integration defaults stay off.
- [ ] Confirm all baseline golden snapshots are unchanged, or explain each change.

## Remaining physical and independent validation

- [ ] Claude physical multi-select Toggle → Review → Submit.
- [ ] Claude running controls in Rex; Rex Claude questions, approvals and guarded submissions.
- [ ] Sign off on Claude approval/navigation responsiveness.
- [ ] Physical mixed-agent navigation with native controls in the Rex profile.
- [ ] Validate optional hook ancestry, watcher behavior, live renames and removal.
- [ ] Hooks-only Claude (isolated config directory, disposable sessions): record which of `model`, `effort.level` and `session_title` arrive per event (headless results on 2.1.319 and 2.1.322 are in docs/CLAUDE.md), and in an interactive session whether PostModelSwitch fires for a session-only (`s`) change.
- [ ] Hooks-only Claude: an idle session keeps controls through press-time proof; `/clear`, `/resume` and restart revoke them; Model/Effort, questions/approvals and Interrupt work in Rex with no status line installed.
- [ ] Legacy Claude setup with the DeckShep status line: **Restore your original status line** and removal both put the original back.
- [ ] Validate customized/default keybindings and session-only settings preservation.
- [ ] Install on a Mac without this development checkout and complete setup without assistance.
- [ ] Verify Intel helper execution before advertising Intel support.
- [ ] Exercise Rex quit/reopen only in a disposable environment.
- [ ] Finish validation cleanup and compare original settings fingerprints.

## Herdr App navigation release

- [x] Isolated signed App 0.1.16 / Core 0.1.21 lifecycle, restart/reconnect and
  stale-target calibration, with owned cleanup and unchanged tracked settings.
- [ ] Resolve or explicitly review the live virtual-deck background-editor
  assertion that failed with Chrome frontmost. See the [native record](validation/2026-11-15-herdr-app-0.1.16-core-0.1.21.md).
- [ ] Physical agent selection, Next/Page rapid presses, closed-slot Collapse,
  Attention ranking and profile switching with the navigation-only package.
- [ ] Validate hidden/minimized/full-screen and dialog behavior for plain requests.
  Acknowledgements never prove keyboard focus.
- [ ] Fresh-account install/upgrade with the bundled Herdr App profile, separate
  consent and unchanged Rex customization.

## Deferred Herdr controls

Herdr TUI distribution and Herdr App agent input stay deferred. The input-gate
characterization reproduced delayed effects after expiry and writer closure on
Core 0.1.21. Model and other provider controls require their own qualification.
See [the controls production plan](plans/HERDR-APP-MODEL-PRODUCTION-PLAN.md).

Live tests require fresh explicit authorization, `ASW_LIVE=1`, isolated sockets and
only test-owned PIDs. Do not operate existing agents or the user's shared daemon.

## Owner release decisions

The owner selected DeckShep, profiles Rex / Herdr App for the 1.5.0 navigation scope
(owner direction, 2026-11-15), Apache-2.0 with NOTICE,
reserved DeckShep branding, GitHub Releases and a free Marketplace listing.
Public support channels, exact-version launch validation, snapshot review,
private vulnerability reporting, signing/notarization and publication timing
remain pending. Provider trademark permission stays pending; LobeHub provenance
is not clearance. Marketplace AI disclosure and eligibility require owner review.
See [release readiness](RELEASE-READINESS.md) and [the identity reset](IDENTITY.md).
Preserve the new UUIDs/profile IDs, consent defaults and same-identity settings
compatibility; old preview profiles require recreation.
