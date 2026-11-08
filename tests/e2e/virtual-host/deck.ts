import { prepareVirtualHost } from './host';
import type { Scenario, ScenarioName } from './scenarios';
import type { PreferencePatch } from '../../../src/domain/types';
type Host = Awaited<ReturnType<typeof prepareVirtualHost>>;
export class VirtualDeck {
  private host?: Host;
  private profile = 'rex';
  private name = 'idle-two-codex';
  private time = 10000;
  private paused = false;
  private pauseFrom = 0;
  private readonly hidden = new Set<number>();
  private readonly settings = new Map<number, Record<string, unknown>>();
  async reset(): Promise<void> {
    await this.host?.stop();
    this.host = await prepareVirtualHost({
      fixture: 'tests/e2e/virtual-host/scenario-dependencies.ts',
    });
    this.profile = 'rex';
    this.name = 'idle-two-codex';
    this.time = 10000;
    this.paused = false;
    this.hidden.clear();
    this.settings.clear();
    await this.host.start();
    await this.host.until(() =>
      this.host!.frames.some((f) => f.event === 'registerPlugin'),
    );
    for (let i = 0; i < 15; i++) this.send('willAppear', i);
    await this.host.settled();
  }
  private send(event: string, index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= 15)
      throw Error('Invalid key');
    this.host!.send(event, index, {
      settings: { ...this.settings.get(index), profileScope: this.profile },
    });
  }
  private async settle(): Promise<void> {
    if (this.paused) await this.host!.command('barrier');
    else {
      const visible = Array.from({ length: 15 }, (_, i) => i).find(
        (i) => !this.hidden.has(i),
      );
      if (visible === undefined) await this.host!.command('barrier');
      else await this.host!.settled(visible);
    }
  }
  async execute(
    method: string,
    args: unknown[] = [],
  ): Promise<ReturnType<VirtualDeck['snapshot']>> {
    if (!this.host) throw Error('Virtual deck not started');
    const index = () => {
      const [row, column] = args;
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        Number(row) < 0 ||
        Number(row) > 2 ||
        Number(column) < 0 ||
        Number(column) > 4
      )
        throw Error('Invalid coordinates');
      return Number(row) * 5 + Number(column);
    };
    if (method === 'reset') await this.reset();
    else if (method === 'setScenario') {
      await this.host.command('scenario', args[0] as ScenarioName | Scenario);
      this.name = typeof args[0] === 'string' ? args[0] : 'custom';
      await this.settle();
    } else if (method === 'advance') {
      const ack = await this.host.command('advance', args[0]);
      this.time = Number(ack.clock);
      await this.settle();
    } else if (method === 'switchProfile') {
      if (!['rex', 'herdr', 'herdr-app'].includes(String(args[0])))
        throw Error('Invalid profile');
      for (let i = 0; i < 15; i++) this.send('willDisappear', i);
      this.profile = String(args[0]);
      this.hidden.clear();
      this.settings.clear();
      for (let i = 0; i < 15; i++) this.send('willAppear', i);
      await this.settle();
    } else if (method === 'setKeySettings') {
      const i = index();
      const patch = args[2];
      if (!patch || typeof patch !== 'object' || Array.isArray(patch))
        throw Error('Invalid key settings');
      this.settings.set(i, patch as Record<string, unknown>);
      this.send('didReceiveSettings', i);
      await this.settle();
    } else if (method === 'setPreferences') {
      const preferences = args[0] as PreferencePatch;
      this.host.send('sendToPlugin', 0, { kind: 'preferences', preferences });
      await this.settle();
    } else if (method === 'hide') {
      const i = index();
      this.send('willDisappear', i);
      this.hidden.add(i);
      await this.settle();
    } else if (method === 'pauseFocus') {
      this.pauseFrom = this.host.input.length;
      await this.host.command('pauseFocus');
      this.paused = true;
    } else if (method === 'down' || method === 'up' || method === 'press') {
      const i = index();
      if (method !== 'up') this.send('keyDown', i);
      if (method !== 'down') this.send('keyUp', i);
      if (this.paused && method === 'down')
        await this.host.until(() =>
          this.host!.input.slice(this.pauseFrom).some(
            (m) => m.kind === 'fixturePaused',
          ),
        );
      else {
        if (this.paused) {
          this.paused = false;
          await this.host.command('releaseFocus');
        }
        await this.settle();
      }
    } else if (!['trace', 'keys', 'snapshot'].includes(method))
      throw Error('Unknown deck command');
    return this.snapshot();
  }
  snapshot() {
    const host = this.host;
    const keys = Array.from({ length: 15 }, (_, i) => {
      const context = 'key-' + i;
      const frames = host?.frames.filter((f) => f.context === context) ?? [];
      const image = String(
        frames.findLast((f) => f.event === 'setImage')?.payload?.image ?? '',
      );
      const title = String(
        frames.findLast((f) => f.event === 'setTitle')?.payload?.title ?? '',
      );
      const svg = image
        ? Buffer.from(image.split(',')[1], 'base64').toString()
        : '';
      const labels = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(
        (m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'"),
      );
      return {
        row: Math.floor(i / 5),
        col: i % 5,
        image,
        title,
        svg,
        labels,
        selected: svg.includes('id="selected-agent"'),
        visible: !this.hidden.has(i),
      };
    });
    return {
      profile: this.profile,
      scenario: this.name,
      clock: this.time,
      keys,
      trace:
        host?.input
          .filter((m) => m.kind === 'fixtureInput')
          .map((m) => m.args) ?? [],
      refusals: (host?.frames ?? [])
        .filter(
          (frame) =>
            frame.event === 'setImage' &&
            String(frame.payload?.image).startsWith(
              'data:image/svg+xml;base64,',
            ),
        )
        .flatMap((frame) => {
          const svg = Buffer.from(
            String(frame.payload!.image).split(',')[1],
            'base64',
          ).toString();
          const labels = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(
            (m) => m[1],
          );
          return labels[0] === 'Unavailable'
            ? [{ context: frame.context, message: labels[1] }]
            : [];
        }),
      alerts:
        host?.frames
          .filter((f) => f.event === 'showAlert')
          .map((f) => f.context) ?? [],
    };
  }
  async stop(): Promise<void> {
    await this.host?.stop();
  }
}
