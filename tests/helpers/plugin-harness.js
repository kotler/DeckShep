'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { EventEmitter } = require('node:events');
const { Bridge } = require('../../src/app/session'),
  C = require('../../src/guards/context');
function harness() {
  const directory = path.join(__dirname, '../../com.local.rexagents.sdPlugin');
  let clock = 10000,
    socket;
  const native = { rex: 'a', herdr: 'a' };
  const calls = [];
  let live = ['a', 'b'].map((block, i) => ({
    session: 's',
    window: 'w' + block,
    block,
    pid: 42 + i,
    name: 'codex',
    app: 'codex',
    cwd: '/project',
    state: 'idle',
    statusAt: 'v1',
    chatId: 'chat-' + block,
    chatName: 'Chat ' + block,
    project: 'project',
    model: 'gpt-6-luna',
  }));
  class Socket extends EventEmitter {
    constructor() {
      super();
      socket = this;
      this.readyState = 1;
      this.frames = [];
    }
    send(raw) {
      this.frames.push(JSON.parse(raw));
    }
  }
  class FixtureBridge extends Bridge {
    constructor(config) {
      super(config, async (args, input) => {
        calls.push({ args, input });
      });
      this.readComposer = async () => ({
        chatId: 'chat-a',
        hash: 'draft',
        cursor: { row: 2, column: 9 },
      });
      this.readRequest = async () => 'request-hash';
      this.verifyRunning = async () => ({});
    }
    normalize(a) {
      return this.config.backend === 'herdr'
        ? {
            ...a,
            session: 'herdr:fixture',
            terminalId: 'terminal-' + a.block,
            backend: 'herdr',
            composerSupported: false,
          }
        : a;
    }
    async discover() {
      this.agents = live.map((a) => ({ ...this.normalize(a) }));
      for (const a of this.agents)
        if (
          !this.slots.some(
            (s) => s.session === a.session && s.block === a.block,
          )
        )
          this.slots.push({ session: a.session, block: a.block });
      return this.agents;
    }
    async focused() {
      const found = live.find(
        (a) => a.block === native[this.config.backend || 'rex'],
      );
      const a = found && this.normalize(found);
      if (!a) throw Error('No native agent');
      if (this.actionContext) {
        C.assertContext(this.actionContext, a);
        if (
          this.actionContext.verifyChat &&
          a.chatId !== this.actionContext.target.chatId
        )
          throw Error('Selected chat changed');
      }
      this.lastTarget = {
        session: a.session,
        block: a.block,
        pid: a.pid,
        app: a.app,
        name: a.name,
        ...(a.nativeIdentity ? { nativeIdentity: a.nativeIdentity } : {}),
        ...(a.terminalId ? { terminalId: a.terminalId } : {}),
      };
      return { ...a };
    }
    async focus(t) {
      const found = live.find((a) => a.block === t.block);
      const a = found && this.normalize(found);
      if (!a || a.pid !== t.pid) throw Error('Agent process changed');
      native[this.config.backend || 'rex'] = a.block;
      this.lastTarget = {
        session: a.session,
        block: a.block,
        pid: a.pid,
        app: a.app,
        name: a.name,
        ...(a.nativeIdentity ? { nativeIdentity: a.nativeIdentity } : {}),
        ...(a.terminalId ? { terminalId: a.terminalId } : {}),
      };
      this.draft = null;
      this.picker = null;
    }
    async method(a, method) {
      if (method === 'modes') return { modes: [{ number: 2004, set: true }] };
      throw Error('Unexpected method');
    }
    async cycleControl(kind) {
      await this.focused();
      calls.push({ cycle: kind });
      return { label: 'changed' };
    }
  }
  class TestDate extends Date {
    static now() {
      return clock;
    }
  }
  const context = {
    Buffer,
    Date: TestDate,
    process: { argv: ['node', 'plugin', '-port', '0'] },
    __dirname: directory,
    setInterval: () => {},
    require: (name) =>
      name === 'ws'
        ? Socket
        : name === './session'
          ? { Bridge: FixtureBridge }
          : name === './herdr-session'
            ? { HerdrBridge: FixtureBridge }
            : name === '../agents/codex/metadata'
              ? {
                  AgentMetadata: class {
                    hydrate() {}
                    async refresh(a) {
                      return a;
                    }
                  },
                }
              : name.startsWith('.')
                ? require(path.resolve(path.resolve(__dirname, '../../src/app'), name))
                : require(name),
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '../../src/app/controller.js'), 'utf8') +
      '\nglobalThis.api=getController("rex");globalThis.controllers=controllers;globalThis.profileController=getController;',
    context,
    { filename: path.resolve(__dirname, '../../src/app/controller.js') },
  );
  const api = context.api;
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 5; column++)
      api.keys.set(`${row},${column}`, {
        settings: {},
        coordinates: { column, row },
      });
  const h = {
    api,
    calls,
    socket,
    get live() {
      return live;
    },
    setLive: (a) => (live = a),
    change: (block, patch) =>
      Object.assign(
        live.find((a) => a.block === block),
        patch,
      ),
    controller: (scope) => context.profileController(scope),
    native: (block, scope = 'rex') => (native[scope] = block),
    async appear(scope) {
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 5; column++)
          socket.emit(
            'message',
            JSON.stringify({
              event: 'willAppear',
              context: scope + ':' + row + ',' + column,
              payload: {
                settings: { profileScope: scope },
                coordinates: { row, column },
              },
            }),
          );
      await api.settled();
    },
    hide(scope) {
      for (const key of context.profileController(scope).keys.keys())
        socket.emit(
          'message',
          JSON.stringify({ event: 'willDisappear', context: key }),
        );
    },
    async profilePress(scope, row, col) {
      socket.emit(
        'message',
        JSON.stringify({
          event: 'keyDown',
          context: scope + ':' + row + ',' + col,
        }),
      );
      await api.settled();
    },
    tick: (ms = 500) => (clock += ms),
    action: (row, col) => api.mapping(api.keys.get(`${row},${col}`)),
    image: (row, col) =>
      Buffer.from(
        api.keys.get(`${row},${col}`).lastImage.split(',')[1],
        'base64',
      ).toString(),
    async ready() {
      await api.refresh();
      api.bridge.lastTarget = { session: 's', block: 'a', pid: 42 };
      api.render();
      clock += 500;
    },
    async press(row, col, display) {
      await api.press(`${row},${col}`, display);
    },
  };
  return h;
}
module.exports = { harness };
