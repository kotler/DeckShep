## LobeHub agent artwork — development update

- Uses pinned LobeHub static SVGs for the active Codex and Claude providers in both key styles. Removes the copied Codex app PNGs; no runtime icon download or React dependency is added.
- Preserves text/control positions and selection indicators, with centered 104-pixel provider marks. Adds the upstream MIT notice and asset provenance. Provider trademark permissions remain pending; this is not public-release clearance.

## 1.4.0 DeckShep private review — not released

- Renames the product to DeckShep and profiles to Rex / Herdr, with original key-and-crook branding by Everett Kotler. Existing plugin, action, profile and per-key UUIDs, hook paths, consent and settings remain compatible.
- Prepares a free Apache-2.0 release with NOTICE and reserved DeckShep branding. LobeHub SVGs include MIT attribution; provider trademark permission remains pending. The public-release evidence gate still blocks unreviewed release; nothing is published by this checkpoint.
- Isolated native validation from the refactor remains applicable; physical, clean-Mac, Intel execution and launch checks remain open.

# 1.3.4 Claude validation preview — not released

- Claude Model and Effort cycle directly from Home in Rex and Herdr, with session-only application and verified readback. Native defaults, permissions and drafts are preserved; unexpected consent or credit prompts require the keyboard.
- Corrects real Claude NBSP and named-composer layouts, paused-modal heartbeat handling and same-root selection retention. Reduces repeated waiting-key focus checks while retaining exact selection-change refusal.
- Herdr arrows now validate once immediately before input against the exact root/request/prompt body, read stable viewport pairs in parallel, and release the next queued key without a post-arrow scan. Confirm keeps its full preflight and exact selection guard. Bash approval snapshots include the complete styled panel, excluding unrelated chat animations; native padding, line endings and choice-dependent hints are handled without input retries.
- Exact tool IDs survive ID-less permission callbacks only for the same hashed tool input. Missing completion hooks can recover only from native idle/done, a newer fresh heartbeat and a verified empty composer; private lifecycle authority is never rewritten.
- Permission waiting status is CHOICE. Physical approval responsiveness remains a beta gate; Herdr's server-side request polling adds latency.
- Claude's native checkbox layout exposes Toggle and keeps Review → Submit on Home, including the recognized review screen that Herdr reports as done. Stale Review presses cannot submit answers. The native API flow passed; physical validation remains in progress.
- Resolves the OS executable image for bare-name Claude launches such as Herdr, with owner/start-time checks, without trusting argv0 as a path.
- Physical validation is in progress. See [the exact Claude test record](validation/2026-11-07-claude.md). Automated coverage has 36 groups plus eight distribution tests.

# 1.3.3 artwork update — not released

- Replaces the generic Claude spokes with a recognizable filled Claude starburst, centered at 104 × 104 pixels in the background of Claude agent keys at 28% white opacity. Chat/project/status text and the selection dot remain on top.
- The provider artwork is shared by Rex and Herdr. Includes source attribution; native controls are unchanged.

# 1.3.2 development fix — not released

- Restores Rex discovery for existing Codex processes whose executable paths disappear from Rex metadata after a Homebrew upgrade. Resolves only the reported foreground PID using OS owner, start-time and executable checks, then rechecks the pane foreground; a process name alone is insufficient.
- Read-only live discovery finds the two original Codex processes alongside both Claude processes. Agents remain running; no native controls are exercised.
- Installed locally and verified in Stream Deck: two Codex keys followed by two Claude keys; only Stream Deck restarted.
- Adds missing-path, owner/start/PID replacement and shell-refusal regression coverage (35 JavaScript groups; eight distribution tests).

# 1.3.1 development preview — not released

- Separate **Rex Agents** and **Herdr Agents** profiles with pinned controllers and independent selection, banks, pages, connections and opt-ins. Animation and prompt text remain shared.
- Existing Rex profile/layout preserved; the source installer adds only missing profiles and backs up before changing installed files. Bundles include both importable profiles.
- Migrates existing explicit consent, custom prompts and socket preferences. Profile changes discard tracked submissions and reject stale queued controls.
- Installed locally after a full backup; all 64 pre-existing profile files remained byte-for-byte unchanged. Both profiles appear in Stream Deck Preferences; Rex Agents remains selected. Only Stream Deck was restarted.
- 34 automated regression groups and eight distribution tests passed. No live Claude controls or physical keys were tested for this update. See [profiles](PROFILES.md).

# 1.3.0 development preview — not released

