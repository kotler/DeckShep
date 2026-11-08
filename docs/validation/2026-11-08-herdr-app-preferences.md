# Herdr App Phase 1b preferences and routing — 2026-11-08

Scope: an independent App profile in the experimental v3 codec and a dedicated,
inactive preview controller. No production transport was wired, no mod installed,
and no App, core, provider, daemon or existing plugin was accessed. The build
flag and all existing default profiles/IDs remain unchanged.

## Settings and safety

The App profile stores `herdrAppHome`, `herdrAppCoreSocketPath`,
`herdrAppReadbackEnabled`, `herdrAppInputEnabled` and its own `claudeEnabled`.
Both paths are empty/unselected by default; all three opt-ins default false.
Paths are syntax-validated without probing the filesystem. Unknown App fields,
foreign-profile keys and malformed values are rejected.

Migration from v1/v2 preserves every Rex/Herdr setting and creates no App
consent. Existing empty experimental App profiles migrate to explicit disabled
defaults. App edits cannot change Rex/TUI opt-ins; legacy/shared edits preserve
the App profile. Shared animation/prompts remain shared. Round-trip and explicit
v2 rollback preserve the legacy wire projection byte-for-byte. Flag-off code
still uses the original v2 codec.

`profileScope: 'herdr-app'` now reaches only its own controller when the build
flag is enabled. Reused key contexts detach from their prior owner. The preview
does not subclass a legacy session and never invokes Rex/TUI discovery, provider
metadata or integration setup. It retains the existing “Preview only” key images
and ignores presses, even if a user explicitly saves future App opt-ins.

For future verified delivery, the kernel checks App read-back consent before
issuing a permit and at final I/O. Native keys/paste/provider writes also need
App input consent. Focus needs read-back consent independently of input consent.
These opt-ins supplement the record/capability/provider/identity guards; they
do not create verification evidence or install hooks.

## Checks

| Check | Result |
| --- | --- |
| New migration/projection/corruption/routing/consent cases | 7 passed |
| Full coverage suite | 188 tests: 186 passed, 2 disabled live tests skipped, 0 failures |
| Coverage | Lines/statements 95.34%; functions 89.86%; branches 86.43%; gates unchanged |
| Source golden groups | All 4 passed; golden JSON unchanged |
| Bundled golden groups | All 4 passed |
| Existing browser suite | All 18 passed; exact SVG assertions and six existing screenshots unchanged |
| Lint, production/e2e typecheck, formatting, dependency rules, knip | Passed |
| Version and generated compatibility checks | Passed |
| Universal build and private-review package/audits | Passed; nothing installed or uploaded |

Runtime: Node 26.13.0. Tests used private fake sockets, fixture agents and the
already cached pinned browser; no browser download or native authorization was
needed or inferred. Build, packaging and bundled checks ran serially when
sharing `dist/`.

## Remaining work

The inspector's App-specific setup fields, production discovery/events and
verified selection/Zoom are still Phase 2 work. App/core build/peer identity,
fresh read-back and native calibration remain prerequisites; no control or
compatibility record was added. The optional read-only mod remains a design
proposal for owner review, not an enabled integration or release claim.
