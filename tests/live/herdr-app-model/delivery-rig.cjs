const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { z } = require('zod');
const { rollup } = require('rollup');
const ts = require('typescript');
const { GuardPipeline } = require('../../../src/guards/pipeline');
const { DeliveryKernel } = require('../../../src/app/delivery');
const { ModTerminalStream } = require('../../helpers/herdr-app-mod-stream');
const {
  BindingProbeChannel,
  prepareBindingMod,
} = require('./binding-probe.cjs');
const { hash, readArtifact } = require('../app-calibration/artifacts.cjs');

const targetSchema = z
  .object({
    space: z.string().min(1).max(1024),
    tab: z.string().min(1).max(1024),
    pane: z.string().min(1).max(1024),
    terminal: z.string().regex(/^t[1-9][0-9]*$/),
  })
  .strict();
const selectedSchema = z
  .object({
    focused: targetSchema,
    pid: z.number().int().positive(),
    created_ms: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
  })
  .strict();
const relaySchema = z
  .object({
    protocol: z.literal(1),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    step: z.number().int().positive().max(64),
    op: z.enum(['read', 'key', 'paste']),
    selected: selectedSchema,
    hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    value: z.enum(['enter', 'escape', 'up', 'down', 's', '/model']).nullable(),
  })
  .strict();
const resultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      protocol: z.literal(1),
      nonce: z.string(),
      kind: z.literal('confirmed'),
      label: z.string().max(160),
      state: z
        .object({ model: z.string().max(160), effort: z.string().max(40) })
        .strict()
        .optional(),
      steps: z.number().int(),
    })
    .strict(),
  z
    .object({
      protocol: z.literal(1),
      nonce: z.string(),
      kind: z.enum(['refused', 'uncertain']),
      reason: z.enum([
        'expired',
        'target changed',
        'view changed',
        'retired',
        'relay unavailable',
        'picker refused',
      ]),
      steps: z.number().int(),
    })
    .strict(),
]);

