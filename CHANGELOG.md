# Changelog

All notable changes are documented here. Versions follow Semantic Versioning;
preview artifacts use `-beta.N` release tags.

## [Unreleased]

### Changed

- Reset prelaunch plugin/action IDs to `com.kotl3r.deckshep` / `.key`, with a
  matching plugin folder/installer and fresh profile/page/key UUIDs. Older preview
  profiles require recreation and exact Claude-hook removal before new setup.
- Adopt Apache-2.0 with NOTICE; reserve the DeckShep name and key-and-crook branding.
- Vendor pinned LobeHub Codex/Claude SVGs with MIT attribution and provenance;
  provider trademark permission remains pending. Provider watermarks use the
  existing icon positions; text and control coordinates remain unchanged.
- Prepare free distribution, contributor guidance and a public-release evidence gate.
- Separate terminal contracts, providers, guarded delivery and injectable app.
- Strict TypeScript, external schemas, official Stream Deck SDK and offline UI.
- Scope the first release to Rex: default and release builds bundle only the
  Rex profile. Herdr TUI/App stay in source behind `experimental.herdr` /
  `experimental.herdrApp`, with unchanged profile IDs; the Rex doctor no longer
  probes Herdr sockets.
- Preserve stable Claude helper entry points.
- Node build/package/recovery tools, guided setup/undo and privacy-safe doctor.
- Automated fixture host, CI audits and draft-only release workflow.

### Added

- Disabled Herdr App fixture foundation, v3 reservation/rollback and source ADR.
- One-time backup/native-install migration for legacy customizations and Claude
  records, included in the beta ZIP.
- Disposable signed-in Herdr calibration for both providers, native settings
  restoration, questions, one-time approvals, Interrupt and Collapse.

### Compatibility

- New DeckShep identities are fixed after the prelaunch reset. Consent defaults
  and v2/v1 preference semantics stay unchanged. Cross-identity preview upgrades
  are explicit fresh setups; independent installer validation remains pending.

## [1.3.4] - 2026-11-07

### Added

- Experimental Claude Code controls and mixed Codex/Claude banks, disabled until
  explicit setup. See the retained validation records for native coverage.
