const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { z } = require('zod');
const { validate } = require('../../../src/schemas');
const { CalibrationChannel } = require('../app-calibration/channel.cjs');
const terminal = z.string().regex(/^t[1-9][0-9]*$/);
const id = z.string().min(1).max(1024);
const words = z.array(z.string().max(256)).max(256);
const focused = z
  .object({
    space: id,
    tab: id,
    pane: id.nullable(),
    terminal: terminal.nullable(),
    shown: id.nullable(),
    agent: id.nullable(),
  })
  .strict();
const snapshotSchema = z
  .object({
    protocol: z.literal(1),
    sequence: z.number().int().positive(),
    focusRevision: z.number().int().positive(),
    exports: words,
    focusedKeys: words,
    windowKeys: words,
    focused: focused.nullable(),
    panes: z
      .array(
        z
          .object({
            pane: id,
            tab: id,
            terminal: terminal.nullable(),
            focused: z.boolean(),
          })
          .strict(),
      )
      .max(1000),
    terminals: z
      .array(
        z
          .object({
            address: terminal,
            pid: z.number().int().positive().nullable(),
            created_ms: z.number().int().nonnegative(),
            keys: words,
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
const modRequest = { do: 'dsh-model-probe.snapshot', args: {} };

function prepareBindingMod(root, env) {
  const home = env.HERDR_APP_HOME;
  if (!home.startsWith(path.join(root, 'state') + path.sep))
    throw Error('Non-owned mod home');
  const mod = path.join(home, 'mods/dsh-model-probe');
  fs.mkdirSync(mod, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(home, 'data'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(home, 'layouts'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(mod, 'main.js'),
    fs.readFileSync(path.join(__dirname, 'binding-mod.js.txt')),
    { flag: 'wx', mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(mod, 'mod.json'),
    JSON.stringify({ place: 'none', focusable: false }),
    { flag: 'wx', mode: 0o600 },
  );
  fs.writeFileSync(path.join(home, 'data/deckshep-binding-probe.json'), '{}', {
    flag: 'wx',
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(home, 'layouts/dsh-model-probe.json'),
    JSON.stringify({
      id: 'root',
      type: 'column',
      children: [
        {
          id: 'probe',
          type: 'block',
          size: { px: 32 },
          content: { mod: 'dsh-model-probe' },
        },
        { id: 'terminals', type: 'block', content: { tab: 'active' } },
      ],
    }),
    { flag: 'wx', mode: 0o600 },
  );
  const shared = path.join(home, 'shared.json');
  fs.writeFileSync(
    shared,
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(shared)),
      layout: 'dsh-model-probe',
    }),
    { mode: 0o600 },
  );
}

class BindingProbeChannel extends CalibrationChannel {
  validateRequests(kind, payloads) {
    if (kind === 'app' && isDeepStrictEqual(payloads, [modRequest])) return;
    if (
      kind === 'core' &&
      payloads.length === 2 &&
      payloads[0]?.method === 'hello' &&
      payloads[1]?.method === 'terminal.get'
    ) {
      for (const request of payloads) validate('herdrCoreRequest', request);
      return;
    }
    super.validateRequests(kind, payloads);
  }
  async snapshot(previous = 0) {
    await this.exchange('app', [modRequest], ['herdrAppFocusReply']);
    const deadline = Date.now() + 3000;
    const file = path.join(
      this.gate.env.HERDR_APP_HOME,
      'data/deckshep-binding-probe.json',
    );
    while (Date.now() < deadline) {
      this.gate.checkBoth();
      const fd = fs.openSync(
        file,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      let result;
      try {
        const stat = fs.fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.uid !== process.getuid() ||
          stat.mode & 0o077 ||
          stat.size > 1000000
        )
          throw Error('Prototype response refused');
        result = snapshotSchema.safeParse(
          JSON.parse(fs.readFileSync(fd, 'utf8')),
        );
      } finally {
        fs.closeSync(fd);
      }
      if (result.success && result.data.sequence > previous) return result.data;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error('Prototype snapshot unavailable');
  }
  async coreTerminal(address) {
    terminal.parse(address);
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'hello',
        params: { generation: 1, framed: false },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'terminal.get',
        params: { terminal: address },
      },
    ];
    const replies = await this.exchange('core', requests, [
      'herdrCoreMessage',
      'herdrCoreMessage',
    ]);
    if (
      replies.some(
        (r, i) => r.id !== requests[i].id || !Object.hasOwn(r, 'result'),
      )
    )
      throw Error('Prototype Core reply refused');
    return {
      hello: validate('herdrCoreHello', replies[0].result),
      terminal: validate('herdrCoreTerminal', replies[1].result),
    };
  }
}
module.exports = { prepareBindingMod, BindingProbeChannel, snapshotSchema };
