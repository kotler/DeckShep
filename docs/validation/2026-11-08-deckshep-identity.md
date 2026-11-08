# DeckShep prelaunch identity reset — November 8, 2026

The owner authorized replacing the old preview plugin/action/profile/key identity.
The source folder and installer now match `com.kotl3r.deckshep`; the action is
`com.kotl3r.deckshep.key`. Rex, Herdr and reserved Herdr App profile/page/key UUIDs
use the DeckShep namespace. Controller labels remain Rex / Herdr. Codex client
identification, Herdr request prefixes, workspace links, build/package/audit
paths and the recovery location use DeckShep naming.

This is an explicit new-plugin setup for old previews. Old profile bytes and
integration setup records are not silently moved to a different identity. The
new setup refuses old Claude command registrations until exact removal through
their original path. Tests verify removal restores the original status line and
unrelated hooks before new setup. Clipboard/settings mutex filenames remain
shared with the old tools to preserve cross-version mutual exclusion.

Local verification with Node 22.23.4:

- 125 tests total: 123 passed, 2 live tests skipped, zero failures.
- All three new identity/removal regressions failed before implementation and
  passed afterward. All 45 generated keys use new, unique deterministic IDs.
- Coverage: 93.86% statements/lines, 85.57% branches, 88.01% functions; thresholds
  unchanged. The five existing golden JSON files remain byte-identical.
- Lint, formatting, strict TypeScript, dependency boundaries, Knip, version and
  generated compatibility checks passed. Renamed-workspace `npm ci` passed;
  dependency versions were not changed.
- Universal build, official installer validation, beta package/independent
  verification and synthetic Marketplace media/hash checks passed.
- Release readiness still refuses the same pending launch/support records;
  no review was marked complete. Provider trademark permission remains pending.

No installed plugin/profile, real hook/configuration record, existing agent,
terminal or daemon was operated. No live or physical compatibility claim is
added. Older-preview and independent installation checks remain manual release
work; see [IDENTITY.md](../IDENTITY.md) and [BETA-CHECKLIST.md](../BETA-CHECKLIST.md).
