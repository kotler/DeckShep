# Rex controls and provider artwork investigation

The owner reported missing agent background icons and control presses showing
Stream Deck's warning symbol. Read-only inspection of Stream Deck confirmed
missing Codex/Claude watermarks and this inspector refusal:
`Clipboard focus query not authorized; input disabled`.

The owner explicitly approved enabling visible-pane verification. The Rex
profile setting was enabled through the inspector, which reported
`Preferences saved`; reopening a different key's inspector showed it checked.
Claude controls remain separately opted out. No agent control was pressed,
status line changed, integration installed, or application restarted during this
initial diagnosis.

The installed plugin differs from the current checkout. Its older setup path
still describes modifying a Codex footer; the source now makes that step
read-only. The installed inspector reports no identified Codex or Claude chat.
Enabling visible-pane verification alone does not establish provider identity.

## Artwork change and baseline justification

The provider marks were nested SVG documents relying on CSS `currentColor`.
They appeared in browser fixtures but were absent in the native Stream Deck
editor. The fix embeds the original mark paths inside a group with an explicit
white fill, preserving upstream titles, fill rules, clip rules and geometry.
This removes nested SVG/CSS inheritance requirements from native rendering.
The native rendering explanation was initially an inference. The deployment
below subsequently confirmed that the changed markup restores both marks in
the Stream Deck editor.

Four regression cases (Codex/Claude, signal/classic) failed before the change
and passed afterward. They check the actual provider paths and titles, one outer
SVG document, explicit fill, preserved fill rules and signal watermark IDs.

Only provider-mark SVG hashes changed in `tests/e2e/expected/svg-sha256.json`:
keys 0 and 1 in startup/idle/working/question/Herdr, and keys 0–4 in overflow.
Offline and every control-key hash remain unchanged. Action mappings, labels,
native traces and refusal golden snapshots were not changed. The existing six
browser PNG baselines are retained.

## Test boundaries

The owner authorized enabling all Rex tests for this run. The live Rex test was
invoked with `ASW_LIVE=1`, `ASW_LIVE_AUTHORIZATION=test-owned-only` and
`ASW_LIVE_REX=1`. It failed before creating a temporary home or launching a
process because `ASW_REX_ISOLATED_LAUNCHER` is not configured. This remains a
launcher/ownership skeleton, not native control calibration. No claim of live
Rex controls or hardware validation follows from fixture/browser success.

The isolated suites require local socket access; the initial sandboxed attempts
could not bind their private Unix/loopback sockets. Runs with that access
permitted use fixture agents and private test homes, with live suites disabled.

After the artwork change: 330 tests passed, zero failed, and four live suites
remained skipped in the ordinary coverage run. Coverage gates passed at 95.16%
lines/statements, 87.03% branches and 90.4% functions. All 24 browser tests passed,
including all six unchanged PNG baselines. Typecheck, lint, dependency rules,
version/compatibility checks, Knip, bundled golden tests, universal build, private
packaging and verification of the resulting ZIP also passed.

## Approved deployment

After explicit owner approval, the documented stopped-app backup completed.
The native installer declined the unchanged version number rather than updating
the plugin. Automatic approval review then required separate explicit permission
to use `node scripts/install.mjs`, interpreting the standing verification
restriction as a blanket ban. The owner explicitly authorized that command for
deployment. The documented fallback then installed the tested build and created
another recovery backup. This was deployment, not a test against real HOME.

Before reopening Stream Deck, all 70 saved profile files matched the initial
backup byte-for-byte, and the installed plugin/helper/hook/configure bytes
matched the tested build. Stream Deck was reopened; both Codex and Claude
background marks were visible in its native editor, and the approved
visible-pane checkbox remained checked. No running Rex/provider process was
started, stopped, adopted or sent test input.

The inspector still reports no identified provider chats. The owner manually
reported another warning after deployment; its inspector refusal is now
`Chat metadata loading; try again`. Native provider control success remains
unverified. After the owner clicked the read-only check, the inspector confirmed
that the selected Codex footer shows no session ID and displayed the manual
`/statusline session-id model-with-reasoning` instruction. This identifies a
missing prerequisite for chat-bound Codex controls; it does not establish the
outcome of the separate Zoom path. The owner must make any footer change, with
their existing footer items appended as desired. DeckShep did not change it.
Existing-agent control tests are not covered by the test-owned-process
authorization.

