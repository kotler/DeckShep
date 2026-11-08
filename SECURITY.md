# Security

The primary hazard is delivering input to the wrong pane or agent. Report a
suspected guard bypass through **GitHub private vulnerability reporting** on the
public repository's Security → Report a vulnerability page once the owner has
enabled it. That reporting route is not verified as available yet; enabling
and verifying them is an owner publication task. Never file exploit details in a
public Issue. If private reporting is unavailable, wait for the owner-verified
private support route documented in [SUPPORT.md](docs/SUPPORT.md).

Include the affected DeckShep/upstream versions, the guard involved and a minimal
synthetic reproduction. Do not include prompt contents, transcripts, credentials,
raw settings, private project files or backups. No response-time or bounty
commitment is made. Historical validation logs are not permission for live tests.

| Hazard | Mitigation |
| --- | --- |
| Stale deck context / reused coordinate | Scope, appearance, visibility, generation, backend key and render stamp preflight |
| Late profile switch during native I/O | Single-use permit consumed immediately before delivery; final visibility/target recheck; postflight |
| Wrong native pane or process | Native foreground focus, exact PID/owner/start/executable, terminal generation and selected-target identity |
| Wrong chat, turn or request | Root-thread binding, chat/turn IDs, request digest and state/version checks |
| Edited draft or wrong cursor | Two stable native reads, digest, composer cursor and turn checks; no Herdr submission without cursor support |
| Uncertain write / timeout | Permit consumed before I/O; mutations never replay or automatically retry |
| Clipboard access without consent | Explicit opt-in and helper restoration proof; background reads never use clipboard |
| Untrusted/malformed native data | Bounded schemas plus existing semantic validators; unknown versions/capabilities fail closed |
| Prompt/transcript leakage | Digest-only stored action context, fixed bounded errors, SDK log sink, privacy-safe doctor, archive path/private-file audits |
| Agent settings overwritten | Explicit preview/apply, private backup, lock and concurrent-edit checks; exact owned-command removal; guarded undo |
| Test touches a real session | Fixture-only default tests; compile-time host substitution; explicit live gates, private sockets/homes, PID ancestry and settings fingerprints |
| Dependency or release artifact changes | Locked tooling, npm audit for shipped dependencies, weekly updates, nested archive/CRC/checksum/version/default audits and draft-only releases |

Herdr App has no production transport or input capabilities. Source-level input
APIs do not satisfy native identity/focus requirements. Fresh-account installs,
Intel execution and optional Developer ID/notarization remain separate release
evidence, never inferred from fixture tests.
