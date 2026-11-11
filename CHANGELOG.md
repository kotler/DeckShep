# Changelog

All notable changes are documented here. Versions follow Semantic Versioning;
preview artifacts use `-beta.N` release tags.

## [Unreleased]

### Changed

- Follow unambiguous Rex session focus without polling the clipboard. Present
  agent settings and press targets together after discovery so a slow refresh
  cannot flash Unknown or refuse an unchanged Codex control. Recognize the
  native context-percentage footer when opening a settings picker.

- Make the first two Rex rows independent of provider integrations. Use Rex
  titles, owned process/status records and physical pane selection for the agent
  bar and navigation; refresh Claude proof asynchronously for row 3. Preserve
  row-3 identity/input guards and existing optional hook setup.
- Integrate explicitly addressed Rex panel/PID observations into active Codex
  hooks. Commit lifecycle reports first; keep optional metadata in separate
  private epoch-bound sidecars. Query failures preserve lifecycle state and
  observations grant no shared-daemon control authority.
- Follow the visible Rex pane for the selection dot, including manual tab changes,
  shell tabs and tab closures. Background agent arrivals do not steal selection.
- Route the four Rex ready-state settings keys through native keyboard controls.
  Model and Effort use session-only selection; Permissions cycles actual native
  profiles. Unknown views and extra confirmations stop input. The status line
  and terminal title need no changes.
- Keep in-flight Codex metadata isolated from render hydration so hook identity
  epochs and safe verification diagnostics survive concurrent display refreshes.

- Add optional Codex lifecycle-hook identity for Rex, with private setup/report
  records, exact process/pane checks, single-client/single-thread proofs and
  captured-epoch refusals. Preserve independent footer verification and all
  native composer/focus/provider guards. Fresh installs do not enable hooks.

- Remove Zoom from deck layouts and inspector action choices. Its former Home
  and Prompts positions become available; question/approval Confirm stays in place.
- Rename Reviewer to Permissions and move the Codex Home key to the former
  Zoom position. Rename the bank button to Page without an arrow.
- Keep one dynamic Home layout. Row 2 is Next agent / Page / Collapse, shown
  only for multiple agents / multiple agent pages / gaps respectively. Remove
  the Questions/Prompts page selector; keep contextual questions in row 3.
- Embed provider watermarks as inline SVG paths with explicit fills so they
  render in Stream Deck's native editor.
- Fit long key captions with an explicit font size as well as SVG text-length
  hints, preventing native clipping of labels such as Permissions.
- Preserve the missing Codex footer-ID hint across discovery refreshes and bring
  the read-only footer-check result into view in the setup panel.
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
- Make Codex footer setup read-only. **Check selected Codex agent** now only
  reads the pane and the daemon; it never opens settings dialogs, stores a
  preset or changes the status line. Users enable the session ID in their own
  footer, and Codex keys in Rex show **No footer ID** until they do.
- Run Claude controls in hooks-only mode. Without DeckShep's status line,
  controls use press-time process, lifecycle and native-view proof instead of a
  heartbeat; Model/Effort read the native picker, and hook captions are
  display only (`?` after 30 minutes). Setup also registers PostModelSwitch.
- Remove the Claude status-line install option. `configure-claude.js
--statusline` is refused; older setups get **Restore your original status
  line** (`--restore-statusline`), which keeps the hooks.
- Node build/package/recovery tools, guided setup/undo and privacy-safe doctor.
- Automated fixture host, CI audits and draft-only release workflow.

### Added

- Fixed phase and execution-failure diagnostics for optional hook panel reads,
  without recording command output, arguments or paths or granting identity.
- Add an isolated hook-to-Rex-process registration POC, including explicit panel
  targeting, private candidate records, lifecycle/race refusals and a synthetic
  shared-daemon stale-context counterexample. It grants no production authority.
- Privacy-safe Rex server API-revision diagnostics and fixture regression cases
  for app reconnects, changed panes/processes/requests and uncertain writes.
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
