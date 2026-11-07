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
- [ ] Claude running controls and Zoom in both hosts; Rex Claude questions, approvals and guarded submissions.
- [ ] Sign off on Claude approval/navigation responsiveness.
- [ ] Physical profile switching with native controls and mixed-agent navigation.
- [ ] Herdr overflow banks, closed-slot Collapse and outer-terminal presentation.
- [ ] Herdr reconnect and multiple attached clients in an isolated environment.
- [ ] Validate optional hook ancestry, status-line chaining, watcher behavior, live renames and removal.
- [ ] Validate customized/default keybindings and session-only settings preservation.
- [ ] Install on a Mac without this development checkout and complete setup without assistance.
- [ ] Verify Intel helper execution before advertising Intel support.
- [ ] Exercise Rex quit/reopen only in a disposable environment.
- [ ] Finish validation cleanup and compare original settings fingerprints.

Live tests require fresh explicit authorization, `ASW_LIVE=1`, isolated sockets and
only test-owned PIDs. Do not operate existing agents or the user's shared daemon.

## Owner release decisions

Product/display name, license, artwork redistribution, signing/notarization,
release visibility and merge timing remain owner decisions. Keep existing names,
UUIDs, profile IDs, consent defaults and settings compatibility while refactoring.
