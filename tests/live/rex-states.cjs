const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const {
  cycleCodexSetting,
  readCodexSettings,
} = require('../../src/agents/codex/keyboard-settings');
const {
  cycleClaudeKeyboard,
  readClaudeSettings,
} = require('../../src/agents/claude/keyboard-settings');
const { dialog, runningKeys } = require('../../src/agents/claude/controls');

function observedAnswers(repo, sessionId) {
  const fs = require('node:fs'),
    path = require('node:path');
  const root = path.join(path.dirname(repo), 'home/.claude/projects');
  if (!fs.existsSync(root)) return [];
  for (const project of fs.readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const file = path.join(root, project.name, sessionId + '.jsonl');
    if (!fs.existsSync(file)) continue;
    const answers = [];
    for (const line of fs.readFileSync(file, 'utf8').trimEnd().split('\n')) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        entry.type === 'queue-operation' &&
        ['enqueue', 'dequeue'].includes(entry.operation)
      )
        answers.push(entry.operation);
      if (
        entry.type === 'user' &&
        Array.isArray(entry.message?.content) &&
        entry.message.content.some((part) => part.type === 'tool_result')
      )
        answers.push('tool-finished');
      if (entry.type === 'user' && typeof entry.message?.content === 'string')
        answers.push('user-input');
      if (
        entry.type !== 'assistant' ||
        entry.sessionId !== sessionId ||
        !Array.isArray(entry.message?.content)
      )
        continue;
      for (const part of entry.message.content) {
        if (part.type === 'tool_use') answers.push('tool-called');
        if (part.type !== 'text') continue;
        const numbers = part.text.match(/\b(?:2,?091|7,?409)\b/g) || [];
        answers.push(...numbers.map((n) => n.replace(',', '')));
      }
    }
    return answers;
  }
  return [];
}
// Prove the synthetic sleep is still running under this exact Claude pane.
function runningDelay(pid, owned) {
  const { spawnSync } = require('node:child_process');
  const pending = [pid];
  owned.assert(pid);
  while (pending.length) {
    const parent = pending.pop();
    const rows = spawnSync('/usr/bin/pgrep', ['-P', String(parent)], {
      encoding: 'utf8',
      timeout: 1000,
    });
    if (rows.status !== 0) continue;
    for (const child of rows.stdout.trim().split(/\s+/).map(Number)) {
      const image = spawnSync('/bin/ps', ['-p', String(child), '-o', 'comm='], {
        encoding: 'utf8',
        timeout: 1000,
      }).stdout?.trim();
      if (image && /(?:^|\/)sleep$/.test(image)) {
        owned.assert(child);
        return true;
      }
      pending.push(child);
    }
  }
  return false;
}

