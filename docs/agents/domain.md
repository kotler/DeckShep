# Domain docs

DeckShep uses one shared domain vocabulary. The npm workspaces package the plugin and development tools within this layout.

## Read before exploring

Read root `GLOSSARY.md` when it exists and the ADRs in `docs/adr/` relevant to the change. Follow the area-specific reading instructions in `AGENTS.md` and `CLAUDE.md` as well.

Proceed silently when a glossary is absent. Domain modeling can create it when terms are resolved during actual work.
If a future root `GLOSSARY-MAP.md` exists, follow its pointers for the relevant contexts.

## File locations

- `GLOSSARY.md` holds shared domain terms at the repository root.
- `docs/adr/` holds architecture decisions, using the existing numbered filenames.
- `docs/plans/` holds design and implementation plans.
- `docs/validation/` holds evidence from checks that actually ran.
- GitHub Issues holds specs and work tickets as described in `issue-tracker.md`.

## Vocabulary and decisions

Use established glossary terms in issues, designs, hypotheses, tests and code.
Check existing documentation before introducing a new term. Raise a genuine vocabulary gap during domain modeling.

Surface any conflict with an existing ADR, including its number and the reason for reopening the decision. Obtain an owner decision when required by the repository's standing instructions.
