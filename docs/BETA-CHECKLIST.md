# Beta verification gates

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

## Deferred with Herdr (not in the first release)

The first release ships only the Rex profile (owner decision, 2026-11-10).
These gates move to the Herdr release:

- [ ] Herdr overflow banks, closed-slot Collapse and outer-terminal presentation.
- [ ] Herdr reconnect and multiple attached clients in an isolated environment.
- [ ] Separately authorize and run the source-only Herdr App calibration harness; review ownership, latency, cleanup and settings fingerprints before considering any build record.
- [ ] Validate App focus requests across windows/screens, hidden/minimized/full-screen states, dialogs and restart/reconnect; acknowledgements never prove keyboard focus.
- [ ] Review release-build updater isolation separately; source-build calibration cannot approve the installed release.
- [ ] Physical profile switching between Rex and Herdr.

Live tests require fresh explicit authorization, `ASW_LIVE=1`, isolated sockets and
only test-owned PIDs. Do not operate existing agents or the user's shared daemon.

## Owner release decisions

The owner selected DeckShep, profiles Rex / Herdr (first release: Rex only,
2026-11-10), Apache-2.0 with NOTICE,
reserved DeckShep branding, GitHub Releases and a free Marketplace listing.
Public support channels, exact-version launch validation, snapshot review,
private vulnerability reporting, signing/notarization and publication timing
remain pending. Provider trademark permission stays pending; LobeHub provenance
is not clearance. Marketplace AI disclosure and eligibility require owner review.
See [release readiness](RELEASE-READINESS.md) and [the identity reset](IDENTITY.md).
Preserve the new UUIDs/profile IDs, consent defaults and same-identity settings
compatibility; old preview profiles require recreation.