async function modelModSource() {
  const build = await rollup({
    input: path.resolve('src/agents/codex/keyboard-settings.ts'),
    plugins: [
      {
        name: 'prototype-types',
        transform(code, id) {
          if (id.endsWith('/src/agents/codex/keyboard-settings.ts'))
            code +=
              '\n' +
              fs.readFileSync(
                path.join(__dirname, 'inspect-model.js.txt'),
                'utf8',
              );
          return id.endsWith('.ts')
            ? ts.transpileModule(code, {
                compilerOptions: {
                  module: ts.ModuleKind.ESNext,
                  target: ts.ScriptTarget.ES2022,
                },
              }).outputText
            : null;
        },
      },
    ],
  });
  try {
    const { output } = await build.generate({
      format: 'iife',
      name: 'CodexSettings',
    });
    return fs
      .readFileSync(path.join(__dirname, 'delivery-mod.js.txt'), 'utf8')
      .replace(
        '// __CODEX_CYCLE__: injected from the unchanged Rex keyboard-settings module.',
        () => output[0].code,
      );
  } finally {
    await build.close();
  }
}
function prepareDeliveryMod(root, env, source, codexFile) {
  // CoreFoundation preferences must use the disposable home as well as POSIX
  // file APIs. Do not let config/read synchronize the owner's preferences.
  env.CFFIXED_USER_HOME = env.HOME;
  fs.mkdirSync(path.join(env.HOME, 'Library/Preferences'), {
    recursive: true,
    mode: 0o700,
  });
  // A real private project boundary prevents config discovery from walking
  // outside the contained run root. No owner repository is opened or changed.
  execFileSync('/usr/bin/git', ['init', '--quiet', root], {
    env,
    stdio: 'pipe',
    timeout: 10000,
  });
  prepareBindingMod(root, env);
  const home = env.HERDR_APP_HOME,
    data = path.join(home, 'data');
  const mod = path.join(home, 'mods/dsh-model-delivery');
  fs.mkdirSync(mod, { mode: 0o700 });
  fs.writeFileSync(path.join(mod, 'main.js'), source, {
    flag: 'wx',
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(mod, 'mod.json'),
    JSON.stringify({ place: 'none', focusable: false }),
    { flag: 'wx', mode: 0o600 },
  );
  const layoutFile = path.join(home, 'layouts/dsh-model-probe.json');
  const layout = JSON.parse(fs.readFileSync(layoutFile));
  layout.children.unshift({
    id: 'delivery',
    type: 'block',
    size: { px: 24 },
    content: { mod: 'dsh-model-delivery' },
  });
  fs.writeFileSync(layoutFile, JSON.stringify(layout), { mode: 0o600 });
  for (const file of ['model-request.json', 'model-result.json'])
    fs.writeFileSync(path.join(data, file), '{}', { flag: 'wx', mode: 0o600 });
  const relay = path.join(data, 'model-relay');
  execFileSync(
    '/usr/bin/clang',
    [
      '-O2',
      '-Wall',
      '-Werror',
      path.join(__dirname, 'mod-relay.c'),
      '-o',
      relay,
    ],
    { stdio: 'pipe', timeout: 20000 },
  );
  const codex = path.join(root, 'state/codex-cli');
  const cliBytes = readArtifact(codexFile, 512 * 1024 * 1024);
  fs.writeFileSync(codex, cliBytes, { flag: 'wx', mode: 0o700 });
  const cliVersion = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+)$/.exec(
    execFileSync(codex, ['--version'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    }).trim(),
  )?.[1];
  if (!cliVersion) throw Error('Prototype CLI version unavailable');
  env.DSH_TEST_CODEX = codex;
  // No authentication, provider calls, owner settings, hooks or shared daemon.
  const config =
    [
      'model = "gpt-6-luna"',
      'model_reasoning_effort = "high"',
      'model_provider = "mod_test"',
      'check_for_update_on_startup = false',
      '[analytics]',
      'enabled = false',
      '[feedback]',
      'enabled = false',
      '[model_providers.mod_test]',
      'name = "Offline mod test"',
      'base_url = "http://127.0.0.1:1/v1"',
      'requires_openai_auth = false',
      'wire_api = "responses"',
      '[projects.' + JSON.stringify(root) + ']',
      'trust_level = "trusted"',
    ].join('\n') + '\n';
  fs.writeFileSync(path.join(env.CODEX_HOME, 'config.toml'), config, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    relay,
    codex,
    configHash: hash(Buffer.from(config)),
    modHash: hash(Buffer.from(source)),
    cliHash: hash(cliBytes),
    cliVersion,
    relayHash: hash(readArtifact(relay)),
  };
}

class ModDeliveryChannel extends BindingProbeChannel {
  validateRequests(kind, payloads) {
    if (
      kind === 'app' &&
      isDeepStrictEqual(payloads, [
        { do: 'dsh-model-delivery.model', args: {} },
      ])
    )
      return;
    if (
      kind === 'app' &&
      isDeepStrictEqual(payloads, [
        { do: 'dsh-model-delivery.inspect', args: {} },
      ])
    )
      return;
    if (
      kind === 'app' &&
      ['A', 'B'].some((name) =>
        isDeepStrictEqual(payloads, [this.request(name)]),
      )
    )
      return;
    super.validateRequests(kind, payloads);
  }
  request(name) {
    return {
      do: 'space.new',
      args: {
        folder: this.gate.root,
        machine: '',
        name: 'Offline Codex ' + name,
        argv: [this.gate.env.DSH_TEST_CODEX],
      },
    };
  }
  async create(name) {
    const value = (
      await this.exchange('app', [this.request(name)], ['spaceCreated'])
    )[0];
    this.gate.captureDescendants();
    return value;
  }
  async command(operation = 'model') {
    if (!['model', 'inspect'].includes(operation))
      throw Error('Prototype operation refused');
    return this.exchange(
      'app',
      [{ do: 'dsh-model-delivery.' + operation, args: {} }],
      ['herdrAppFocusReply'],
    );
  }
}

/** Contained experiment only. It grants its own fixture backend no production
 * capabilities. The real DeliveryKernel is still the last client write edge.
 */