async function checkState({
  scenario,
  provider,
  target,
  read,
  deliver,
  assertEmpty,
  screen,
  writeOwned,
  sessionId,
  pid,
  owned,
  repo,
}) {
  const codex = provider === 'codex';
  const key = (view, value) => deliver(view, 'send-key', value);
  async function setting(action) {
    if (codex)
      return cycleCodexSetting(
        { read, key, paste: (view, cmd) => deliver(view, 'send', cmd) },
        action,
      );
    return cycleClaudeKeyboard(await read(), key, action, target);
  }
  async function waitFor(predicate, reason, timeout = 45000) {
    const end = Date.now() + timeout;
    do {
      let view;
      try {
        view = await read();
      } catch (err) {
        if (err.message !== 'Rex view changed') throw err;
      }
      if (view) {
        if (predicate(view)) return view;
        if (
          /invalid api key|authentication_error|not authorized|usage limit reached|401 Unauthorized|API Error: 40[13]|failed to connect|out of usage/i.test(
            view.text,
          )
        )
          throw Error(
            'Private provider reported an authentication, usage or connection error',
          );
      }
      await delay(250);
    } while (Date.now() < end);
    throw Error(reason);
  }
  async function type(view, text) {
    const typed = await deliver(view, 'send', text);
    assert(
      typed.cursor &&
        typed.text.split('\n')[typed.cursor.row - 1]?.includes(text),
      'Cursor did not confirm the synthetic input',
    );
    return typed;
  }
  async function prompt(text) {
    const view = await read();
    await assertEmpty(view);
    await deliver(await type(view, text), 'send-key', 'enter', false);
  }
  if (scenario === 'plan' || scenario === 'permissions') {
    const before = codex
      ? readCodexSettings(await read())
      : readClaudeSettings(await read());
    const result = await setting(scenario);
    assert(result.label, 'Native setting change unconfirmed');
    if (!codex) {
      const after = readClaudeSettings(await read());
      assert.notEqual(before.permissions, after.permissions);
      assert.equal(after.permissions, result.label);
    } else if (scenario === 'plan') {
      assert.equal(readCodexSettings(await read()).plan, 'Plan');
      await setting(scenario);
      assert.notEqual(readCodexSettings(await read()).plan, 'Plan');
    } else {
      // Reopen the native list to verify which permission profile is active.
      const idle = await read();
      await assertEmpty(idle);
      const menu = await key(await type(idle, '/permissions'), 'enter');
      assert.equal(readCodexSettings(menu).permissions, result.label);
      assert.notEqual(result.label.toLowerCase(), 'full access');
      await assertEmpty(await key(menu, 'escape'));
    }
    return;
  }
  if (scenario === 'choice') {
    if (codex) await setting('plan');
    await prompt(
      'Use ' +
        (codex ? 'request_user_input' : 'AskUserQuestion') +
        ' for a single choice: Red or Blue. Then reply only with the selected color.',
    );
    function menu(v) {
      if (!codex) {
        try {
          if (!dialog(v.text, 'question')) return false;
        } catch {
          return false;
        }
      }
      return (
        /(?:\d+[.)]|[❯›>])\s*Red\b/i.test(v.text) &&
        /(?:\d+[.)]|[❯›>])\s*Blue\b/i.test(v.text)
      );
    }
    const view = await waitFor(
      menu,
      'Provider did not present the native Red/Blue choice',
    );
    const next = await key(view, 'down');
    assert(
      menu(next) && /[❯›>]\s*(?:\d+[.)]\s*)?Blue\b/i.test(next.text),
      'Blue highlight unconfirmed',
    );
    const after = await key(next, 'enter');
    if (
      !codex &&
      /Submit answers/i.test(after.text) &&
      dialog(after.text, 'question').review
    )
      await key(after, 'enter');
    const done = await waitFor(
      (v) => !menu(v) && /^\s*(?:[●•⏺]\s*)?Blue[.!]?\s*$/im.test(v.text),
      'Provider did not acknowledge the selected choice',
    );
    await assertEmpty(done);
    return;
  }
  await prompt(
    'First run sleep 14. Then answer 123 times 17. Complete this request before answering any queued follow-up.',
  );
  const activity = /esc to interrupt/i;
  const queueText = 'After the first answer, give the product of 239 and 31.';
  async function workingScreen(expected) {
    const text = await screen();
    const rows = text.split('\n');
    const index = rows.findLastIndex((line) =>
      codex ? /^› /.test(line) : /^\s*❯(?:[ \u00a0]|$)/.test(line),
    );
    if (index < 0) return false;
    const draft = rows[index].replace(/^\s*[›❯]\s*/, '').trimEnd();
    if (
      draft !== expected &&
      !(codex && !expected && draft === 'Ask Codex to do anything')
    )
      return false;
    const nearby = rows.slice(Math.max(0, index - 8)).join('\n');
    if (!codex && scenario === 'queue') return runningDelay(pid, owned);
    return activity.test(nearby);
  }
  async function until(check, message) {
    const end = Date.now() + 45000;
    do {
      if (await check()) return;
      await delay(200);
    } while (Date.now() < end);
    const last = await screen();
    throw Error(
      message +
        (sessionId
          ? ' [' + observedAnswers(repo, sessionId).join(', ') + ']'
          : '') +
        ' (activity=' +
        /esc to interrupt/i.test(last) +
        ', approval=' +
        /do you want to (?:allow|proceed)/i.test(last) +
        ', draft=' +
        last.split('\n').some((l) => /^\s*❯.*product of 239/.test(l)) +
        ', review=' +
        /Ready to submit your answers/i.test(last) +
        ', first=' +
        /2,?091/.test(last) +
        ', second=' +
        /7,?409/.test(last) +
        ')',
    );
  }
  await until(
    () => workingScreen(''),
    'Working cue with empty composer was not observed',
  );
  if (scenario === 'interrupt') {
    assert(await workingScreen(''));
    writeOwned('send-key', 'escape');
    await until(async () => {
      const text = await screen();
      return (
        /interrupted|conversation aborted/i.test(text) && !activity.test(text)
      );
    }, 'Provider did not acknowledge interruption');
    return;
  }
  assert(await workingScreen(''));
  writeOwned('send', queueText);
  await until(
    () => workingScreen(queueText),
    'Typed text in a working composer unconfirmed',
  );
  assert(await workingScreen(queueText));
  writeOwned('send-key', ...(codex ? ['tab'] : runningKeys('queue')));
  await until(async () => {
    const text = await screen();
    if (!codex) {
      const answers = observedAnswers(repo, sessionId);
      return (
        answers.includes('tool-finished') &&
        answers.indexOf('2091') > answers.indexOf('tool-finished') &&
        answers.indexOf('7409') > answers.indexOf('2091') &&
        !activity.test(text)
      );
    }
    return /\b2,?091\b[\s\S]*\b7,?409\b/.test(text) && !activity.test(text);
  }, 'Both answers were not observed in order after queueing');
}
module.exports = { checkState };
