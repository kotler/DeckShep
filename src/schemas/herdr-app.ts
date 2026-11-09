import { z } from 'zod';

// These are wire facts, not provider identities or verified input capabilities.
const text = z
  .string()
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]*$/);
const id = text.min(1).max(1024);
const word = id.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const version = id.regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
const integer = z.number().int().nonnegative().safe();
const strings = z.array(id).max(1000);
const uniqueWords = z
  .array(word)
  .max(1000)
  .refine((values) => new Set(values).size === values.length);
const localTerminal = id.regex(/^t[1-9][0-9]*$/);
const address = id.regex(/^(?:[A-Za-z0-9._-]+\/)*t[1-9][0-9]*$/);
const coreInfo = z.object({ id, name: id }).passthrough();
// OSC 7501 words are the program's own; kind stays free text so a new upstream
// word degrades to a neutral label instead of rejecting the whole listing.
const status = z
  .object({
    state: id,
    app: text.optional(),
    title: text.optional(),
    msg: text.optional(),
    kind: text.nullable().optional(),
    progress: integer.max(100).nullable().optional(),
  })
  .passthrough();
const foreground = z
  .object({
    pid: z.number().int().positive().safe(),
    name: id,
    argv: strings,
    cwd: id,
  })
  .passthrough();

const herdrAppWorld = z
  .object({
    spaces: z
      .array(
        z
          .object({
            id,
            name: text,
            folder: text,
            machine: id.nullable(),
            active: z.boolean(),
            tabs: z
              .array(
                z
                  .object({
                    id,
                    name: text,
                    active: z.boolean(),
                    settled: z.boolean(),
                    terminals: z
                      .array(
                        z
                          .object({
                            terminal: address,
                            pane: id,
                            status: text.nullable(),
                            app: text.nullable(),
                            name: text.nullable(),
                            sub_agents: z.array(address).max(1000),
                          })
                          .passthrough(),
                      )
                      .max(1000),
                  })
                  .passthrough(),
              )
              .max(1000),
          })
          .passthrough(),
      )
      .max(1000),
    recent: z
      .array(z.object({ name: text, folder: text }).passthrough())
      .max(1000),
  })
  .passthrough();
const herdrAppStatus = z
  .object({
    zoom: z.number().positive().finite(),
    font_size: z.number().positive().finite(),
    ui_font_size: z.number().positive().finite(),
    space: id.nullable(),
    tab: id.nullable(),
    focused_pane: id.nullable(),
    layout: id,
    agent: address.nullable(),
    floats: z.record(id, z.record(z.string(), z.unknown())),
    overlays: z.array(text.nullable()).max(1000),
    errors: z.array(z.string().max(16000)).max(1000),
  })
  .passthrough();
const herdrAppCommands = z
  .array(
    z
      .object({
        name: word,
        about: text,
        args: z
          .array(
            z
              .object({
                name: word,
                required: z.boolean(),
              })
              .passthrough(),
          )
          .max(100),
      })
      .passthrough(),
  )
  .max(1000);
const herdrAppRequest = z.union([
  z.object({ ls: z.literal(true) }).strict(),
  z.object({ status: z.literal(true) }).strict(),
  z.object({ commands: z.literal(true) }).strict(),
]);
const herdrAppMessage = z.union([
  herdrAppWorld,
  herdrAppStatus,
  herdrAppCommands,
  z.object({ error: z.string().max(16000) }).strict(),
]);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const cdHash = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const herdrAppPeer = z
  .object({
    protocol: z.literal(1),
    pid: integer.positive(),
    uid: integer,
    pidVersion: integer.positive(),
    startSeconds: z.string().regex(/^[1-9][0-9]{0,19}$/),
    startMicros: integer.max(999999),
    executable: id.refine((value) => value.startsWith('/')),
    cdHash,
  })
  .strict();
