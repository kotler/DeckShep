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
