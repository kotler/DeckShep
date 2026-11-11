const test = require('node:test');
const assert = require('node:assert/strict');
const { keyMessage } = require('../../src/domain/labels');

const MAX = 15;
const SAMPLES = [
  'Select an agent first',
  'Input target changed',
  'Input permit expired',
  'Reselect agent on deck',
  'Claude session changed; reselect',
  'Controller changed; no input sent',
  'Controls updating; press again',
  'Controller changed; press again',
  'Waiting request changed; press again',
  'Agent state changed; press again',
  'Selected chat changed while the key was pressed',
  'Supercalifragilisticexpialidocious',
  'a b c d e f g h i j k l m n o p q r s t',
  '',
];

test('text that already fits is kept as written', () => {
  assert.equal(keyMessage('Focus refused'), 'Focus refused');
  assert.equal(keyMessage('Request expired'), 'Request expired');
  assert.equal(keyMessage(''), '');
  assert.equal(keyMessage(null), '');
  assert.equal(keyMessage(undefined), '');
});

test('control characters are stripped before measuring', () => {
  assert.equal(keyMessage('Focus\u0000 ‮refused\n'), 'Focus refused');
});

test('the clause before a semicolon is used when it fits', () => {
  assert.equal(keyMessage('Profile changed; press again'), 'Profile changed');
  assert.equal(keyMessage('Setup finished; press again'), 'Setup finished');
  assert.equal(keyMessage('Press expired; press again'), 'Press expired');
});

test('a trailing "; press again" becomes "Press again", in any case', () => {
  assert.equal(keyMessage('Controls updating; press again'), 'Press again');
  assert.equal(keyMessage('Controller changed; press again'), 'Press again');
  assert.equal(keyMessage('Agent state changed; Press Again'), 'Press again');
  assert.equal(
    keyMessage('Waiting request changed; PRESS AGAIN'),
    'Press again',
  );
});

test('fixed guard and controller messages map to short labels', () => {
  const table = {
    'Select an agent first': 'Select agent',
    'Input target changed': 'Target changed',
    'Input permit expired': 'Press again',
    'Reselect agent on deck': 'Reselect agent',
    'Claude session changed; reselect': 'Reselect agent',
    'Controller changed; no input sent': 'No input sent',
    'Control unverified': 'Not verified',
    'Control input changed': 'Input changed',
    'Enable visible-pane checks first': 'Enable checks',
    'Select a ready Codex agent on the deck': 'Select agent',
    'Unsupported input action': 'Not supported',
  };
  for (const [text, label] of Object.entries(table)) {
    assert.equal(keyMessage(text), label, text);
    assert.ok(!label.includes('…'));
  }
});

test('anything else keeps whole words and ends with an ellipsis', () => {
  assert.equal(
    keyMessage('Selected chat changed while the key was pressed'),
    'Selected chat…',
  );
  assert.equal(
    keyMessage('Supercalifragilisticexpialidocious'),
    'Supercalifragi…',
  );
});

test('the result never exceeds 15 characters and never ends mid-word', () => {
  for (const text of SAMPLES) {
    const result = keyMessage(text);
    assert.ok(Array.from(result).length <= MAX, `${text} -> ${result}`);
    if (!result.endsWith('…')) continue;
    const kept = result.slice(0, -1);
    const words = text.split(' ');
    const prefix = words.findIndex(
      (word, i) => words.slice(0, i + 1).join(' ') === kept,
    );
    if (words[0].length > MAX - 1) assert.ok(text.startsWith(kept), result);
    else assert.ok(prefix >= 0, `${text} -> ${result} cuts a word`);
  }
});
