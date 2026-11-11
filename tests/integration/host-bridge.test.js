'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Bridge } = require('../../src/app/session');
const { createApplication } = require('../../src/app/controller');

class FixtureBridge extends Bridge {
  constructor(config) {
    super(config, async () => {});
  }
  async discover() {
    this.agents = ['a', 'b'].map((block, i) => ({
      session: 's',
      window: 'w',
      block,
      pid: 42 + i,
      name: 'codex',
      app: 'codex',
      cwd: '/p',
      state: 'idle',
      statusAt: 'v1',
      project: 'p',
    }));
    this.slots = this.agents.map((a) => ({
      session: a.session,
      block: a.block,
    }));
    return this.agents;
  }
}
const quiet = {
  setInterval: () => {},
  backendFactory: (c) => new FixtureBridge(c),
  metadataFactory: () => ({
    hydrate() {},
    async refresh(agents) {
      return agents;
    },
  }),
};

class TextSocket extends EventEmitter {
  readyState = 1;
  frames = [];
  send(raw) {
    this.frames.push(JSON.parse(raw));
  }
}
class TypedSocket extends EventEmitter {
  readyState = 1;
  frames = [];
  texts = [];
  deliver(frame) {
    this.frames.push(frame);
  }
  send(raw) {
    this.texts.push(raw);
  }
}
const appear = (app, count = 6) => {
  for (let i = 0; i < count; i++)
    app.receive({
      event: 'willAppear',
      context: 'k' + i,
      payload: {
        settings: { profileScope: 'rex' },
        coordinates: { row: Math.floor(i / 5), column: i % 5 },
      },
    });
};
const plain = (frames) => JSON.parse(JSON.stringify(frames));

test('the typed deliver path emits the same frames as the string path', async () => {
  const text = new TextSocket(),
    typed = new TypedSocket();
  const a = createApplication({ ...quiet, socket: text });
  const b = createApplication({ ...quiet, socket: typed });
  appear(a);
  appear(b);
  await a.settled();
  await b.settled();
  assert(text.frames.length > 0);
  assert.deepEqual(plain(typed.frames), text.frames);
  assert.deepEqual(typed.texts, [], 'no stringified frames on the typed path');
  assert(typed.frames.some((f) => f.event === 'setImage'));
  assert(typed.frames.every((f) => typeof f.payload === 'object'));
});

test('a closed host socket receives no frames on either path', async () => {
  const typed = new TypedSocket();
  typed.readyState = 0;
  const app = createApplication({ ...quiet, socket: typed });
  appear(app);
  await app.settled();
  assert.equal(typed.frames.length, 0);
});

test('receive hands the event object to the handler without a JSON round trip', async () => {
  const socket = new TypedSocket();
  const emitted = [];
  const emit = socket.emit.bind(socket);
  socket.emit = (name, ...args) => (emitted.push(name), emit(name, ...args));
  const app = createApplication({ ...quiet, socket });
  // A BigInt cannot survive JSON.stringify: this reaches the handler only
  // when the object is passed through directly.
  app.receive({
    event: 'willAppear',
    context: 'k0',
    payload: {
      settings: { profileScope: 'rex', marker: 1n },
      coordinates: { row: 0, column: 0 },
    },
  });
  await app.settled();
  assert(!emitted.includes('message'));
  assert.equal(app.getController('rex').keys.size, 1);
});

test('the message listener still accepts raw text and applies the same validation', async () => {
  const socket = new TypedSocket();
  const app = createApplication({ ...quiet, socket });
  socket.emit(
    'message',
    JSON.stringify({
      event: 'willAppear',
      context: 'k0',
      payload: {
        settings: { profileScope: 'rex' },
        coordinates: { row: 0, column: 0 },
      },
    }),
  );
  socket.emit('message', '{not json');
  socket.emit('message', JSON.stringify({ event: 7 }));
  app.receive({ event: 7 });
  app.receive(null);
  await app.settled();
  assert.equal(app.getController('rex').keys.size, 1);
});
