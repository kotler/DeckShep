# Hook-to-Rex registration POC

The owner requested a POC of having a Codex hook call the Rex CLI, read the
panel's foreground process and save that result with the hook's session_id.
The runnable experiment is documented in
[the POC guide](../../tests/poc/rex-hook/README.md).

`npm run poc:rex-hook` launches Node hook subprocesses that receive lifecycle JSON
on stdin. They execute a separate **synthetic** Rex CLI process with explicit
server/session/block arguments and the `process` method. The collector stores
minimal candidate records under a private temporary directory. Every PID, native
start/image fact, Rex process reply and GUI selection is synthetic; no native
Rex/Codex process is inspected or connected to. The script removes each temporary
directory after inspecting the results.

The demo and assertions show:

- Separate supplied panel contexts produce separate panel/PID/thread records.
- A GUI focus change does not redirect an explicitly targeted process query.
- A shared reporter can collect two PIDs if given distinct panel contexts.
- If a second hook is deliberately given the first panel's context, the CLI
  faithfully returns that first panel's PID even when both panels have the same
  project. The observation remains unverified. This fixture demonstrates a
  possible misassociation, not the actual behavior of the owner's Codex build.

The collector rechecks process observations and native-identity fixtures, setup
consent and record revisions before commit. It refuses missing context, foreign
owners, shell processes, different directories, malformed PIDs, changed process
generations, PID reuse, setup revocation and concurrent record replacement.
SessionEnd revokes the existing observation without rebinding to a new process.
Prompts, transcript paths and raw server/project paths are absent from records.
Errors do not echo subprocess output or paths. Records are 0600, the temporary
parent is 0700, and the subprocess environment does not inherit agent credentials
or routing. Only the synthetic `process` query is supported; there is no focus,
screen, input, delivery or retry capability.

All observations have `controlAuthority: false`, a distinct schema and candidate
filename prefix. A test confirms that production hook identity ignores them
before executing a native process probe. No production source, guard, packaged
hook entry, installed plugin, native agent or provider/Rex settings were changed
for this experiment. The new npm command and Knip entries are development tools.

Validation: 17 new POC tests passed. The complete isolated suite passed with
417 tests and four live suites skipped. Typecheck, lint, Knip, dependency checks
and formatting passed; no golden or image was changed. The fixture tests passed
again after the collector was split into smaller observation/lifecycle helpers.
No native build, installation, hook setup or live calibration was run.

The result proves the collection and storage path. It does not establish which
Rex context stock Codex supplies to hooks under an actual shared daemon, or that
a reported panel triggered an event. That needs separately authorized native
evidence with owned processes/private sockets and before/after settings hashes.
The existing production shared-client guard remains in place.
