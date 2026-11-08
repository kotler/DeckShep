'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { Bridge, identify } = require('../../src/app/session'),
  {
    executable,
    candidate,
    sameForeground,
  } = require('../../src/platform/rex-process'),
  defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
test('rex process', async () => {
  const pid = 42,
    file = '/opt/homebrew/Caskroom/codex/0.166.0.upgrading/bin/codex',
    state = `${process.getuid()} Wed Nov  4 11:22:33 2026 codex\n`;
  const fake =
    (ps = state, files = `p42\nftxt\nn${file}\nftxt\nn/usr/lib/dyld\n`) =>
    async (name) =>
      name === '/bin/ps' ? ps : files;
  assert.equal(await executable(pid, fake()), file);
  await assert.rejects(() => executable(-1, fake()));
  await assert.rejects(() =>
    executable(pid, fake(state.replace('codex', 'zsh'))),
  );
  await assert.rejects(() =>
    executable(
      pid,
      fake(
        state.replace(String(process.getuid()), String(process.getuid() + 1)),
      ),
    ),
  );
  await assert.rejects(() =>
    executable(pid, fake(state, 'p43\nftxt\nn' + file + '\n')),
  );
  await assert.rejects(() =>
    executable(pid, fake(state, 'p42\nftxt\nn/bin/zsh\nftxt\nn' + file + '\n')),
  );
  let reads = 0;
  await assert.rejects(() =>
    executable(pid, async (name) =>
      name === '/bin/ps'
        ? ++reads === 1
          ? state
          : state.replace('11:22:33', '12:22:33')
        : `p42\nftxt\nn${file}\n`,
    ),
  );
  const foreground = {
    pid,
    user_id: process.getuid(),
    name: 'codex',
    argv0: 'codex',
    cwd: '/project',
  };
  assert(candidate(foreground));
  assert(!candidate({ ...foreground, path: '/bin/zsh' }));
  assert(!candidate({ ...foreground, name: 'zsh' }));
  assert(!candidate({ ...foreground, cwd: 'relative' }));
  assert(!sameForeground(foreground, { ...foreground, pid: 43 }));
  assert.equal(
    identify({ foreground }),
    null,
    'name alone never enables input',
  );
  let current = { ...foreground },
    resolutions = 0,
    inputs = 0;
  const b = new Bridge(structuredClone(defaults), async (args) => {
    if (args.at(-1) === 'process') return { foreground: { ...current } };
    if (args.at(-1) === 'program_status') return { records: [] };
    inputs++;
    throw Error('Unexpected write');
  });
  b.resolveExecutable = async (n) => {
    assert.equal(n, 42);
    resolutions++;
    return file;
  };
  const a = await b.agent({ session: 's', block: 'b' });
  assert.equal(a.app, 'codex');
  assert.equal(a.pid, 42);
  assert.equal(resolutions, 1);
  assert.equal(inputs, 0);
  b.resolveExecutable = async () => {
    current = { ...foreground, pid: 43 };
    return file;
  };
  assert.equal(
    await b.agent({}),
    null,
    'changed foreground cannot inherit prior executable',
  );
  current = { ...foreground };
  b.resolveExecutable = async () => {
    throw Error('unavailable');
  };
  assert.equal(await b.agent({}), null);
  current = { ...foreground, path: '/bin/codex' };
  await b.agent({});
  assert.equal(resolutions, 1, 'reported executable does not need fallback');
  console.log(
    'PASS missing Rex executable resolution, exact foreground and OS owner/start/executable checks, replaced-process refusal, no name-only authority and unchanged ordinary discovery',
  );
});
