# 0008 — Herdr App navigation release

Status: accepted scope, 2026-11-15. Release preparation is authorized; publishing
and exact-version launch approval remain owner actions.

## Decision

Version 1.5.0 packages **Rex** and **Herdr App**. Herdr TUI remains an
experimental source build. This supersedes the Rex-only distribution policy
and the experimental-only App composition in ADRs 0004 and 0007. Their input,
identity and verified keyboard-focus limits still apply.

The App profile provides the App-reported agent roster, selection dot, stable
slots and agent/Next/Page/Collapse/Attention navigation. Tiles show chat name
when available, folder and reported state. Agent, Next and Attention presses
select on the deck or send one consented plain pane request. Page and Collapse
are local. App gestures are taps only. App selection changes reveal the target
bank once, preserving later Page browsing.

The third row defaults to blank. Model, Effort, Permissions, Mode, Interrupt,
question handling and all other provider input remain deferred. Saved preview
provider/input choices round-trip for compatibility but project to disabled
runtime settings. The controller never routes those overrides to provider
input. No Herdr mod is shipped or installed. Rex behavior stays unchanged.

## Navigation trust and updates

The production factory uses the native descriptor-based peer session and the
exact packaged helper hash. It checks endpoint ownership and permissions,
retains kernel peer identity through the reply, reads the connected executable
and plist and verifies the matching live code-signing hash against Herdr’s
Developer ID (`dev.herdr.app`, team `2W9652Q7QR`). It accepts signed updates
without pinning a marketing version. A changed or unknown command contract
refuses a request. Test/preview factories cannot be selected by preferences,
host messages or environment variables and remain denied by package audits.

Plain requests retain their separate default-off consent, key-down target,
350 ms arming delay, queue expiry, pane/terminal/selection/ranking checks,
endpoint generation and single-use lease. A native request is sent once with
bounded preflight. A lost reply reports uncertainty and is never retried.
Acknowledgement establishes a request, not OS keyboard focus. App-reported
identity cannot grant provider capabilities; `backendCapabilities['herdr-app']`
therefore remains empty.

The owned App home must be private with no ACL. A recreated socket may keep
Herdr’s mode 0755 when owner and link checks pass. Parent checks remain strict;
DeckShep never changes permissions. The next poll revalidates the replacement.

## Settings, packaging and upgrade

Use the existing App profile/page/key IDs. Production enables the existing v3
codec, preserving v1/v2 Rex and TUI preferences and previous v3 App settings.
App focus consent never inherits from another profile, readback or input flag.
The explicit v2 rollback projection preserves Rex/TUI settings; an exact App
rollback requires the recorded backup. No setup or migration runs implicitly.

Release archives include both profiles, fresh empty App connection settings,
all consents off, a pinned peer helper and no test factory, mod or prototype
runtime. The temporary-home installer test checks that a missing App profile is
added while customized Rex keys, config and hook records survive.

## Evidence and remaining release checks

[App 0.1.16 / Core 0.1.21 native validation](../validation/2026-11-15-herdr-app-0.1.16-core-0.1.21.md)
records passing isolated lifecycle calibration, request acknowledgements,
stale-target refusal, restart/reconnect, cleanup and settings preservation.
The full live virtual-deck navigation case failed its background-editor
assertion with Chrome frontmost. The activation cause is unresolved. It must
remain visible in launch review; no native end-to-end or hardware pass is
claimed from fixtures or the standalone calibration.

The separate Model prototype changed a real offline Codex setting, but Core
also delivered queued input after expiry and writer closure. That evidence
grants no released input capability. See the [deferred controls plan](../plans/HERDR-APP-MODEL-PRODUCTION-PLAN.md).

Automated merge checks and universal packaging are recorded in the
[1.5.0 preparation record](../validation/2026-11-15-herdr-navigation-release-prep.md).
Exact-version launch approval, physical navigation/profile switching, clean-Mac
installation and Intel execution retain their own checks. No owner verification
is inferred from this scope decision.
