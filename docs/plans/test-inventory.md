# Refactor safety-net inventory

Baseline: `0262267`, plugin 1.3.4. All 36 JavaScript groups and eight Python
distribution tests pass. The Unix-socket fixture test needs local socket binding
permission in sandboxed environments; it never connects to an installed session.

Each row is one existing assertion group. Phase 1 must retain every assertion and
give every group its own `node:test` result, so an early failure cannot hide later
groups. Paths below identify the original baseline files and their intended move.

| Baseline file | Destination under `tests/` | Contract covered |
| --- | --- | --- |
| `test.js` | `integration/core.test.js` | Native visible focus beats server state; session/process/status ownership; clipboard consent/failure; prompt/draft guards |
| `test-controls.js` | `unit/controls.test.js` | Model/effort picker navigation; session-only apply; expiry; SVG escaping and animation |
| `test-focus.js` | `unit/focus.test.js` | Exact selection then activation; opt-out; failure prevents activation |
| `test-onepress.js` | `unit/onepress.test.js` | Independent preset cycles and Plan; no composer submission; tamper/readiness guards |
| `test-preset-setup.js` | `unit/preset-setup.test.js` | Visible viewport; truncated reply rejection; exact field verification before save |
| `test-model-discovery.js` | `unit/model-discovery.test.js` | Catalog filtering; native model/effort snapshots; scratch ownership; process guards |
| `test-effort.js` | `unit/effort.test.js` | Directional effort shortcuts; preserved draft; unsupported routing/refusal |
| `test-daemon-controls.js` | `integration/daemon-controls.test.js` | Socket/footer identity; model-only updates; race guards; no retries; RPC dispatch |
| `test-daemon-effort.js` | `integration/daemon-effort.test.js` | Effort wrap; all other settings preserved; chat/focus/process guards; no retries |
| `test-daemon-permissions.js` | `integration/daemon-permissions.test.js` | Reviewer-only updates; boundary preservation; metadata-only reads; authoritative confirmation |
| `test-agent-metadata.js` | `unit/agent-metadata.test.js` | Chat/project/status labels; cache freshness; identity; no preview retention |
| `test-collapse.js` | `unit/collapse.test.js` | Fresh discovery; stable overflow compaction; draft/focus preservation; offline guard; Next wrap |
| `test-label-refresh.js` | `integration/label-refresh.test.js` | Labels survive polls/delays/failures; live rename; process/cwd cache isolation |
| `test-question-controls.js` | `unit/question-controls.test.js` | Question-only keys; one input per press; draft preservation; approval/auth/composer refusal |
| `test-startup-selection.js` | `integration/startup-selection.test.js` | One opt-in native startup focus read; no polling or fabricated selection |
| `test-dynamic-controls.js` | `integration/dynamic-controls.test.js` | Context rows; stale request/press/focus refusal; transition delay; pages/banks; Claude checkbox/review epochs |
| `test-running-controls.js` | `unit/running-controls.test.js` | Composer cursor/hash/chat; Steer/Queue; request digest; no replay or timeout retry |
| `test-completion-display.js` | `unit/completion-display.test.js` | Completion dwell; selection changes; process replacement; no native state mutation |
| `test-mode-controls.js` | `integration/mode-controls.test.js` | Verified mode/reviewer captions; toggle once; manual changes; metadata privacy |
| `test-staged-send.js` | `unit/staged-send.test.js` | Draft hash/chat/turn/cursor; two-read stability; final focus; consume-before-send; no retries |
| `test-preferences.js` | `integration/preferences.test.js` | Prompt validation; forbidden policy fields; explicit consent; diagnostics; config preservation |
| `test-lifecycle.js` | `integration/lifecycle.test.js` | 13-agent banks; holes; stale slots; Collapse/clamp; replacements; partial discovery |
| `test-inspector.js` | `integration/inspector.test.js` | Registration context; status connection; explicit setup consent; preferences/action overrides |
| `test-background-controls.js` | `integration/background-controls.test.js` | Background-only classification; scoped termination; full fresh terminal set; partial-batch/new-run refusal; privacy |
| `test-herdr-bridge.js` | `integration/herdr-bridge.test.js` | Topology; ownership; terminal/server generations; title identity; focus/Zoom; waiting keys; scroll/view guards |
| `test-herdr-title-identity.js` | `unit/herdr-title-identity.test.js` | Explicit native UUID; unique complete loaded IDs; root/cwd/source/generation; metadata-only reads |
| `test-herdr-rpc.js` | `integration/herdr-rpc.test.js` | Private endpoint; handshake/version; fragmented Unicode; request scope; timeout/disconnect; no mutation retries |
| `test-backend-switch.js` | `integration/backend-switch.test.js` | Independent profiles/selection/pages/banks; settings scopes; disappearance/queued input; delayed metadata isolation |
| `test-claude-state.js` | `unit/claude-state.test.js` | Private records; root/subagent isolation; lifecycle/request epochs; PID reuse/version/cwd; atomic writes |
| `test-claude-setup.js` | `integration/claude-setup.test.js` | Explicit preview/apply/remove; idempotent merge; status-line chaining/restoration; private backup; unchanged auth/policy |
| `test-claude-controls.js` | `unit/claude-controls.test.js` | Native picker/effort; session-only confirmation; staging/edited Send; request/root/turn/heartbeat/binding guards |
| `test-mixed-agents.js` | `integration/mixed-agents.test.js` | Mixed discovery; cross-provider Next/Collapse; replacement identity; captions/art; native metadata isolation |
| `test-claude-herdr.js` | `integration/claude-herdr.test.js` | Independent Claude identity; final waiting/Interrupt preflight; request/scroll/focus races; no composer submission |
| `test-profile-preferences.js` | `unit/profile-preferences.test.js` | v1→v2 migration; round-trip; rollback projection; scoped consent and fresh safe defaults |
| `test-rex-process.js` | `unit/rex-process.test.js` | Executable resolution; exact foreground and owner/start identity; process replacement; no name-only authority |
| `test-claude-cycle.js` | `unit/claude-cycle.test.js` | Model/effort cycles on both backends; native settings preservation; session-only keys; owned modal/focus/scroll/refusal |

`test-plugin-harness.js` is a fixture helper, not a 37th assertion group. Move it
to `tests/helpers/plugin-harness.js` and update its consumers.

`tests/test_distribution.py` has eight independent groups: archive privacy/path
audit; safe defaults/version agreement; generic profile identities/device binding;
non-destructive profile upgrade; bundle checksums; unknown Stream Deck process
state refusal; config merge; explicit device selection. Keep these until the
faithful Node port in Phase 6.

## Added characterization coverage

`tests/integration/golden.test.js` adds four test groups with fixtures under
`tests/fixtures/`: 96 complete layouts, 1,440 isolated key presses, 55 native
control traces, 12 controller refusal paths and six native refusal paths. These
run without a live agent, network connection, clipboard read or settings change.
