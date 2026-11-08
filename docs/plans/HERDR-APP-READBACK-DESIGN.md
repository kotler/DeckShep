# Proposed optional Herdr App read-back mod

Status: recommendation for owner review, 2026-11-08. No mod implementation,
installation, native check or upstream contact has been performed. This is a
proposed way to investigate the [Phase 0 read-back gap](../adr/0007-herdr-app-0.1.14-source-review.md),
not evidence that Milestone 1 can already be enabled.

## Recommendation and limits

Design a small optional mod that exports selected App view facts. Keep it
separate from terminal input, provider controls and upstream modifications.
An upstream API can replace it later behind the same snapshot contract.

The source exposes `focused()`, `panes()`, `spaces()`, `layout()` and `window()`
inside a mod. Ordinary socket replies do not contain the same facts, and core
shared documents intentionally exclude each screen's focus and Zoom state.
Those make a mod the most direct existing surface to prototype.
[Mod API][guide], [snapshot implementation][mods], [private views][mirror]

The remaining limits are material:

- A mod is trusted executable code with broader platform access. “Read-only”
  describes this proposed implementation's behavior, not a sandbox guarantee.
  Its reviewed source must not call `run`, `exec`, `hc`, clipboard functions,
  terminal read/input APIs, remote APIs or network endpoints.
- `focused()` describes the App's view context; it does not independently
  prove OS foreground-window identity or every overlay's keyboard ownership.
- A local terminal address such as `t1` does not prove which core owns it.
  The bridge must not simply echo a core ID supplied by the requester.
- One mod copy cannot prove the state of unobserved screens or windows.
  The exact Milestone 1 observation contract must be established before a
  focus/Zoom verification record can be created.

These are prototype acceptance gates. If the public mod surface cannot meet
them, retain disabled controls and document the missing upstream API; do not
replace the evidence with inferred success. [Focus publication][window]

## Proposed flow

1. The plugin validates the App/core endpoint identities and installed mod
   manifest, using the selected App profile and explicit read-back consent.
2. It sends a bounded, random challenge to the named mod through an App command.
   The command contains a fixed protocol verb and nonce, not an executable,
   target action, arbitrary output path or agent input.
3. The shown, non-focusable mod copy samples the permitted live view fields in
   one synchronous host callback, then writes a bounded response atomically
   into its fixed private output directory.
4. The plugin opens only its expected response slot, checks ownership, mode,
   links, size, schema, challenge, instance/copy identity, sequence and expiry,
   and independently correlates the view to the verified App/core peer.
5. Focus/Zoom still pass through the existing guarded delivery path. A new
   challenge is required for the post-check. Timeout, missing evidence,
   ambiguous copies or identity changes refuse without retry or compensation.

`<mod>.<command>` reaches **shown copies only**, and its App `{ok:true}` reply
acknowledges dispatch rather than supplying a mod response. Do not implement a
hidden background mod and assume it can answer. The first design should use a
small visible status indicator in a reviewed personal layout clone; it must
never claim keyboard focus. The source's ordinary mod lifecycle controls
reload, hiding and closure. [Command routing][mods], [lifecycle rules][guide]

The precise challenge syntax, filesystem operations supported by the mod
runtime and fresh-callback ordering need fixture/source validation before
implementation is called ready. No custom loopback service or child process
is proposed for the mod.
The existing read-only transport deliberately rejects all `do` requests. A
bridge prototype would need a separately reviewed, narrowly validated challenge
request and consent check; it must not expose a generic App action sender or
relax the terminal-input refusals.

## Data contract and privacy

The versioned response should contain only a request nonce; module/build and
copy epoch; sequence; observation status; space/tab/pane/terminal identifiers;
the explicitly observed active-window and focus facts; per-pane zoom flags;
and the minimal structural fingerprints needed for the Zoom post-check.
Unavailable facts must be absent/unknown, not filled from the request.

Do not serialize raw `focused()`, `terminals()`, `layout()` or a shared document.
Whitelist identifiers, split orientation/weights and relevant visibility facts;
omit cwd, titles, names, mod props, argv, prompts and transcript content.
A structure fingerprint must exclude private strings and unrelated appearance
data. Shared split topology and per-screen view state remain distinct.

Use a finite request budget, one outstanding request per selected copy, bounded
buffers and cleanup of expired slots. A timestamp or repeating heartbeat alone
cannot satisfy freshness or instance binding. Never log the challenge, response,
source view or filesystem paths. Generic errors retain the existing length caps.

The plugin, not the mod's self-report, must establish native peer/build/process
identity. Missing independent App/core or active-window binding means refusal.
The mod does not grant `verifiedFocus`, `zoom`, `sendKeys` or any control merely
because it can write a response.

## Consent, installation and removal

The proposed stable destinations, relative to the chosen App home, are
`mods/deckshep-readback/` for code and `.deckshep-readback/` for private protocol
state. Exact contents, layout additions and hashes must be shown in a setup
preview before any write. Nothing is installed on discovery or profile import.

1. Preview the owned files and a personal layout clone with its non-focusable
   indicator. Do not edit a shipped layout, generated guide, other mods or
   an existing unrelated file. Explain the mod's trusted-code permissions.
2. An explicit Apply writes only the approved files, with private permissions,
   an ownership/version manifest and recovery backups. Read-back consent is a
   separate explicit profile setting; native input and Claude controls stay off.
3. If the selected source App home, files or layout have changed since preview,
   require a fresh preview. No application restart or automatic layout switch.
4. Preview removal; revoke read-back authority and pending requests before
   deleting only manifest-owned, unchanged files/state. Remove the owned layout
   node without overwriting later user edits. Preserve modified files/backups
   for manual recovery. The original layout remains available.
5. Version the bridge contract and retain a tested removal/migration path before
   changing its installed paths or protocol. Old responses and old copies cannot
   authorize a newer client.

The first implementation should provide pure preview/apply/remove planning and
temporary-directory tests. Applying anything to a real App home, loading it in
Herdr, running `herdr-app check`, or changing a real layout requires separate
current authorization under the standing instructions.

## Required evidence before promotion

- Contract and privacy fixtures: stale/replayed responses, multiple shown
  copies, hidden/unloaded/reloaded copies, forged paths, replaced endpoints,
  malformed/oversized state and mismatched App/core/record identities.
- Guard integration: no read-back consent means no bridge request; record or
  consent revocation invalidates pending input; all per-control refusals remain.
- Authorized isolated calibration on exact builds: keyboard ownership versus
  model focus, dialogs, minimized/hidden/full-screen states, process/core/App
  restart, and all relevant window/screen observations.
- Zoom proof: resolve the target before mutation, observe the expected zoom
  change, restore the exact original split on a deliberate second press, and
  prove the required unaffected-screen invariants. If those facts cannot be
  observed, Zoom stays disabled.

Only after those gates pass can Milestone 1 records advertise validated focus
and Zoom. This proposal does not expand Milestone 2 or enable a release.

[guide]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/defaults/AGENTS.md
[mods]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mods.rs
[mirror]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/mirror.rs
[window]: https://github.com/herdrdev/herdr-app/blob/2405bf388c568c3ed479f05b8e405ccfa44b3f2c/src/window.rs
