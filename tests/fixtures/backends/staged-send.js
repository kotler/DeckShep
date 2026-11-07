'use strict';
const assert = require('node:assert/strict'),
  { Bridge } = require('../../../com.local.rexagents.sdPlugin/core'),
  {
    composerSnapshot,
  } = require('../../../com.local.rexagents.sdPlugin/native-input');
const defaults = require('../../../com.local.rexagents.sdPlugin/config.json');
function fixture() {
  const a = {
      session: 's',
      block: 'b',
      app: 'codex',
      pid: 42,
      name: 'codex',
      cwd: '/project',
      state: 'idle',
    },
    calls = [];
  let input = {
    chatId: 'chat',
    turnStamp: 'turn-1',
    hash: 'empty',
    empty: true,
    cursor: { row: 2, column: 3 },
  };
  const b = new Bridge(defaults, async (args, text) => {
    calls.push({ args, text });
    if (args[0] === 'send')
      input = {
        ...input,
        empty: false,
        hash: 'staged',
        cursor: { row: 2, column: 30 },
      };
  });
  b.focused = async () => ({ ...a });
  b.checked = async () => ({ ...a });
  b.method = async () => ({ modes: [{ number: 2004, set: true }] });
  b.readStagedComposer = async () => structuredClone(input);
  return {
    b,
    a,
    calls,
    get input() {
      return input;
    },
    set input(value) {
      input = value;
    },
  };
}

module.exports = { fixture };
