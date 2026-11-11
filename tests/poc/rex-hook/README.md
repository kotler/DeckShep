# Hook → Rex process registration POC

Run from the repository root:

```sh
npm run poc:rex-hook
node --import tsx --test tests/integration/rex-hook-poc.test.js
```

This is an **isolated, observation-only prototype**. A real Node hook subprocess
receives synthetic Codex lifecycle JSON on stdin, invokes a separate synthetic
Rex CLI process, and atomically writes a private registration. Rex replies,
native process facts, GUI focus and daemon ownership are fixture data. Neither
the real Rex CLI nor Codex is launched, connected to, probed or controlled.

The CLI arguments match the proposed read:

```sh
rex --autostart=false --timeout 2s --server "$REX_SERVER" \
  block call -s "$REX_SESSION" -b "$REX_BLOCK" process
```

The collector requires all three explicit Rex context fields and never falls
back to the focused tab. It checks the panel owner and folder, repeats the
process read, checks process start/image identity, and rechecks setup immediately
before committing. PID/generation changes, revocation and concurrent record
replacement refuse. SessionEnd revokes an existing observation without querying
or binding a replacement foreground process. There are no retries or input APIs.

The private candidate contains the hook's thread ID, Rex session/block IDs,
foreground PID/start/image, hook reporter identity, setup/registration epochs,
event and timestamp. Server and project paths are hashed. Prompts and transcript
paths are discarded. Files use mode 0600 under an owned mode-0700 temporary
directory; the demo removes it when each case ends. Subprocess environments
receive a private HOME and no inherited agent routing/authentication environment.

## Demonstrated cases

| Case | Observed result |
| --- | --- |
| Two hooks with separate launching-panel contexts | Two correct panel/PID/thread observations |
| GUI focus is B while hook context names A | Reads A, independent of GUI focus |
| Shared daemon, distinct supplied panel contexts | Collects both PIDs; daemon parentage supplies no client-origin proof |
| Shared daemon, B's hook inherits A's context | Reads A and records an unverified observation for B's thread |

The last case is a deliberately supplied test scenario. It does **not** establish
that the user's installed Codex build actually supplies a stale hook context.
The first case proves the subprocess data flow, not native compatibility.

Every record has `controlAuthority: false` and a `candidate-` filename. Its
schema is incompatible with production hook records. An integration test also
confirms production identity resolution ignores these files before any native
probe. Matching synthetic reporter/foreground facts are reported as
`reporter-is-foreground`; different facts remain `unverified`. Neither grants
authority. Existing production singleton, native focus and stale-press guards
are unchanged. Nothing is installed and no provider or Rex settings are edited.

## Remaining native evidence

An actual Codex/Rex hook run must establish whether each client supplies the
correct Rex context, which process spawns the hook, and how new/resumed/switched
threads change that context. Native execution remains separately gated by
AGENTS.md: current explicit authorization, the live flags, owned test processes,
private sockets/repos and before/after settings hashes. This fixture demo grants
no authorization to connect to existing sessions or enable controls.
