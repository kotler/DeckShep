# DeckShep support

Use GitHub Issues for beta support and ordinary bug reports. While the repository is private, only people with repository access can use the tracker. [DeckShep Issues](https://github.com/kotler/DeckShep/issues)

For a suspected vulnerability or guard bypass, follow the [private security reporting instructions](../SECURITY.md).

## Reporting an ordinary issue

Include DeckShep version, macOS version, Stream Deck software/device model,
backend/provider versions, selected profile, the action attempted, expected
result and actual result. The local doctor can help: run
`node <installed-plugin>/bin/doctor.js`. It is read-only and does not grant
consent. Review the report before sharing it.

Never share API keys, account tokens, full terminal transcripts, private project
files, integration setup records or upgrade-backup directories. Hide prompts,
project names and unrelated windows in screenshots. Do not disable a guard,
reuse an approval or reset native agent settings to troubleshoot a failed control.

If the agent, pane or choice is uncertain, use the terminal keyboard and reselect
the intended agent. Herdr prompt submission requires the keyboard. Confirm the
supported native version and explicit opt-ins using [INSTALL.md](INSTALL.md),
[CLAUDE.md](CLAUDE.md) and [HERDR.md](HERDR.md).

Preserve upgrade backups and follow the documented preview/restore procedure;
never upload backups. Report uncertain writes without retrying. Integration
removal and uninstall guidance are in [UNINSTALL.md](UNINSTALL.md).
Support is provided as maintainer availability permits; no response-time,
perpetual compatibility or future-feature commitment is made.
