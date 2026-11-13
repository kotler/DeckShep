# Rex public beta walkthrough, 2026-11-11

Candidate `8ad9504`, plugin 1.4.0.0, Rex Beta 0.1.0, Codex CLI 0.167.1 and Claude Code 2.1.322. The MK.2 installation's runtime file matched the candidate build after installation.

On the physical MK.2, the owner tapped each idle agent key and confirmed that Rex focus and the white dot followed. The bottom row showed five controls for Codex and four for Claude, as expected.

Claude Model (D12): the owner confirmed that one press advanced the model, closed the picker and left the key showing the same model as Claude after feedback cleared.

Claude Effort (D13, single step): the owner confirmed that one press advanced the slider and closed it. The key showed `xhigh` after feedback cleared.

Claude Permissions (D14): after one press, the owner confirmed that Claude and the key both showed `manual mode`.

Claude idle Interrupt: the owner confirmed the grey `not running` caption and observed no change when tapping the key at an empty prompt.

Claude working Interrupt: failed on the physical MK.2 during the text-generation check. The owner saw `Interrupt / running` before the press, then a warning icon, and the reply continued. Refresh status reported `Check Claude activity`: the press-time check did not recognize an interruptible Claude screen and refused before sending Escape. The inspector showed `done` when read afterward. The exact screen layout at press time was not captured. The earlier background timer did not establish a foreground working turn.

During the follow-up streaming observation the footer showed Opus 5.5 and auto mode throughout. The clipboard notice appeared only upon text selection. A synthetic replay using the reported footer shape, an empty composer and ordinary reply text was refused by the candidate parser. Adding a native spinner immediately above the composer made the same footer pass. The static footer alone does not distinguish an active turn from an idle one.

Physical retest after installing the working-tree Interrupt fix on top of `8ad9504`: passed. The owner observed `Interrupt / running` before the press and `Interrupt / not running` afterward. The reply stopped mid-word and Claude displayed its interrupted prompt.

Codex Mode (C13): passed on the physical MK.2. The owner confirmed that Rex and the key both switched to Plan on the first press and returned to the original mode on the second.

Codex working Interrupt: failed on the physical MK.2 while Codex streamed text. The key showed a warning and `Unavailable / No esc`, and the reply continued. The keyboard path refused before sending Escape. The exact native prompt and shortcut layout at press time is unconfirmed.

The first Codex streaming fix also failed the physical retest. Refresh status reported `Rex view changed`. The fixture reproduced that error when reply text repainted between Rex's two VT reads. A follow-up change permits reply-only repaints while requiring a stable cursor and composer, unchanged footer and observed output progress. Its physical retest failed with `Check output; streaming progress was not confirmed`. Fixtures reproduced that refusal with a pause between chunks and with scrolling beneath a fixed header. The next build takes up to four guarded samples when output stays still, recognizes scrolling below a fixed header, and distinguishes changed surfaces from paused output in the inspector. The owner reported intermittent success on that build and recalled a view-change warning on a failed press.

A fixture reproduced a view-change refusal when an incoming line moved the empty prompt between two reads. The follow-up build compares the prompt, footer, cursor column and reply progress within the two native frames. The focused regression and matrix suites passed (95 tests). The disposable Luna streaming case on the updated code reached the production keyboard action, observed Codex acknowledge the interruption after scrolling, and passed cleanup. The headless harness substitutes owned-pane selection for Mac client focus. The installed runtime matched the build. On the installed follow-up build the owner again reported intermittent MK.2 results. The timing, inspector message and key feedback for the latest failed press are unconfirmed. Codex Interrupt remains a public beta blocker.

