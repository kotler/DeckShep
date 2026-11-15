# Physical release smoke — at most nine presses

Use a disposable, explicitly authorized native test session. Automated tests
cover layouts, host frames and stale-input refusals; these presses check the USB,
LCD and installed profile path. Record exact versions and outcome per release.

1. Select Agent 1: confirm LCD label and native pane agree.
2. Next agent (row 2, key 1): confirm the next native pane and selected dot.
3. Next agent at the end of the bank: confirm wrap.
4. Permissions: confirm its Home label and position match the former Zoom key;
   its old position is empty. Verify the current Ask me / Approve for me state
   without pressing it or granting approvals.
5. Page (row 2, key 2), with more than five agent slots: confirm the next group
   and page counter. It must be blank with one group.
6. Confirm a print-only disposable question/approval: verify native state.
7. Collapse (row 2, key 3), after closing a test-owned agent: confirm gaps are
   removed and its key becomes blank.
8. With one test-owned agent remaining, confirm Next agent and Page are blank;
   the selected agent's third-row controls remain available.
9. After switching profiles in Stream Deck, select one agent: confirm isolated
   backend routing and the previous profile's independent selection on return.

Install/upgrade, fresh-account setup and Intel helper execution are separate
release checks, not additional physical control presses. Never reuse historical
scratch agents as implicit permission for a smoke run.

## Herdr App navigation candidate (1.5.0)

Run against a separately authorized test-owned instance. Keep the exact App/Core
versions, package checksum and outcome with the result. These are pending manual
checks, not a passing record.

1. Install/upgrade the candidate and select the bundled Herdr App profile.
   Verify the existing Rex profile, customized keys and settings are preserved.
2. Set the intended absolute App home. With focus consent off, selection is
   deck-local and the App is unchanged. Enable plain focus requests explicitly.
3. Verify chat-name titles, folder subtitles, status and the App selection dot.
   Tap agent tiles, Next and Attention. Check waiting/error/done ranking across
   banks. Page and Collapse only change the deck.
4. Exit an agent to its shell, then close a pane. Verify the gap and Collapse.
   Press a key captured before closure and confirm it cannot navigate elsewhere.
5. Tap Next and Page rapidly. The current destination stays legible and arming
   taps are ignored. Revoke consent during a pending request and verify no write.
6. Keep a separate editor frontmost while navigating. Check reported App
   selection independently and record editor focus and key events. Preserve any
   activation failure, including the unresolved Chrome assertion in the native
   0.1.16 record. Include minimized, hidden and dialog cases in launch review.
7. Restart only the owned App. Old presses expire; the recreated owned socket
   reconnects without permission edits. Restore consent-off state and clean up.
8. Check all five default bottom-row keys are blank for ready, working and
   waiting Codex/Claude panes. Saved Model/Permissions/Interrupt overrides remain
   inactive. Rex controls retain their existing behavior.