const herdrAppFocusRecord = z
  .object({
    key: word,
    contract: z.literal(1),
    bundleId: z.literal('dev.herdr.app'),
    executable: z.literal('Herdr'),
    version,
    build: id,
    executableSha256: digest,
    plistSha256: digest,
    cdHash,
  })
  .strict();
const herdrAppFocusInput = z
  .object({ kind: z.literal('requestFocus') })
  .strict();
const herdrAppFocusReply = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ error: z.string().max(16000) }).strict(),
]);

const herdrCoreHello = z
  .object({
    generation: z.literal(1),
    version,
    core: coreInfo,
    framed: z.literal(false),
    methods: uniqueWords,
    features: uniqueWords,
  })
  .passthrough();
const herdrCoreTerminal = z
  .object({
    address,
    labels: z.record(id, text),
    argv: strings,
    cwd: text,
    state: z.enum(['live', 'finished']),
    created_ms: integer,
    screen: z.enum(['exact', 'inexact']),
    cols: integer.max(65535),
    rows: integer.max(65535),
    pid: z.number().int().nonnegative().safe().nullable().optional(),
    foreground: foreground.nullable().optional(),
    status: status.nullable().optional(),
    records: z.record(id, status).optional(),
    status_ms: integer.nullable().optional(),
    turn: integer.optional(),
    title: text.optional(),
    name: text.nullable().optional(),
    parent: address.nullable().optional(),
    reported: z.boolean().optional(),
  })
  .passthrough();
const herdrCoreList = z
  .object({
    terminals: z.array(herdrCoreTerminal).max(1000),
    hidden_finished: integer,
    machines: z.array(z.record(z.string(), z.unknown())).max(1000).optional(),
  })
  .passthrough();
const herdrCoreStatus = z
  .object({
    core: coreInfo,
    version,
    pid: z.number().int().positive().safe(),
    uptime_ms: integer,
    holder: z.record(z.string(), z.unknown()).nullable(),
    holders: z.array(z.record(z.string(), z.unknown())).max(1000),
    live: integer,
  })
  .passthrough();
const herdrCoreRead = z
  .object({
    text: z.string().max(1000000),
    complete: z.boolean(),
    how: z.enum(['screen', 'history', 'stitched']),
    why: text.nullable().optional(),
  })
  .passthrough();
const empty = z.object({}).strict();
function call<const M extends string, P extends z.ZodType>(
  method: M,
  params: P,
) {
  return z
    .object({
      jsonrpc: z.literal('2.0'),
      id: integer.positive(),
      method: z.literal(method),
      params,
    })
    .strict();
}
const herdrCoreRequest = z.union([
  call(
    'hello',
    z.object({ generation: z.literal(1), framed: z.literal(false) }).strict(),
  ),
  call('server.status', empty),
  call('terminal.list', z.object({ all: z.literal(false) }).strict()),
  call('terminal.get', z.object({ terminal: localTerminal }).strict()),
  // Positive history reads may inject scroll keys into a full-screen app.
  call(
    'terminal.read',
    z.object({ terminal: localTerminal, lines: z.literal(0) }).strict(),
  ),
]);
const envelope = { jsonrpc: z.literal('2.0'), id: integer.positive() };
const herdrCoreMessage = z.union([
  z
    .object({ ...envelope, result: z.unknown() })
    .strict()
    .refine((value) => Object.hasOwn(value, 'result')),
  z
    .object({
      ...envelope,
      error: z
        .object({
          code: z.number().int(),
          message: z.string().max(16000),
          data: z.unknown().optional(),
        })
        .passthrough(),
    })
    .strict(),
]);

export const herdrAppSchemas = {
  herdrAppRequest,
  herdrAppMessage,
  herdrAppWorld,
  herdrAppStatus,
  herdrAppCommands,
  herdrAppPeer,
  herdrAppFocusRecord,
  herdrAppFocusInput,
  herdrAppFocusReply,
  herdrCoreRequest,
  herdrCoreMessage,
  herdrCoreHello,
  herdrCoreList,
  herdrCoreTerminal,
  herdrCoreStatus,
  herdrCoreRead,
};