- Optional native Claude 2.1.319 metadata hooks/status-line bridge, disabled controls by default, with explicit preview/apply/remove setup.
- Mixed Claude/Codex slots, cycling, Collapse, provider artwork, labels and metadata isolation.
- Guarded Rex picker/session-only apply, waiting/checkbox keys, Interrupt, staged Send and provider-specific Queue/Send-now; scoped Herdr waiting/Interrupt keys.
- Claude permission modes remain keyboard-only, and Herdr composer/model actions remain unavailable.
- 33 automated regression groups and seven distribution tests; no live Claude control or physical validation. No installed-plugin or live-agent changes. See [Claude preview](CLAUDE.md).

# 1.2.1 beta checkpoint — November 6, 2026

Beta 2 adds uninstall instructions to the README, install guide and downloadable bundle, covering the plugin, profile, manual fallback and optional native-setting cleanup. It contains the same plugin runtime as beta 1. Beta 1 remains an immutable checkpoint.

- Merged experimental Herdr support into main alongside the validated Rex baseline.
- Reorganized README and installation/upgrade guides; versioned bundles include source provenance, checksums and archive verification.
- Explicit opt-in thread-ID title matching for daemon-backed Codex, without changing global settings or trusting hook session claims.
- Requires complete unique loaded-ID matching, matching folder, interactive root-thread identity, stable pane/foreground and daemon generation.
- Missing or changed titles clear selection and refuse stale presses, including after restoring the same title. Native turn identities and metadata caches follow the binding generation.
- Live API tests passed for Model, Effort, Reviewer, Plan/Default, restoration, title loss/rebinding, new-chat isolation, a multiple-choice answer, one-time print-only approval, Interrupt and background-terminal Stop in two disposable agents. The installed physical core controls subsequently passed; see HERDR.md for exact coverage and remaining gates.
- Seven distribution regression tests cover archive/default integrity, checksums and installer preflight/upgrade behavior.
- 28 automated groups cover the Rex baseline and the new title resolver and guards. Send, Steer, Queue and prompt staging remain unavailable in Herdr.

# Herdr development build 1.2.0 — November 6, 2026

- Opt-in local Herdr 0.9.5 / protocol 22 backend with explicit session selection and foreground/process/session guards.
- Native Codex controls reuse the guarded daemon path; Herdr focus checks use its API without the clipboard.
- Send, Steer, Queue and prompt staging stay unavailable until a trustworthy composer cursor is exposed.
- Live testing fixed the one-response-per-connection transport, retained known Herdr titles when daemon metadata is unavailable, and strengthened waiting-request guards.
- 27 automated groups cover the Rex baseline and new Herdr transport, routing and controller-switch tests. Live Herdr API discovery, six-agent navigation, closed-slot/Collapse behavior, focus and Zoom passed. Native-control validation is blocked by the tested integration/daemon combination; physical validation remains pending. See HERDR.md.

# Local beta changes — November 5, 2026

- Signal controls with thick inset color accents, full-color live agent keys and a white selection dot.
- One Effort key shows the verified current level and cycles the selected model’s supported levels, wrapping at the end; Plan/Default shows the verified native mode.
- Effort has a brain icon matching the control family. Ready agents now have Zoom in the same third-row position used during running/background work.
- Next agent brings the selected slot's bank into view, including wraparound. Reselection instructions fit on two lines.
- Waits for Codex's native Max/Ultra status-line animation to finish before verifying the selected chat. Error captions remain visible after the hardware warning icon clears.
- Home changes its third row for ready, working, question and permission-request states.
- Stable slots, explicit Collapse, cycling banks/agents and fixed Page/Interrupt positions.
- Complete becomes Ready after two continuous seconds selected; empty slots omit Idle.
- Codex model and reviewer use the existing daemon without restarting running agents.
- Staged Send now verifies input digest, cursor, chat and latest turn before submission; edited or already-submitted drafts are refused.
- A detected focus mismatch clears stale selection and asks for reselection.
- In-app shared preferences, connection/setup status and explicit selected-agent footer setup.
- Incomplete Rex discovery cannot compact away known agent slots.
- Clean universal-helper build, official Elgato validation/packaging and private-state/path audit.

This remains a beta. Core Rex and Herdr hardware workflows passed locally; independent installation, Intel execution, public licensing and artwork redistribution remain outstanding. Nothing is uploaded by the build.

- Interrupt and background terminal cleanup are separate. Verified background-only activity gets a BACKGROUND label and a scoped Stop terminals key. Stale chat/turn/terminal sets are refused; uncertain stop writes are not retried.

- Composer checks isolate the active input block from recent transcript prompts, allowing Steer/Queue and staged Send after short exchanges while still rejecting ambiguous input and stale cursors.

- Larger multi-line key captions and agent labels; agent branding moves into a faint monochrome background watermark to free space for text.
