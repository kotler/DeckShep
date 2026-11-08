const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppFocusAuthority } = require('../../src/guards/app-focus-request');
const { GuardPipeline } = require('../../src/guards/pipeline');
const { focusState } = require('../helpers/herdr-app-focus');

function fixture() {
  const state = focusState();
  let now = 1000;
  const authority = new AppFocusAuthority(
    () => state,
    () => now,
  );
  const context = { ...structuredClone(state), pressedAt: now };
  return {
    state,
    authority,
    context,
    setNow: (value) => {
      now = value;
    },
  };
}
test('request permits and their final leases are single-use and cannot serve as provider input permits', () => {
  const x = fixture(),
    permit = x.authority.issue(x.context);
  const pipeline = new GuardPipeline(() => ({}));
  assert.throws(
    () => pipeline.consume(permit, {}, 1, { kind: 'keys' }),
    /permit expired/,
  );
  assert.throws(() => x.authority.begin({}), /expired/);
  const lease = x.authority.begin(permit);
  assert.throws(() => lease.postflight(), /expired/);
  assert.throws(() => x.authority.begin(permit), /expired/);
  assert(Object.isFrozen(lease.context));
  assert(Object.isFrozen(lease.context.target));
  lease.consume(x.context.peerKey, x.context.recordKey, 1);
  lease.postflight();
  assert.throws(
    () => lease.consume(x.context.peerKey, x.context.recordKey, 1),
    /expired/,
  );
  assert.throws(() => lease.check(), /expired/);
});
test('request issue and final checks retain consent, visibility, setup, profile, arming and stale-context refusals', () => {
  for (const [field, value] of [
    ['visible', false],
    ['setupBusy', true],
    ['focusRequestEnabled', false],
    ['scope', 'rex'],
    ['control', 'focus'],
    ['appearance', 2],
    ['visibility', 2],
    ['generation', 2],
    ['backendKey', 'other'],
    ['page', 1],
    ['stamp', 'other'],
    ['armedAt', 600],
    ['endpointGeneration', 2],
    ['peerKey', 'other'],
    ['recordKey', 'other'],
    ['target', { ...focusState().target, terminal: 't2' }],
    ['target', null],
  ]) {
    const x = fixture(),
      permit = x.authority.issue(x.context);
    x.state[field] = value;
    assert.throws(() => x.authority.begin(permit), /refused|stale/);
    assert.throws(() => x.authority.begin(permit), /expired/);
    assert.throws(() => x.authority.issue(x.context), /refused|stale/);
  }
  for (const change of [
    (x) => {
      x.context.armedAt = 1001;
      x.state.armedAt = 1001;
    },
    (x) => {
      x.context.pressedAt = 1001;
    },
    (x) => {
      x.context.pressedAt = NaN;
    },
    (x) => {
      x.context.target.terminal = 'remote/t1';
    },
    (x) => {
      x.context.page = -1;
    },
    (x) => {
      x.context.peerKey = '';
    },
    (x) => {
      x.context.backendKey = '\nprivate';
    },
    (x) => {
      x.setNow(2000);
    },
  ]) {
    const x = fixture();
    change(x);
    assert.throws(() => x.authority.issue(x.context));
  }
});
test('captured target/record cannot be mutated into a different request and mismatched final evidence burns the lease', () => {
  const x = fixture(),
    permit = x.authority.issue(x.context);
  x.context.target.pane = 'p2';
  const lease = x.authority.begin(permit);
  assert.equal(lease.context.target.pane, 'p1');
  for (const tuple of [
    ['other', 'record', 1],
    ['peer', 'other', 1],
    ['peer', 'record', 2],
  ]) {
    const y = fixture(),
      other = y.authority.begin(y.authority.issue(y.context));
    assert.throws(() => other.consume(...tuple), /App changed/);
    assert.throws(() => other.consume('peer', 'record', 1), /expired/);
  }
  x.state.focusRequestEnabled = false;
  assert.throws(() => lease.check(), /refused/);
});
test('expiry and consent are rechecked after dispatch without granting a second write', () => {
  const x = fixture(),
    lease = x.authority.begin(x.authority.issue(x.context));
  lease.consume('peer', 'record', 1);
  x.setNow(2000);
  assert.throws(() => lease.postflight(), /expired/);
  const y = fixture(),
    other = y.authority.begin(y.authority.issue(y.context));
  other.consume('peer', 'record', 1);
  y.state.focusRequestEnabled = false;
  assert.throws(() => other.postflight(), /refused/);
});
