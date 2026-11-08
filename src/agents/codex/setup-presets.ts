type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const { pluginDirectory } = require('../../platform/paths.ts');
const path = require('node:path'),
  fs = require('node:fs');
const { token } = require('../../domain/identity');
const P = require('./presets');
const pause: (ms: number) => Promise<any> = (ms: number) =>
  new Promise((r: (value: any) => void) => setTimeout(r, ms));
class Setup {
  declare b: Record<string, any>;
  constructor(bridge: Record<string, any>) {
    this.b = bridge;
  }
  async screen(a: any) {
    const size: any = await this.b.method(a, 'size');
    const result: any = await this.b.run([
      'block',
      'call',
      '-s',
      a.session,
      '-b',
      a.block,
      'format',
      JSON.stringify({
        format: 'text',
        trim: false,
        unwrap: false,
        max_bytes: 960000,
      }),
    ]);
    if (
      result.id ||
      typeof result.content !== 'string' ||
      !Number.isInteger(size.rows)
    )
      throw Error('Cannot safely read configuration viewport');
    const lines: any = result.content.replace(/\r/g, '').split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.slice(-size.rows).join('\n');
  }
  async wait(a: any, test: any, message: string) {
    for (let i: number = 0; i < 35; i++) {
      const s: any = await this.screen(a);
      if (test(s)) return;
      await pause(80);
    }
    throw Error(message);
  }
  async key(a: any, ...keys: any[]) {
    await this.b.checked(a, true);
    await this.b.run(['send-key', '-s', a.session, '-b', a.block, ...keys]);
  }
  async menu(a: any) {
    await this.key(a, 'ctrl+x', 'p');
    await this.wait(
      a,
      (s: any) => /^\s*Presets\s*$/m.test(s),
      'Presets dialog not open',
    );
  }
  async currentModel(a: any) {
    await this.menu(a);
    await this.key(a, 's');
    await this.wait(
      a,
      (s: any) => s.includes('Start preset from current settings'),
      'Settings preset dialog missing',
    );
    await this.key(a, 'enter');
    await this.wait(
      a,
      (s: any) => /^\s*New preset\s*$/m.test(s),
      'New preset dialog missing',
    );
    const view: any = await this.screen(a),
      field: any = view.split(/^\s*New preset\s*$/m).at(-1);
    const matches: any[] = [
      ...field.matchAll(
        /^\s*› (\/model [a-zA-Z0-9][a-zA-Z0-9._:/-]*(?: --reasoning=[a-zA-Z0-9_-]+)?(?: --speed=[a-zA-Z0-9_-]+)?)\s*$/gm,
      ),
    ];
    for (let i: number = 0; i < 4; i++) {
      const s: any = await this.screen(a);
      if (
        !/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(
          s,
        )
      )
        break;
      await this.key(a, 'escape');
    }
    await this.wait(
      a,
      (s: any) =>
        !/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(
          s,
        ),
      'Settings dialog did not close',
    );
    if (matches.length !== 1)
      throw Error('Native model settings field unavailable');
    return matches[0][1];
  }
  async currentStatusLine(a: any) {
    await this.menu(a);
    await this.key(a, 's');
    await this.wait(
      a,
      (s: any) => s.includes('Start preset from current settings'),
      'Settings preset dialog missing',
    );
    await this.key(a, 'down', 'down', 'down', 'enter');
    await this.wait(
      a,
      (s: any) => /^\s*New preset\s*$/m.test(s),
      'New preset dialog missing',
    );
    const field: any = (await this.screen(a))
      .split(/^\s*New preset\s*$/m)
      .at(-1);
    const matches: any[] = [
      ...field.matchAll(/^\s*› (\/statusline(?: [a-z0-9-]+)+)\s*$/gm),
    ];
    for (let i: number = 0; i < 4; i++) {
      const s: any = await this.screen(a);
      if (
        !/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(
          s,
        )
      )
        break;
      await this.key(a, 'escape');
    }
    if (matches.length !== 1)
      throw Error('Native status-line settings unavailable');
    return matches[0][1];
  }
  async currentPermissions(a: any) {
    await this.menu(a);
    await this.key(a, 's');
    await this.wait(
      a,
      (s: any) => s.includes('Start preset from current settings'),
      'Settings preset dialog missing',
    );
    await this.key(a, 'down', 'enter');
    await this.wait(
      a,
      (s: any) => /^\s*New preset\s*$/m.test(s),
      'New preset dialog missing',
    );
    const field: any = (await this.screen(a))
      .split(/^\s*New preset\s*$/m)
      .at(-1);
    const matches: any[] = [
      ...field.matchAll(/^\s*› (\/permissions [^\r\n]+)\s*$/gm),
    ];
    for (let i: number = 0; i < 4; i++) {
      const s: any = await this.screen(a);
      if (
        !/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(
          s,
        )
      )
        break;
      await this.key(a, 'escape');
    }
    if (matches.length !== 1)
      throw Error('Native permissions settings unavailable');
    return matches[0][1].trim();
  }
  async store(a: any, slot: string, input: any, snapshot: any = false) {
    await this.menu(a);
    await this.key(a, 's');
    await this.wait(
      a,
      (s: any) => s.includes('Start preset from current settings'),
      'Settings preset dialog missing',
    );
    if (snapshot === true || snapshot === 'permissions')
      await this.key(a, 'down', 'enter');
    else await this.key(a, 'enter');
    await this.wait(
      a,
      (s: any) => /^\s*New preset\s*$/m.test(s),
      'New preset dialog missing',
    );
    if (!snapshot) {
      await this.key(a, 'end', 'ctrl+u');
      await this.b.checked(a, true);
      await this.b.run(
        ['send', '-s', a.session, '-b', a.block],
        '\x1b[200~' + input + '\x1b[201~',
      );
      await this.wait(
        a,
        (s: any) =>
          s
            .split(/^\s*New preset\s*$/m)
            .at(-1)
            .split('\n')
            .some((line: any) => line.trim() === '› ' + input),
        'Preset field did not match requested command',
      );
    }
    await this.key(a, 'enter');
    await this.wait(
      a,
      (s: any) => s.includes('Save preset to slot'),
      'Slot picker missing',
    );
    const before: number = fs.statSync(P.codexFile()).mtimeMs;
    await this.key(a, slot);
    await this.wait(
      a,
      (s: any) =>
        s.includes('Replace preset ' + slot + '?') ||
        (!s.includes('Save preset to slot') && !/^\s*New preset\s*$/m.test(s)),
      'Slot selection incomplete',
    );
    const s: any = await this.screen(a);
    if (s.includes('Replace preset ' + slot + '?')) await this.key(a, 'enter');
    for (let i: number = 0; i < 35; i++) {
      const v: any = P.readPresets()[slot]?.input;
      if (
        v &&
        (snapshot
          ? snapshot === 'model'
            ? /^\/model [a-zA-Z0-9][a-zA-Z0-9._:/-]*.* --speed=\S+$/.test(v)
            : v.startsWith('/permissions ')
          : v === input) &&
        fs.statSync(P.codexFile()).mtimeMs !== before
      )
        return v;
      await pause(80);
    }
    throw Error('Preset save not confirmed');
  }
  async configure(a: any, config: Record<string, any>, file: string) {
    await this.b.focus(a);
    await this.b.checked(a, true);
    const registry: any = P.readRegistry(file);
    const key: string = token(a);
    if (registry.agents[key]?.signature === P.signature(config)) {
      P.validateOnDisk(registry.agents[key].entries);
      return;
    }
    const known: any[] = [
      ...Object.values(registry.agents).flatMap((x: any) => x.entries || []),
      ...(registry.scratch ? [registry.scratch] : []),
    ];
    for (const [slot, v] of Object.entries<any>(P.readPresets()))
      if (
        v.input &&
        !known.some((e: any) => e.slot === slot && e.input === v.input)
      )
        throw Error('Existing user preset slots need manual allocation');
    const baseline: any = await this.store(a, '9', null, true);
    const entries: any[] = P.choices(config, baseline);
    for (const e of entries)
      if (e.slot !== '9') await this.store(a, e.slot, e.input);
    const regular: any = entries.find((e: any) => e.slot === '9');
    if (P.readPresets()['9'].input !== regular.input)
      await this.store(a, '9', regular.input);
    P.validateOnDisk(entries);
    registry.agents[key] = {
      signature: P.signature(config),
      entries,
      indices: { model: 0, effort: 0, permissions: 0 },
      configuredAt: new Date().toISOString(),
    };
    P.saveRegistry(file, registry);
  }
}
module.exports = { Setup };

export { Setup };
