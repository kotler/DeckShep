# Security

The primary hazard is delivering input to the wrong pane or agent. Report a
suspected guard bypass through [GitHub private vulnerability reporting](https://github.com/kotler/DeckShep/security/advisories/new).
The route was enabled and verified through GitHub’s API on November 15, 2026.
Never file exploit details in a public Issue. If the private route becomes
unavailable, follow [SUPPORT.md](docs/SUPPORT.md) and wait for a maintainer’s
private reporting route before sharing exploit details.

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

Herdr App has a separate production navigation transport. Provider input and
verified keyboard-focus capabilities remain disabled. Source-level input APIs
do not satisfy native identity/focus requirements. Fresh-account installs,
Intel execution and optional Developer ID/notarization retain their own evidence.

App navigation verifies the connected publisher, executable/plist hashes,
retained per-connection kernel peer and single-use consent/press guards without
a marketing-version pin. The owner approved one macOS container exception:
canonical `/Applications`, root/admin ownership, exact 0775 mode, and no positive
ACL grants. All bundle files/directories and other ancestors retain shared-write
refusal. The exceptional container’s full metadata stamp detects ACL/group or
container changes. The App home remains private with no ACL. Socket ownership
and single-link checks apply to private modes and Herdr’s recreated 0755 sockets.
This transport grants plain pane requests only.
