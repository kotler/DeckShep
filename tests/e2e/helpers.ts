import { expect, type Page } from '../../tools/e2e';
import type { VirtualDeck } from './virtual-host/deck';
type State = ReturnType<VirtualDeck['snapshot']>;
declare global {
  interface Window {
    deck: Record<string, (...args: any[]) => Promise<State>> & {
      ready: Promise<void>;
      keys(): State['keys'];
      trace(): State['trace'];
    };
  }
}
export async function command(
  page: Page,
  method: string,
  ...args: unknown[]
): Promise<State> {
  return page.evaluate(({ method, args }) => window.deck[method](...args), {
    method,
    args,
  });
}
export async function open(page: Page): Promise<void> {
  const origin = process.env.DECK_URL;
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
    throw Error('Owned preview URL missing');
  await page.goto(origin);
  await page.evaluate(() => window.deck.ready);
  await command(page, 'reset');
}
export async function selected(
  page: Page,
  scenario = 'idle-two-codex',
  profile = 'rex',
): Promise<State> {
  await command(page, 'setScenario', scenario);
  if (profile !== 'rex') await command(page, 'switchProfile', profile);
  await command(
    page,
    'setPreferences',
    profile === 'rex'
      ? { allowClipboardFocus: true }
      : { herdrTitleIdentity: true },
  );
  await command(page, 'press', 0, 0);
  return command(page, 'advance', 350);
}
export async function labels(
  page: Page,
  row: number,
  col: number,
): Promise<string[]> {
  return page.evaluate(
    ({ row, col }) => window.deck.keys()[row * 5 + col].labels,
    { row, col },
  );
}
export async function trace(page: Page): Promise<unknown[]> {
  return page.evaluate(() => window.deck.trace());
}
export async function error(
  page: Page,
  row: number,
  col: number,
): Promise<void> {
  const lines = await labels(page, row, col);
  expect(lines[0]).toBe('Unavailable');
  expect(lines[1].length).toBeLessThanOrEqual(15);
}
