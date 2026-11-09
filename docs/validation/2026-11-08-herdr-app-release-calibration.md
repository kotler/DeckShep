# Signed release calibration and private preview

Date: 2026-11-08. The owner requested completion of release containment,
calibration, private preview preparation and a live-session walkthrough. The
owner subsequently explicitly excepted the standing no-attach rule for the
selected existing App's peer/build and status/topology reads and plain pane-focus
requests only. That exception grants no terminal-content read, provider command,
text input or Herdr/core restart.

## Native release result

The signed App **0.1.14** / core **0.1.19** copies passed the contained native
suite. [Machine-readable evidence](2026-11-08-herdr-app-release-calibration.json)
pins the original App executable/plist/tree, core executable/signing hash, source
review pins and exact protocol-2 helper. Installed App/core tree hashes and
publisher signatures were rechecked after calibration and still matched the
[static preparation record](2026-11-08-herdr-app-installed-release-artifacts.json).
Neither installed binary was modified, re-signed or restarted.

The release runner uses Apple's local Seatbelt policy compiler with default deny,
read-only bundles, writes confined to private runtime state, exact executable
allowlisting, private Unix sockets and one owned loopback feed port. GUI service
registration is allowed; `lsopen`, Apple-event sending, shells, `open`, launchctl,
external network and executable update stages are denied. A compiled synthetic
probe verifies outside read/write denial, denied child execution inherited across
fork, denied non-feed networking and the denied LaunchServices launch permission
before any Herdr executable starts. The private `sandbox_check` query and local
SBPL rules are test-only OS interfaces, not a portable security guarantee.

Herdr wraps `space.new` argv in a login shell. The release test instead supplies
a compiled test-only SHELL shim accepting only the exact reviewed cat wrapper;
it executes `/bin/cat` without interpreting a shell script or loading profiles.
The original signed App/core remain unchanged. This constrains test terminal
programs; it does not validate provider launches or shell integration.

The bounded metadata feed serves current App/core versions and empty targets;
unknown routes/methods, request bodies and excess requests are refused. One App
metadata request was observed after the initial updater interval. No update
payload was served or applied. Actual updater replacement is untested.

Passing scenarios:

- Two fresh cat panes; two acknowledged focus requests with separately matching
  App-model selection feedback (423.69 ms and 440.53 ms in the recorded run).
- Future press, reused permit, stale generation and revoked consent refusals.
- Wrong executable hash refused; fresh socket reconnections preserve selection.
- Owned-window minimize acknowledged; a subsequent plain focus request
  acknowledged. This is not an OS minimization or foreground-window proof.
- Only the owned App restarted. Its old sender binding and pre-restart press
  refused; a fresh sender rediscovered two restored panes and requested one.
- All owned descendants exited, private run files were removed and tracked global
  Codex/Claude settings hashes stayed unchanged.

Initial failed attempts are not promoted to approval: blocking GUI registration
aborted App startup; permitting registration while still denying launches fixed
that boundary. Denying the App's implicit login shell refused terminal creation;
the restricted cat shim addressed that without permitting a shell. An incomplete request-scenario run and a transient selection change during
restart remained failures; the final run passed without weakening production
timeouts or peer checks.
Only bounded read-only restart readiness may wait for active flags to settle;
mutations never retry or compensate.

## Private preview

The prepared private package passed Elgato validation and packing. The exact
calibrated App record and helper hash are compiled into a test-only factory,
with native peer-session checks around each operation. The owner subsequently
requested removal of the temporary 24-hour cutoff; the current preview has no
calendar expiry. Single-use press expiry and native exchange deadlines remain. No normal
config/environment setting can select that factory. The existing
`fixture-app-hardware-test` marker makes the public distribution audit reject it.
All production App records/capabilities remain empty. The final private inspector
note explicitly describes its reviewed build; no diagnostic probe is included in
the repacked installer. The original November 9 cutoff was removed at the owner’s request; new preview
metadata records `expiresAt:null`.

The installed DeckShep preview's `bin/plugin.js` was backed up, atomically replaced
and hash-verified. Only DeckShep's UUID was restarted. Its config, manifest, helper
bytes/mode and profiles were retained; no integration or consent was installed.
The inspector App home was changed from the old disposable test home to the
owner's configured normal App home. The current signing hash matches the reviewed
installed App, but that does not establish the running core version or an
App/core terminal binding.

## Live-session permissions and physical walkthrough

The real installation exposed permission assumptions hidden by private fixtures:
canonical `/Applications` is root-owned mode 0775, while the App home and socket
were owner-owned mode 0755. A synthetic regression first confirmed the existing
refusal with matching executable/plist bytes. The owner explicitly approved a
narrow exception and private endpoint permissions.

`trustedApplicationsAncestor` now accepts only canonical macOS `/Applications`,
root UID 0, admin GID 80, exact mode 0775, and either no ACL or the standard
`group:everyone deny delete` ACL. Positive or unknown ACL entries, other paths,
owners/groups/modes/platforms and failed inspection refuse. Bundle files and
bundle directories retain the shared-write ban. GID is retained in all build
stamps, and the exceptional container retains its full metadata stamp so ACL or
container changes invalidate the request. Executable/plist hashes, signing hash,
original connected peer token, timing, consent and press guards remain in force.
The system Applications directory was not changed.

Only the selected App home and socket were changed to owner-only 0700 after
recording prior modes privately. Neither signed Herdr bundle nor existing Herdr
process was replaced or restarted. The guarded reader then matched the live App
and saw two panes. The live App's core process/version and App/core terminal
binding were not inspected or established; this remains an App-only focus path.

The official CLI restart command reported success while the original DeckShep
process remained running. Process start time proved it had not loaded the new
bytes. Temporary fixed-label/count diagnostics were removed from installed code,
then Stream Deck itself was quit and reopened to load the hash-verified clean
preview. This restarted the Stream Deck host/plugins, not Herdr or its agents.
The inspector showed `2 pane(s) · App-reported status` and later
`Focus requested; keyboard focus is not verified`.

The owner reported that both first-row pane selections and Next worked on the
physical Stream Deck against the normal live App. For the final guard check, the
owner unchecked plain-focus consent and reported that pressing Next did nothing.
A subsequent UI observation showed the unchecked consent and `Next pane / Consent
off` tile. This is owner-reported visible behavior plus observed SDK feedback,
not instrumented USB evidence or keyboard-focus proof. Consent was left off;
the owner can explicitly re-enable it to continue. No terminal content, input,
provider control, mod or Zoom action was used.

## Automated checks

The final isolated coverage run passed 298 tests: **294 passed, four live groups
skipped, no failures**. Source coverage was 94.81% lines/statements, 90.40%
functions and 86.86% branches (prior checkpoint 94.85%, 90.42%, 86.81%). The small
line/function delta includes the new native ACL reader; no threshold/exclusion
was lowered. Fixtures cover ACL grants/truncation/failure, root/admin-only scope,
group/ACL metadata changes, unchanged shared-write refusals, exact minimize setup,
preview evidence and continued operation beyond 24 hours and existing peer/focus guards.

Typecheck, lint, formatting, architecture dependencies, knip, version and generated
compatibility checks passed. Universal build, four bundled golden groups, four
Herdr App browser/virtual-deck cases and normal private-review packaging/audits
passed. No golden snapshot changed. The public bundle continues to reject the
private preview marker and contains zero approved App records.
