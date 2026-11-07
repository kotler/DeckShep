# Herdr development build 1.2.1 — November 6, 2026

- Explicit opt-in thread-ID title matching for daemon-backed Codex, without changing global settings or trusting hook session claims.
- Requires complete unique loaded-ID matching, matching folder, interactive root-thread identity, stable pane/foreground and daemon generation.
- Missing or changed titles clear selection and refuse stale presses, including after restoring the same title. Native turn identities and metadata caches follow the binding generation.
- Live API tests passed for Model, Effort, Reviewer, Plan/Default, restoration, title loss/rebinding, new-chat isolation, a multiple-choice answer, one-time print-only approval, Interrupt and background-terminal Stop in two disposable agents. The installed physical core controls subsequently passed; see HERDR.md for exact coverage and remaining gates.
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

This is a local development beta. Complete hardware workflows, independent installation, Intel execution, public licensing and redistribution decisions remain outstanding. Nothing is uploaded by the build.

- Interrupt and background terminal cleanup are separate. Verified background-only activity gets a BACKGROUND label and a scoped Stop terminals key. Stale chat/turn/terminal sets are refused; uncertain stop writes are not retried.

- Composer checks isolate the active input block from recent transcript prompts, allowing Steer/Queue and staged Send after short exchanges while still rejecting ambiguous input and stale cursors.

- Larger multi-line key captions and agent labels; agent branding moves into a faint monochrome background watermark to free space for text.