After the owner made the footer change, read-only inspection confirmed
`1/1 Codex` identified. The native editor then displayed Model `6.1 Sol`,
Effort `High`, Reviewer `Ask me` and Mode `Default`, replacing the unknown
metadata labels. The inspector's previous check error remained visible as stale
feedback. A further manual owner Zoom/Effort press was requested to distinguish
successful metadata binding from native control delivery.

The owner reported uncertainty about Zoom and thought Effort changed the model.
Read-only inspection immediately afterward showed the model still `6.1 Sol`
and effort changed from `High` to `Xhigh`. No new inspector refusal appeared.
This is evidence of the expected effort-level change, not a model switch in
DeckShep's metadata. Native Zoom behavior remains unconfirmed by the owner.
The focused daemon-effort, dynamic-controls and effort test groups passed;
their contracts enforce effort-only update payloads and preservation of model
and other settings. No additional real-agent press was made by the assistant.

## Owner-requested Zoom removal

The owner requested removing the Zoom button on 2026-11-10. It is removed from
the shared Home/Prompts layouts and inspector choices; old explicit `zoom`
overrides map to `none`. Other controls keep their coordinates. Question and
approval Confirm still occupy that position when applicable. Guarded native
Zoom contracts and their transport/refusal tests remain in source.

This explicitly approved behavior change justifies updating `layouts.json`
and `presses.json`: only previously mapped Zoom entries become inactive, with
no dispatch or native calls. The native trace/refusal snapshots are unchanged.
Browser SVG hashes and the affected deck PNG baselines change only at the
former Zoom coordinate (row 2, column 2). Question/approval layouts are retained.
The earlier provider-artwork hash change in this chat is documented above.

Validation confirmed exactly 56 former Zoom entries changed in each controller
snapshot file, with no other action changes. All 330 non-live tests and all 24
browser tests passed; coverage gates passed at 95.14% lines/statements, 86.99%
branches and 90.31% functions. Typecheck, lint, dependency/version/compatibility
checks, Knip, formatting, bundled golden tests, universal build and package
verification passed. Five changed PNGs were visually reviewed; the question PNG
and native trace/refusal snapshots were unchanged.

The already approved stopped-app deployment path installed this build with a
fresh private backup. All 73 saved profile files matched that backup afterward,
and installed runtime/helper/hook/configure bytes matched the tested build.
After reopening Stream Deck, its native editor showed the former Zoom key
empty, with other control positions preserved. Model remained `6.1 Sol` and
Effort `Xhigh`. No live-agent control was pressed for this deployment check.

## Owner-requested Permissions and Agent bank labels

The owner next requested renaming Reviewer to Permissions and moving it to the
former Zoom position, then requested a clearer name for `Agents >` without the
arrow. The bank label is now `Agent bank`. Codex Home Permissions moves from
row 1/column 3 to row 2/column 2 (zero-based); its old position becomes empty.
Question and approval Confirm retain the contextual position, so Permissions
is absent in those states. The Claude-specific information key stays in place.

This changes names and Home placement only. The Permissions control still
cycles the native reviewer between Ask me and Approve for me; its sandbox,
approval-policy, focus, identity and stale-press guards are unchanged. Internal
`permissions` action/config semantics and provider fields are retained.

The approved mapping change justifies new controller layout/press snapshots.
Native trace/refusal snapshots must stay unchanged. The bank rename changes
Home SVG key 6; Codex Home key 8 becomes empty, and key 12 gains Permissions
except when it already serves Confirm. Other labels/actions/coordinates remain
unchanged. Browser hashes and PNGs are updated for precisely those cells.

## Final owner-requested Home-only arrangement