class ModDeliveryRig {
  constructor(run) {
    this.run = run;
    this.channel = new ModDeliveryChannel(run.gate);
    this.streams = new Map();
    this.operations = new Map();
    this.sockets = new Set();
    this.effects = [];
    this.hold = null;
  }
  async start() {
    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
      socket.on('error', () => {});
      socket.setTimeout(4000, () => socket.destroy());
      let buffer = '',
        used = false;
      socket.on('data', async (bytes) => {
        if (used || buffer.length + bytes.length > 131072)
          return socket.destroy();
        buffer += bytes.toString('utf8');
        if (!buffer.includes('\n')) return;
        used = true;
        let response, message;
        try {
          if (buffer.indexOf('\n') !== buffer.length - 1) throw Error();
          message = relaySchema.parse(JSON.parse(buffer));
          response = {
            ok: true,
            view: await this.handle(message),
            writes: this.operations.get(message.nonce)?.writes ?? 0,
          };
        } catch (error) {
          const reason = [
            'expired',
            'target changed',
            'view changed',
            'retired',
          ].includes(error.message)
            ? error.message
            : 'relay unavailable';
          response = {
            ok: false,
            reason,
            writes: this.operations.get(message?.nonce)?.writes ?? 0,
          };
        }
        socket.end(JSON.stringify(response) + '\n');
      });
    });
    const file = path.join(
      this.run.env.HERDR_APP_HOME,
      'data/model-relay.sock',
    );
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(file, resolve);
    });
    fs.chmodSync(file, 0o600);
  }
  async attach(address) {
    const { terminal, hello } = await this.channel.coreTerminal(address);
    const pid = terminal.foreground?.pid ?? terminal.pid;
    this.run.owned.assert(pid);
    const stream = new ModTerminalStream(terminal.cols, terminal.rows);
    this.streams.set(address, {
      stream,
      pid,
      created_ms: terminal.created_ms,
      lifetime: this.run.owned.inspect(pid),
    });
    await stream.connect(
      this.run.env.HC_SOCKET,
      address,
      hello.core.id,
      async (socket) => {
        await this.run.gate.peer('core', socket, this.run.signal);
      },
    );
    return stream;
  }
  async capture() {
    const snapshot = await this.channel.snapshot(this.sequence ?? 0);
    this.sequence = snapshot.sequence;
    const focused = targetSchema.parse({
      space: snapshot.focused?.space,
      tab: snapshot.focused?.tab,
      pane: snapshot.focused?.pane,
      terminal: snapshot.focused?.terminal,
    });
    const terminal = snapshot.terminals.find(
      (t) => t.address === focused.terminal,
    );
    return {
      focused,
      pid: terminal.pid,
      created_ms: terminal.created_ms,
      observedFocusRevision: snapshot.focusRevision,
    };
  }
  begin(captured, pressedAt = Date.now()) {
    const nonce = randomBytes(16).toString('hex');
    const request = { protocol: 1, nonce, pressedAt, ...captured };
    this.operations.set(nonce, {
      request,
      next: 1,
      revision: null,
      retired: false,
      writes: 0,
    });
    fs.writeFileSync(
      path.join(this.run.env.HERDR_APP_HOME, 'data/model-request.json'),
      JSON.stringify(request),
      { mode: 0o600 },
    );
    return nonce;
  }
  retire(nonce) {
    const operation = this.operations.get(nonce);
    if (operation) operation.retired = true;
  }
  async result(nonce) {
    const file = path.join(
      this.run.env.HERDR_APP_HOME,
      'data/model-result.json',
    );
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      this.run.gate.checkBoth();
      const parsed = resultSchema.safeParse(
        JSON.parse(readArtifact(file, 8192)),
      );
      if (parsed.success && parsed.data.nonce === nonce)
        return { ...parsed.data, writes: this.operations.get(nonce).writes };
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error('Model mod result unavailable');
  }
  async handle(message) {
    const operation = this.operations.get(message.nonce);
    if (!operation || message.step !== operation.next++) throw Error('retired');
    const { request } = operation;
    const entry = this.streams.get(request.focused.terminal);
    if (!entry) throw Error('target changed');
    const check = () => {
      if (operation.retired) throw Error('retired');
      if (
        Date.now() < request.pressedAt ||
        Date.now() >= request.pressedAt + 2000
      )
        throw Error('expired');
      if (
        !isDeepStrictEqual(message.selected.focused, request.focused) ||
        message.selected.pid !== request.pid ||
        message.selected.created_ms !== request.created_ms ||
        entry.pid !== request.pid ||
        entry.created_ms !== request.created_ms
      )
        throw Error('target changed');
      if (operation.revision === null)
        operation.revision = message.selected.revision;
      if (operation.revision !== message.selected.revision)
        throw Error('target changed');
      this.run.gate.checkBoth();
      this.run.owned.assert(entry.pid);
      if (!isDeepStrictEqual(this.run.owned.inspect(entry.pid), entry.lifetime))
        throw Error('target changed');
      entry.stream.assertOpen();
    };
    check();
    if (message.op === 'read') {
      if (message.hash !== null || message.value !== null) throw Error();
      return entry.stream.read();
    }
    const input =
      message.op === 'paste' && message.value === '/model'
        ? Buffer.from('\x1b[200~/model\x1b[201~')
        : message.op === 'key'
          ? {
              enter: Buffer.from('\r'),
              escape: Buffer.from('\x1b'),
              down: Buffer.from('\x1b[B'),
              up: Buffer.from('\x1b[A'),
              s: Buffer.from('s'),
            }[message.value]
          : null;
    if (!input || !message.hash) throw Error();
    if (this.hold) await this.hold(message, operation);
    // This second mod is responsive while the delivery mod awaits exec. It
    // catches selection changes during a held relay without trusting an old
    // message. Its render counter is observed continuity, not an App guarantee.
    const fresh = await this.capture();
    if (
      !isDeepStrictEqual(fresh.focused, request.focused) ||
      fresh.pid !== request.pid ||
      fresh.created_ms !== request.created_ms ||
      fresh.observedFocusRevision !== request.observedFocusRevision
    )
      throw Error('target changed');
    check();
    if (entry.stream.current().hash !== message.hash)
      throw Error('view changed');
    const current = {
      scope: 'herdr-app',
      appearance: 1,
      visibility: 1,
      generation: 1,
      backendKey: 'test-only:mod-model',
      page: 0,
      stamp: message.nonce,
      visible: true,
    };
    const target = {
      session: 'test-only-core',
      block: request.focused.terminal,
      pid: entry.pid,
      name: 'codex',
      app: 'codex',
      state: 'idle',
    };
    const context = {
      ...current,
      action: 'model',
      controlId: 'model',
      verificationKey: current.backendKey,
      target,
      armedAt: request.pressedAt - 350,
      pressedAt: request.pressedAt,
      setupBusy: false,
      verifyChat: true,
    };
    const session = {
      generation: 1,
      config: {
        backend: 'herdr-app',
        herdrApp: { inputEnabled: true, readbackEnabled: true },
      },
      agents: [target],
    };
    const guards = new GuardPipeline(() => current);
    const capabilities = new Set([
      'readPane',
      'composerCursor',
      'sendKeys',
      'paneIdentity',
      'verifiedFocus',
    ]);
    const kernel = new DeliveryKernel(
      session,
      guards,
      () => context,
      (driver, authority) => ({
        id: 'herdr-app',
        generation: 1,
        capabilities,
        verifiedControls: new Set(['model']),
        verificationKey: current.backendKey,
        deliver: async (target, input, permit) => {
          authority.consume(permit, target, 1, input);
          return driver.execute(target, input);
        },
      }),
    );
    await kernel.run(
      ['send-key', '-s', target.session, '-b', target.block, message.value],
      undefined,
      async (beforeIO) => {
        beforeIO();
        check();
        if (entry.stream.current().hash !== message.hash)
          throw Error('view changed');
        entry.stream.write(input);
        operation.writes++;
        this.effects.push({
          nonce: message.nonce,
          step: message.step,
          op: message.op,
          terminal: request.focused.terminal,
          elapsedMs: Date.now() - request.pressedAt,
        });
      },
      target,
    );
    return entry.stream.read();
  }
  async close() {
    for (const operation of this.operations.values()) operation.retired = true;
    for (const { stream } of this.streams.values()) stream.close();
    for (const socket of this.sockets) socket.destroy();
    if (this.server) await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = {
  modelModSource,
  prepareDeliveryMod,
  ModDeliveryRig,
  relaySchema,
  resultSchema,
};
