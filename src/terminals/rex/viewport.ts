import { createHash } from 'node:crypto';
import type { KeyboardView } from '../../domain/backend';
import type { TargetRef } from '../../domain/types';

/** Bind the plain text and cursor to the same native frame; return no scrollback. */
export async function stableViewport(
  target: TargetRef,
  run: (args: string[]) => Promise<any>,
  screen: () => Promise<string>,
): Promise<KeyboardView> {
  const args = [
    'block',
    'call',
    '-s',
    target.session,
    '-b',
    target.block,
    'format',
    JSON.stringify({ format: 'vt', extra_cursor: true, max_bytes: 960000 }),
  ];
  const before = await run(args);
  if (before?.id || typeof before?.content !== 'string' || !before.content)
    throw Error('Rex viewport unavailable');
  const cursor = /\x1b\[(\d+);(\d+)H$/.exec(before.content);
  if (!cursor) {
    if (target.app !== 'codex' && target.app !== 'claude-code')
      throw Error('Rex viewport/cursor unavailable');
    // A native list picker hides the caret. Require Rex to confirm DECTCEM
    // between the two VT reads. The composer still requires an exact position.
    const reply = await run([
      'block',
      'call',
      '-s',
      target.session,
      '-b',
      target.block,
      'modes',
    ]);
    const visibility = Array.isArray(reply?.modes)
      ? reply.modes.filter(
          (mode: { number?: number } | null) => mode?.number === 25,
        )
      : [];
    if (visibility.length !== 1 || visibility[0].set !== false)
      throw Error('Rex viewport/cursor unavailable');
  }
  const text = await screen(),
    after = await run(args);
  if (after?.id || after?.content !== before.content)
    throw Error('Rex view changed');
  return {
    text,
    cursor: cursor
      ? { row: Number(cursor[1]), column: Number(cursor[2]) }
      : null,
    hash: createHash('sha256').update(before.content).digest('hex'),
  };
}