Before deployment of the above label/move changes, the owner refined the layout:
remove the separate Questions and Prompts pages, put group controls in row 2,
rename Agent bank to Page, and order that row Next agent / Page / Collapse.
Next agent hides with fewer than two agents, Page hides with at most five
agent slots, and Collapse hides without gaps (or when discovery is offline).
The last two row-2 keys are empty. Row 3 remains contextual to one selected
agent, including Permissions or Claude information, and question/approval
Confirm. Other rows' key identities remain fixed.

Old interaction-page overrides (`more`, `questions`, `prompts`, `back`, `tools`)
are inactive. Native provider/navigation/prompt operations and their guards
remain in source for the existing contracts and deliberate custom actions.
The user selected the keyboard for extra navigation and prompt-page actions.

This explicitly approved simplification reduces controller snapshots from 96
backend/provider/state/interaction-page combinations to 32 dynamic Home cases.
For each retained Home case, group keys reorder and hide based on topology,
the old interaction-page key becomes empty, and the selected-agent control
occupies row 3. Native trace/refusal snapshots must remain unchanged. SVG/PNG
changes since the last installed build are restricted to row-2 cells and the
former Zoom cell; provider artwork and all other individual controls stay fixed.

All 330 non-live tests, 24 browser tests, coverage gates, static checks, bundled
goldens, universal build and package verification passed for that arrangement.
Coverage was 95.10% lines/statements, 86.95% branches and 90.31% functions.
All six PNGs were reviewed. The existing deployment authorization was used for
a stopped-app backup and installation; all 73 profile files and installed build
bytes were verified before reopening Stream Deck.

The native editor confirmed the final row grouping and visibility, with
Permissions at the former Zoom position. It also exposed clipping of the long
Permissions caption despite the browser rendering it inside its text area.
The renderer now bounds the font size explicitly for long captions, retaining
the existing text-length hint. A fixture comparison reconstructed the prior
font sizes and proved every new SVG differs only in font-size attributes before
updating hashes. This separate native-compatibility correction justifies those
font-only SVG/PNG changes; it does not change any action, label, guard or state.

The caption correction passed all 330 non-live tests and 24 browser tests, with
95.10% lines/statements, 86.93% branches and 90.31% functions; thresholds were
unchanged. Static checks, all four bundled golden groups, universal build and
private package verification passed, and all six changed PNGs were reviewed.
The backed-up deployment preserved all 73 profile files and verified installed
build bytes. Stream Deck's native editor then showed the complete Permissions
caption without clipping, Next agent first in row 2, and Page/Collapse hidden
for the current two-agent gap-free single-page topology. Model and Effort
metadata remained identified. No native control press or provider setting
change was performed by the assistant during either layout deployment.

## Physical Codex Model key

On November 10 the owner confirmed that one physical Model press in Rex
returned Codex to the prompt with the next model selected and the same
effort. The installed picker fix reads the model choices from Codex and
handles the selector’s hidden text cursor.

## Claude pane picker and Codex working Interrupt

The virtual Rex profile exercised Model, Effort, Permissions and Mode with a
synthetic native Claude CLI registration and no hook identity. Its input trace
showed the picker shortcut, navigation and session-only apply, and one Shift+Tab
for each mode press. Separate tests covered a capped effort slider, changed
catalogs, disabled consent, replaced processes, stale focus and uncertain writes.
The working Codex fixture without thread metadata received one Escape after
the native activity hint and working timestamp matched.

The universal build passed 464 isolated tests, 36 Playwright tests, four bundled
golden groups and the private package audit. Four opt-in live suites were
skipped. Deployment preserved all 73 profile files and verified 61 installed
files against the build. The Stream Deck editor reopened with Claude selected
and the native controls opt-in disabled. Physical confirmation of the new
hook-free Claude picker and pane-based Codex Interrupt is pending.

After the owner enabled native Claude controls, read-only process metadata showed
that Claude's registration used UTC while the process probe used local time.
Both registrations checked in the project matched the kernel start exactly in
UTC. The pane registration probe now runs its bracketed process reads in UTC.
The installed Stream Deck editor then displayed Model (Opus 5.5), Effort
(medium), Permissions (auto mode) and Mode (auto mode) for the selected
Claude pane. The corrected build passed 465 isolated tests and the four bundled
groups. Physical picker application is still pending.
