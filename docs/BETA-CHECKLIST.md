# Beta verification

## Completed locally

- The validated Rex baseline has 24 automated test groups. This Herdr development branch adds three groups (27 total); live Herdr validation is tracked separately in HERDR.md.
- Settings panel connected in the installed Stream Deck editor; both Codex chats identified, existing opt-in preserved, prompt fields populated. Preferences were inspected without changing their values.
- Automated routing, stale state/request, process/focus replacement and malformed metadata tests.
- Staged Send checks edited/cleared/manually submitted drafts, cursor/chat/turn changes, read failures and uncertain writes; no retry after an uncertain submission.
- Shared-preference validation rejects policy/sandbox fields; diagnostics never read clipboard focus; setup requires explicit visible-pane consent.
- Thirteen-agent fixture across three banks, closed holes, stale presses, manual Collapse, bank clamping, replacement processes, all-closed agents and partial discovery.
- Native daemon model/reviewer checks performed in earlier work preserved permission boundaries and unsent drafts. Existing agent processes were not restarted.
- Single Effort control reads the native value, advances through the selected model's supported levels and wraps. Physical cycle/wrap passed after the animation fix; the native settings snapshot matched the original Default/High configuration afterward. Original agent processes remained running.
- Reproduced an effort-button failure during the native Max/Ultra status-line animation. Footer reads now wait for a stable verified viewport for up to four seconds, with no mutation retries. A full live guarded cycle passed through Low, Medium, High, Xhigh, Max, Ultra and back to Low. Mode and permission boundaries were preserved. Error text now outlasts the brief hardware warning overlay.
- The actual updated installer was extracted into an independent temporary directory. Bundled JavaScript modules and watermark assets loaded without checkout dependencies; fresh clipboard-focus consent stayed off and all seven beta archive checksums matched.
- New input-digest reader checked read-only against running Codex agents. No prompt was submitted, no input text retained or logged.
- Signal artwork installed and inspected in the Stream Deck editor. Owner confirmed the final labels, brain icon, inset bands and agent watermark are readable from the normal seat.
- Official Elgato validation and local packaging are part of the build. The artifact audit rejects development state, backups, logs and local home/workspace paths.

## Owner hardware checks

Use normal work or a deliberately disposable test agent. Test prompts and approval decisions require explicit authorization; the current scratch agents are authorized for these checks.

- [x] Owner confirmed the final labels, brain icon, inset color bands and agent watermark are readable from the normal viewing angle.
- [x] Physical Interrupt stopped a scratch turn; native daemon confirmed interrupted. Background sleep remained running until separately stopped.
- [x] Physical Interrupt and Stop terminals keys verified on the scratch chat. Interrupt produced an interrupted native turn and the deck changed to BACKGROUND; Stop terminals removed the background process. Agent PIDs remained unchanged.
- [x] Physical Steer delivered the staged message during the active scratch turn and produced STEER RECEIVED. Physical Queue displayed Queued follow-up inputs, then produced QUEUE RECEIVED after CURRENT TASK COMPLETE. Test commands were cleared and both scratch agents returned to Ready.
- [x] Physical Zoom expanded the selected agent from an actual split-pane layout; a second press restored the split. The temporary passive pane was closed afterward.
- [x] Physical question controls selected Blue and Large in one two-question request. Down/Up, Confirm, Page, Left/Right, and saved-answer navigation verified on Home and Questions.
- [x] Physical approval Up/Down and Confirm denied a print-only command; physical approval Esc canceled a second print-only request. Both ran in a temporary on-request approval-test agent, which was closed afterward. Original agent settings were preserved.
- [x] Physical Confirm allowed a print-only command once. Native confirmation said "this time," the expected marker was printed, persistent approval-rule file hashes were unchanged, and original chat settings were preserved.
- [ ] Persistent approval-rule creation remains untested.
- [x] Physical Effort key completed High → Xhigh → Max → Ultra → Low → Medium → High without a warning. Native daemon confirmed High, Default, and the full original settings snapshot afterward.
- [x] Physical Default key switched into Plan and native settings confirmed the mode. Default/High was restored and verified after testing.
- [x] Physical Send refused a staged draft after a manual edit; the native latest-turn stamp was unchanged. Restaging the original harmless prompt and pressing Send once produced SEND_GUARD_TEST_OK in one completed turn and cleared the composer. Full original chat settings matched afterward; the original Review shortcut was restored.
- [x] With the first agent selected on the deck, switched Rex to the second tab manually and physically pressed Model. The deck warned, cleared its selected dot and requested reselection. Metadata-only before/after snapshots confirmed neither original agent's model or effort changed; the first agent's full settings snapshot was preserved.
- [x] Physical Next agent moved Test E to the off-page Test F and displayed bank 2 with its selected dot. Owner confirmed forward wraparound and bank cycling. Physical Collapse removed a closed middle slot; editor confirmed the relative order of the two original agents, Test D, Test E and Test F was preserved in one bank. Automated coverage also verifies selected-bank wraparound.
- [x] Temporary validation agents were closed only after identity and idle-state checks. Temporary labels and Review shortcut were restored; the two original processes remained running with the original settings.
- [x] Diagnosed Test F's Unknown captions as different Rex/Codex launch directories. Relaunching only the disposable test agent with matching directories made the normal metadata reader report Workspace, gpt-6.1-sol and High. No directory guard was bypassed.

## Independent beta checks

- [ ] Install from the package on a Mac without this development checkout.
- [ ] Complete Remote Control consent, visible-pane opt-in and selected-agent footer setup without assistance.
- [x] Animation preference persisted across a real Stream Deck restart and local plugin update, then was restored to its original enabled value. Shared prompt preferences also survived the subsequent updates.
- [ ] Validate the helper on Intel hardware before advertising Intel support.
- [x] Isolated Unix-socket integration checks refused unavailable/disconnected daemons and unsupported versions without settings writes or retries. Actual Stream Deck restart/local upgrades preserved preferences and left the original agent PIDs unchanged.
- [ ] Exercise Rex quit/reopen in a disposable environment; current testing must preserve the running original agents.

## Owner release decisions

- Choose the project license and public name.
- Resolve redistribution of OpenAI artwork or replace it for a public package.
- Decide whether slot order should persist across plugin restarts.
- Choose public distribution/signing/notarization and maintenance commitments.
- Approve any further Superlogical outreach, public repository or release. The user-authorized Discord feature-request reply and beta-mac project introduction have been posted; no public repository or release has been published.
