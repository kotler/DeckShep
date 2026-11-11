const assert = require('node:assert/strict'),
  { test } = require('node:test');
const {
  sessionFocus,
  RexDisplayFocus,
} = require('../../src/terminals/rex/display-focus');
test('single attached session follows its active window and focused pane across manual tab changes and closures without ever copying', async () => {
  const agent = (session, window, block) => ({ session, window, block });
  const agents = [
    agent('s', 'w', 'a'),
    agent('s', 'v', 'b'),
    agent('else', 'w', 'c'),
  ];
  const client = { client_id: 'client', session_ids: ['s'] },
    observer = new RexDisplayFocus();
  const visible = () => assert.fail('Background clipboard access');
  const selection = async (w, b) =>
    observer.read(
      client,
      [
        sessionFocus('s', {
          active_window_id: w,
          windows: [{ window_id: w, focused_block_id: b }],
        }),
        sessionFocus('else', {
          active_window_id: 'w',
          windows: [{ window_id: 'w', focused_block_id: 'c' }],
        }),
      ],
      agents,
      visible,
    );
  assert.equal((await selection('w', 'a')).block, 'a');
  assert.equal((await selection('v', 'b')).block, 'b');
  assert.equal(await selection('shell', 'z'), undefined);
  assert.equal((await selection('w', 'a')).block, 'a');
});
test('ambiguous attachments check once per focus change, regardless of discovery ordering or failed reads', async () => {
  const display = new RexDisplayFocus(),
    client = { client_id: 'c', session_ids: ['s', 'u'] },
    agents = [
      { session: 's', block: 'a' },
      { session: 'u', block: 'b' },
    ];
  const sessions = [
    { session: 's', window: 'w', block: 'a' },
    { session: 'u', window: 'v', block: 'b' },
  ];
  let copies = 0,
    block = 'b';
  const visible = async () => {
    copies++;
    if (!block) throw Error('Unavailable');
    return block;
  };
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await display.read(client, sessions.reverse(), agents, visible)).block,
      'b',
    );
  assert.equal(copies, 1);
  display.observed(client.client_id, 'a');
  assert.equal(
    (await display.read(client, sessions, agents, visible)).block,
    'a',
  );
  assert.equal(copies, 1);
  block = '';
  sessions[0].block = 'other';
  for (let i = 0; i < 10; i++)
    assert.equal(
      await display.read(client, sessions, agents, visible),
      undefined,
    );
  assert.equal(copies, 2);
});
