const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { digest } = require('../../src/agents/codex/hook-contract');
const { writePrivate } = require('../../src/agents/codex/hook-files');
const { runHook } = require('../../src/agents/codex/hook');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
const session = 'session:01a1ae31-d050-7503-afec-fd2b40d2bc27';
const block = 'block:01a1ae31-d050-7503-afec-fd2b40d2bc28';
const fact = (pid) => ({
  pid,
  parent: 1,
  startedAt: 'Tue Nov 10 10:00:00 2026',
  image: digest('/fixture/codex'),
  codex: true,
});
const input = (patch = {}) => ({
  session_id: id,
  cwd: '/fixture',
  hook_event_name: 'SessionStart',
  ...patch,
});
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-codex-hook-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const setup = path.join(directory, 'setup.json');
  const saved = {
    schema: 1,
    active: true,
    epoch: randomUUID(),
    command: 'fixture-hook',
    hooksFile: '/fixture/hooks.json',
  };
  writePrivate(setup, saved);
  const payload = input({
    prompt: 'PRIVATE PROMPT',
    transcript_path: '/PRIVATE/transcript',
  });
  const owner = fact(80);
  const recordFile = path.join(directory, `80-${id}.json`);
  const publisher = {
    input: (async function* () {
      yield Buffer.from(JSON.stringify(payload));
    })(),
    environment: { REX_SESSION: session, REX_BLOCK: block },
    parent: 80,
    directory,
    setup,
    inspect: async (pid) => fact(pid),
    now: () => 10000,
  };
  await runHook(publisher);
  const agent = {
    session,
    block,
    pid: 42,
    app: 'codex',
    cwd: '/fixture',
    state: 'idle',
  };
  const calls = [];
  let closed = 0;
  const ports = {
    directory,
    setup,
    inspect: async (pid) => fact(pid),
    peer: async () => ({
      pid: 80,
      socket: '/fixture/daemon.sock',
      clients: [42],
    }),
    connect: async () => ({
      request: async (method, params) => {
        calls.push({ method, params });
        if (method === 'thread/loaded/list')
          return { data: [id], nextCursor: null };
        if (method === 'thread/read')
          return { thread: { id, cwd: '/fixture' } };
        throw Error('Unexpected read');
      },
      close: () => closed++,
    }),
    now: () => 10000,
  };
  return {
    directory,
    setup,
    saved,
    payload,
    owner,
    publisher,
    agent,
    recordFile,
    ports,
    calls,
    closed: () => closed,
  };
}

module.exports = { fixture, id, session, block, fact, input };
