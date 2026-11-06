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