The owner reported that the next MK.2 retest usually took three or four presses. A failed press showed the warning while output continued. The owner recalled a view-change message. The revised Codex Interrupt reader gets screen content and cursor from the same native Rex snapshot. Disposable native calibration observed OSC 8 hyperlink styling and ECH (erase-character) controls. The decoder handles both and refuses unsupported controls. Early setup runs either missed the synthetic output or refused a native frame before sending Escape. After launching the helper prompt directly and correcting the decoder, three fresh Luna sessions acknowledged a first-action interrupt (early, scrolled, early). Each asserted exactly one Escape and passed cleanup. This does not exercise the physical Stream Deck route. On 2026-11-12 the owner confirmed that one physical Interrupt press stopped a streaming Codex reply on the installed build. This records one successful MK.2 retest; repeatability across physical turns is still open.

Codex Queue (2026-11-12, physical MK.2): the owner reported that Queue was grey during a streaming turn and pressing it showed a warning. On a subsequent text-only counting turn the owner confirmed the grey caption was `Queue / loading run`. This caption means the displayed target lacked a run ID. Refresh status showed `Chat metadata loading; try again`. That refusal means the press captured no chat ID, so Queue stopped before sending Tab. The owner confirmed no session ID was visible in the Codex footer during hook-free testing. The footer identity prerequisite was missing. After setting up the session-ID footer with hooks off, the owner confirmed that one physical Queue press queued the typed follow-up. Codex finished counting first, then answered the follow-up. The physical Queue retest passed.

Rex compatibility review (2026-11-12): the installed Mac bundle reported build 1956 at review time. Mac preview.29 bundles Server & CLI preview.18 and uses libghostty-vt 1.0.1. Record both the Mac build and running server version on the next calibration, then check cursor position, streaming Interrupt, and focus after a pane move. Earlier observations recorded only Mac version 0.1.0. The release notes document no new Codex turn ID for Queue. [Mac preview.29](https://discord.com/channels/1546797889009881158/1547349572299395172/1570539468715335832) · [Server preview.16](https://discord.com/channels/1546797889009881158/1547349572299395172/1570202596096872460) · [Server preview.18](https://discord.com/channels/1546797889009881158/1547349572299395172/1570531243924262963)

Codex Steer (C16, 2026-11-12): passed on the physical MK.2 with hooks off and the session-ID footer configured. The owner confirmed that one Steer press sent the typed instruction during the active turn. Codex stopped counting before 200 and replied with the requested marker.

| Disposable Rex scenario | Observed result |
| --- | --- |
| Codex and Claude Model | Native picker recognition and Escape passed, including the enlarged Claude picker. The hook-free picker suite also passed cleanup. Model application was not exercised. |
| Codex Permissions | Changed the profile and confirmed it by reopening the picker. |
| Codex Mode | The multi-case run could not locate the idle prompt. A fresh single-case run switched into and out of Plan, then failed its global settings check. |
| Codex Interrupt, Queue and Choice | Each stopped at the idle-prompt preflight. Their working-turn and choice assertions were not reached. |
| Claude Permissions and Plan | Native changes confirmed with and without disposable Claude hooks. Plan is reached through Permissions on the physical Claude layout. |
| Claude Interrupt, Queue and Choice | Passed the live control assertions with and without hooks. |
| Claude Effort | Carousel, fresh launch and resumed history passed with and without hooks. |

The two state-matrix runs, hooks-enabled picker run and separate Codex Mode run failed the teardown comparison of the regular Claude application's state file (`.claude.json`). Runs overlapped and the fingerprint comparison cannot attribute the writer. They do not provide a clean isolation result. Raw terminal captures were disabled.

The virtual deck passed all 50 tests. The remaining physical checks include row 1 states beyond idle, row 2 navigation and Attention, and row 3 captions, settings, input, approval, multi-select and background controls. Use [the key-state plan](KEY-STATE-TEST-PLAN.md) for the individual presses. The optional daemon Interrupt path was not exercised by these native keyboard tests.

`npm run release:check` reported three pending items for this candidate: version-specific launch review, a verified public Issues channel and a verified support email. Public beta sign-off remains open.
