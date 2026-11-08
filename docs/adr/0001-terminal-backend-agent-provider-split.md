# 0001 — Separate terminal backends and agent providers

Status: implemented in the refactor foundation.

Terminal capabilities and agent semantics evolve independently. `TerminalBackend`
owns discovery, native focus, reads and delivery; `AgentProvider` owns matching,
binding and control semantics. The app is their composition root. Domain and
render logic remain pure. Dependency Cruiser enforces these imports in CI.

Native identity and UI verification remain in the characterized session engines
under `app/`, with Codex/Claude family helpers under `agents/`. These compatibility
engines implement the backend drivers; the provider adapters delegate to them.
This retains every native check while removing the old raw host bootstrap and
controller monkeypatches. Further splitting the large compatibility engines is
an incremental follow-up, not permission to remove their guards.

The application accepts an event port, clock, renderer, filesystem, provider and
backend factories. Controller tests instantiate it directly. No VM executes the
controller. The inspector's isolated browser DOM test still uses a VM.
