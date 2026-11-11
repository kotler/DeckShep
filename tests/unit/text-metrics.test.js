const test = require('node:test');
const assert = require('node:assert/strict');
const { charWidth, textWidth } = require('../../src/render/metrics');

const PRINTABLE = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
);

test('both tables cover exactly the 95 printable ASCII characters', () => {
  for (const bold of [false, true]) {
    for (const c of PRINTABLE) {
      const w = charWidth(c, 1000, bold);
      assert.ok(Number.isInteger(w) && w > 0, `${c} ${bold}`);
    }
    // Neighbours outside the range use the fallback, not a table entry.
    assert.equal(charWidth('\u007f', 1000, bold), 600);
    assert.equal(charWidth('\u001f', 1000, bold), 600);
  }
});

test('known Arial advance widths', () => {
  assert.equal(charWidth(' ', 1000, false), 278);
  assert.equal(charWidth('i', 1000, false), 222);
  assert.equal(charWidth('i', 1000, true), 278);
  assert.equal(charWidth('W', 1000, false), 944);
  assert.equal(charWidth('-', 1000, false), 333);
  for (const d of '0123456789') {
    assert.equal(charWidth(d, 1000, false), 556, d);
    assert.equal(charWidth(d, 1000, true), 556, d);
  }
});

test('widths scale linearly with the font size', () => {
  assert.equal(charWidth('W', 20, false), 18.88);
  assert.equal(charWidth('W', 10, false) * 2, charWidth('W', 20, false));
});

test('bold is never narrower than regular for letters', () => {
  for (const c of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
    assert.ok(charWidth(c, 1000, true) >= charWidth(c, 1000, false), c);
});

test('the ellipsis is one em and non-ASCII characters fall back', () => {
  assert.equal(charWidth('…', 17, false), 17);
  assert.equal(charWidth('…', 17, true), 17);
  assert.equal(charWidth('é', 1000, false), 600);
  assert.equal(charWidth('→', 1000, true), 600);
  assert.equal(charWidth('漢', 1000, false), 1000);
});

test('textWidth is the sum of charWidth', () => {
  const chars = [...'GPT-6-Astra …é'];
  for (const bold of [false, true]) {
    let sum = 0;
    for (const c of chars) sum += charWidth(c, 17, bold);
    assert.equal(textWidth(chars, 17, bold), sum);
  }
  assert.equal(textWidth([], 17, false), 0);
});
