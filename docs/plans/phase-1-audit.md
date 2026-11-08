# Phase 1 hygiene audit

Behavior change: none in the plugin. The source installer now writes its recovery
copies outside the checkout, under `~/Library/Application Support/AgentSwitchboard/backups/`.
Profile IDs, ActionIDs, display names, consent defaults and settings schemas are
unchanged. No live agent or installed plugin was operated during this work.

## Verification

- All 73 formatted JavaScript files had identical Babel ASTs after omitting only
  source locations, comments and raw-literal formatting metadata.
- All 1,018 original assertion calls were retained across the 36 moved groups.
- `npm ci` works from the root with the committed nested workspace lockfile.
- `npm test` / `npm run test:coverage`: 42 passing Node tests, including the eight
  Python distribution tests. The added cleanup test proves backups survive and
  symlinked outputs are refused.
- Golden tests: 96 layouts, 1,440 presses, 55 native traces and 18 zero-input
  refusal paths; snapshot contents unchanged after capture.
- Coverage: 87.57% lines/statements, 85.13% branches, 87.46% functions. The baseline
  includes all 26 production JS files, including the unexecuted hook entry point.
  VM-based tests name the original source file so controller/inspector coverage
  is attributed correctly. No coverage threshold is imposed yet.
- `npm run lint`, `npm run format:check`, and `npm run knip` pass.
- `npm run build -- --universal` builds and ad-hoc signs the arm64/x86_64 helper;
  the official Elgato CLI validates the resulting portable plugin.

Sandboxed macOS execution may need local socket/process permissions for the
test-owned Unix server and reading the test process's own metadata. Tests must
fail explicitly if those permissions are unavailable, rather than silently skip
the assertions. They do not access a running user's session.

## Unused-code review

Ran Knip and cross-checked with `rg`, including manifest/config/build/profile and
packaging references. Knip reports dynamic CommonJS exports as unused even when
they have consumers (`context-controls`, Claude state, preset helpers and VM
imports are examples). No such exported code or guard was deleted. Dynamic
fixture modules are explicitly listed as entries. The repeatable scan reports
unused files/dependencies/binaries; export findings need manual review.

Removed the obsolete `com.local.rexagents.sdPlugin/icons/*.svg` files: the
manifest references `action-icon`/`loading`, the renderers embed legacy paths or
read `assets/lucide`, and no code, configuration, generated-profile builder or
test reads `icons/`. Kept the `grok` legacy renderer branch because an existing
assertion exercises it and legacy render paths remain supported. No opt-in or
provider behavior was changed to make an asset look unused.

`dist/`, all backups and dependency directories remain ignored. Cleanup only
removes generated `dist/` and `coverage/`; existing private backups were retained.
Dated validation text moved into three linked `docs/validation/` records; those
records are included in the distribution payload so packaged guide links work.

## Follow-ups

Phase 2 adds strict checkJs and domain types. Phase 3 owns the remaining legacy
lint TODOs, layering and guard extraction. The current ESLint configuration keeps
recommended correctness rules while deferring unused locals/regex punctuation,
unused initial assignments and caught-error cause changes in legacy code.
No SDK, native protocol, live validation, version or release claim changed here.
