# Rex navigation independent of provider integrations

The owner approved making rows 1–2 independent of Codex and Claude APIs, using
Rex for discovery, status and focus. Row 3 keeps the existing provider controls.
The owner subsequently chose to finish rows 1–2 first: keyboard macros and any
hook removal are deferred. No title, status-line, hook or consent setup changes
are part of this change.

Rex discovery now reads owned foreground process and program-status facts
without invoking Claude enrichment. An optional, explicitly addressed `title`
read supplies a display-only key caption. The read allowlist permits that exact
argument-free method and does not permit title writes or arbitrary methods.
Missing titles fall back to the Rex session label or provider display name.
Folder captions come from Rex process facts. Existing user key aliases remain.

Rows 1–2 use independent, allowlisted navigation snapshots containing physical
pane/process facts and Rex status/title fields. They carry no chat ID, hook
epoch, native provider identity, model/effort or background-task authority.
Provider metadata, failure, root revocation or a delayed read cannot replace
these captions/status or invalidate physical selection. Missing/replaced panes
still lose selection. Offline discovery clears the navigation snapshot.

Claude enrichment moves to the asynchronous row-3 metadata phase. It retains
all native proof, root-change revocation, hook/consent and press-time guards.
Results from an old discovery/backend cannot publish into the new snapshot.
A new physical selection can acquire verified row-3 proof; it cannot replace
an identity already captured by a press. Native focus, PID replacement,
profile/generation/visibility and single-use delivery checks remain in place.
Next still requires existing visible-pane consent; no default was enabled.

## Expected snapshot changes

The first-row Rex captions now come from Rex titles rather than provider chat
names. Synthetic browser records explicitly supply the same titles through
`terminalTitle`, so ordinary screenshots should remain unchanged. Herdr keeps
its existing provider-caption behavior and cache coverage.

The first row no longer upgrades a Rex working state to daemon-only BACKGROUND;
the agent-specific Stop terminals control remains in row 3. Rex agent-button
dispatch snapshots now contain physical navigation facts rather than provider
chat/native identities. These are intended owner-approved behavior changes.
Golden layout actions, native control traces and refusal coverage should remain
unchanged; only Rex navigation dispatch payloads may change.

## Verification

New isolated fixtures exercise the actual Bridge with synthetic Rex responses:
mixed Codex/Claude discovery, focus, Next, Page and Collapse with unavailable
providers; delayed/failed metadata; provider captions/status unable to overwrite
the Rex bar; PID replacement refusal; and row-three identity refusal. Unit cases
cover snapshot privacy/authority, exact title-read enumeration, asynchronous
Claude proof publication and stale-discovery/backend rejection.

During fixture development one unstubbed active-turn endpoint reader reached
process-list discovery and found no endpoint. It made no connection or input.
That fixture now injects its endpoint, connection and identity reader; all
subsequent verification stays synthetic. No existing agent was controlled or
restarted. Native/hardware validation is not established by these fixtures.

Final validation passes: 446 isolated tests, zero failures, four live suites
skipped; all 31 Playwright checks against unchanged SVG/PNG baselines; all four
bundled golden groups. Coverage gates pass at 95.05% lines/statements, 87.25%
branches and 90.25% functions, with unchanged thresholds. Typecheck, lint,
dependency boundaries, Knip, formatting, version/compatibility, universal build
and private package audits pass. Seven new focused tests cover this change.

The previously approved stopped-app backup/install path deployed this build.
Private backups were retained; all 73 profile files, normalized plugin config,
Codex hooks/config/setup and Claude settings matched the pre-install baseline.
All 61 non-config/state runtime payload files matched the tested build. Stream
Deck reopened on the Rex profile. Existing agent/daemon processes were neither
restarted nor sent input. Physical navigation remains unverified; no native
control or hardware success is claimed by these automated checks.
