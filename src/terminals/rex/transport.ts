import path from 'node:path';
import { exec } from '../../platform/exec.ts';
import { discoverRex, pluginDirectory, type RexInstallation } from '../../platform/paths.ts';
export class RexTransport {
  #cached?: { key: string; until: number; value: Promise<RexInstallation> };
  constructor(private readonly config: () => { rexPath?: string }) {}
  private installation(): Promise<RexInstallation> {
    const key = this.config().rexPath ?? '';
    if (!this.#cached || this.#cached.key !== key || this.#cached.until < Date.now()) {
      const value = discoverRex(key);
      this.#cached = { key, until: Date.now() + 2000, value };
      void value.catch(() => { this.#cached = undefined; });
    }
    return this.#cached.value;
  }
  async command(args: string[], input?: string): Promise<unknown> {
    const { binary } = await this.installation();
    const output = (await exec(binary, ['--autostart=false', '--timeout', '2s', ...args], {
      timeout: 3500, maxBuffer: 2e6, input, message: 'Rex command failed',
    })).trim();
    try { return output ? JSON.parse(output) : null; } catch { return output; }
  }
  async activate(): Promise<void> {
    const { application } = await this.installation();
    await exec('/usr/bin/open', ['-a', application], { timeout: 5000, message: 'Could not bring Rex to front' });
  }
  async visible(clientId: string): Promise<string> {
    const { binary } = await this.installation();
    const output = await exec(path.join(pluginDirectory, 'bin', 'visible-pane'), [binary, clientId], {
      timeout: 4500, maxBuffer: 2048, message: 'Visible pane query failed; no input sent',
    });
    try {
      const result = JSON.parse(output);
      if (!/^block:[0-9a-f-]{36}$/i.test(result.block_id) || result.clipboard_restored !== true) throw Error();
      return result.block_id;
    } catch { throw Error('Invalid visible pane result'); }
  }
}
