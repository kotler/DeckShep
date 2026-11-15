# Issue tracker

Issues and specs live in GitHub Issues for `kotler/DeckShep`.
Use the `gh` CLI with `--repo kotler/DeckShep` on issue commands.

## Conventions

- Confirm the target with `gh repo view kotler/DeckShep --json nameWithOwner,url`.
- Create an issue with `gh issue create --repo kotler/DeckShep --title "..." --body-file <file>`.
- Read an issue with `gh issue view <number> --repo kotler/DeckShep --json number,title,body,labels,comments`.
- List issues with `gh issue list --repo kotler/DeckShep --state open --json number,title,labels`, adding label filters as needed. Paginate when the task requires a complete inventory.
- Comment with `gh issue comment <number> --repo kotler/DeckShep --body-file <file>`.
- Change labels with `gh issue edit <number> --repo kotler/DeckShep --add-label "..."` or `--remove-label "..."`.
- Close an issue by posting its resolution, then running `gh issue close <number> --repo kotler/DeckShep`.

Write multiline bodies to a temporary file and pass `--body-file` so their text and newlines survive shell quoting.
Check the installed CLI's help before using version-dependent flags.
Existing repository instructions and the user's authorization govern external writes.

## Relationships and blocking

Use GitHub's native sub-issues for parent and child tickets, and native issue dependencies for blocking edges when supported. Check the current CLI's help for supported commands, or use the corresponding GitHub API through `gh api`.
API relationship fields require issue database IDs when specified by that endpoint.

When those features are unavailable, put `Part of #<parent>` and `Blocked by #<number>` in the child body, and maintain a task list in the parent. A ticket becomes startable when every blocker is closed. Filter out closed blockers when querying dependencies.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue in `kotler/DeckShep`.
When it says to fetch a ticket, read that issue and the relevant comments.

Wayfinder maps use `wayfinder:map`. Child tickets use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`, linked as sub-issues where supported. Create these labels when that workflow is invoked. Query open children, exclude tickets with open blockers or an assignee, and use map order to select the next ticket. Claim by assigning the driving developer. Record the resolution on the child, close it, and update the map with the decision and supporting links.

## Pull requests as a triage surface

**PRs as a request surface: no.**
