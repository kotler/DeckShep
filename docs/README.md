# DeckShep documentation

DeckShep’s public beta targets the 15-key Stream Deck MK.2 with agents running in Rex. Start with the guide for your task.

| Task | Start here |
| --- | --- |
| Install, configure or remove DeckShep | [Installation](INSTALL.md), [older preview identity](IDENTITY.md), [uninstall](UNINSTALL.md) |
| Understand the physical keys | [Profile and key map](PROFILES.md), [compatibility matrix](COMPATIBILITY.md) |
| Configure agent integrations | [Codex optional hooks](CODEX-HOOKS.md), [Claude controls and optional hooks](CLAUDE.md) |
| Troubleshoot or share diagnostics | [Support](SUPPORT.md), [privacy](PRIVACY.md) |
| Work on the next beta | [Current Rex beta plan](plans/REX-BETA-PLAN.md), [physical checklist](BETA-CHECKLIST.md) |
| Prepare a distribution | [Release readiness](RELEASE-READINESS.md), [release procedure](RELEASING.md), [release notes](RELEASE-NOTES.md), [Marketplace](MARKETPLACE.md) |
| Work on an experimental backend | [Herdr TUI](HERDR.md), [Herdr App](HERDR-APP.md), [private preview](HERDR-APP-LIVE-PREVIEW.md), [hardware checks](HERDR-APP-HARDWARE-TEST.md) |

## Where decisions and evidence live

- **adr/** records architectural decisions. Start with the [backend/provider split](adr/0001-terminal-backend-agent-provider-split.md), [press and delivery guards](adr/0002-guard-pipeline-and-single-deliver.md) and [capability checks](adr/0003-capability-gated-controls.md).
- **plans/** contains design proposals, implementation checkpoints and the [current work plan](plans/REX-BETA-PLAN.md). Use the dated [foundation refactor](plans/REFACTOR-PLAN.md) and [implementation record](plans/IMPLEMENTATION-STATUS.md) to trace earlier decisions.
- **validation/** holds test procedures and dated observations. Use the [key-state test plan](validation/KEY-STATE-TEST-PLAN.md) to run a case and the [Rex walkthrough](validation/2026-11-11-rex-beta-walkthrough.md) to look up its result.

## Verification

Run `npm test` from the repository root for fixture coverage. For native checks, use the ownership and authorization rules in the [live harness guide](../tests/live/README.md). For release claims, record the build, environment, action and observed result. The [release checklist](BETA-CHECKLIST.md) tracks independent install and hardware checks.
