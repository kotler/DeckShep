import { createHash } from 'node:crypto';
import type { KeyboardView } from '../../domain/backend';
import type { TargetRef } from '../../domain/types';

/** The reply fields of a Rex `format`/`modes` block call that are read here. */
export interface RexBlockReply {
  id?: unknown;
  content?: string;
  modes?: ({ number?: number; set?: boolean } | null)[];
}
// Rex text includes placeholders as ordinary characters. Corroborate the
// complete suffix with the VT styling on the same visible prompt. An actual
// draft at column 3 can have precisely the same wording in normal intensity.
function dimmedCursorSuffix(vt: string, text: string, cursor: RegExpExecArray) {
  const lines = text.split('\n');
  const row = Number(cursor[1]) - 1;
  const line = lines[row]?.trimEnd();
  if (
    Number(cursor[2]) !== 3 ||
    !line ||
    !/^❯[ \u00a0]\S/.test(line) ||
    lines.slice(row + 1).some((value) => value.includes('❯'))
  )
    return false;
  const native = vt.split('\n').findLast((value) => value.includes('❯'));
  if (!native) return false;
  // Only a single faint run followed by a reset is a hint. Preserve every
  // other style, cursor movement and mixed-intensity suffix as unverified.
  return (
    native.replace(/\r$/, '') ===
    line.slice(0, 2) + '\x1b[0m\x1b[2m' + line.slice(2) + '\x1b[0m'
  );
}
// Read each cursor and composer from the same Rex VT snapshot. Accept only
// line-oriented frames with SGR styling and bounded horizontal spacing.
function decodeSnapshot(vt: string) {
  const cursor = /\x1b\[(\d+);(\d+)H$/.exec(vt);
  if (!cursor || vt.length > 960000) return;
  const row = Number(cursor[1]),
    column = Number(cursor[2]);
  const raw = vt.slice(0, cursor.index).replace(/\r\n/g, '\n');
  const rows = raw.split('\n');
  if (column !== 3 || row < 1 || row > rows.length) return;
  let remaining = 960000 - raw.length;
  const plain = raw
    // OSC 8 marks a hyperlink without moving the cursor. Keep its visible label.
    .replace(/\x1b\]8;[^;\x00-\x1f\x7f]*;[^\x00-\x1f\x7f]*\x1b\\/g, '')
    .replace(/\x1b\[[\d;]*m/g, '')
    // ECH clears cells ahead without advancing. In this forward-only snapshot
    // those cells are already blank. Any backward movement still refuses.
    .replace(/\x1b\[\d{0,3}X/g, '')
    .replace(/\x1b\[(\d{1,3})C/g, (sequence, n: string) => {
      const count = Number(n);
      remaining -= count;
      return count > 0 && remaining >= 0 ? ' '.repeat(count) : sequence;
    });
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(plain)) return;
  const composerAndFooter = rows.slice(row - 1).join('\n');
  return {
    text: plain,
    cursor: { row, column },
    hash: createHash('sha256').update(composerAndFooter).digest('hex'),
  };
}
/** Bind the plain text and cursor to the same native frame; return no scrollback. */
export async function stableViewport(
  target: TargetRef,
  run: (args: string[]) => Promise<RexBlockReply | null | undefined>,
  screen: () => Promise<string>,
  frameIdentity?: (vt: string, text: string) => string,
  atomicComposer = false,
  idleEffortIdentity?: (vt: string, text: string) => string,
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
  if (atomicComposer) {
    const snapshot = decodeSnapshot(before.content);
    if (!snapshot)
      throw Error('Check cursor; Codex native frame could not be verified');
    return snapshot;
  }
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
    if (visibility.length !== 1 || visibility[0]?.set !== false)
      throw Error('Rex viewport/cursor unavailable');
  }
  const text = await screen(),
    after = await run(args);
  const original = frameIdentity
    ? frameIdentity(before.content, text)
    : before.content;
  if (after?.id || typeof after?.content !== 'string')
    throw Error('Rex view changed');
  if (
    original !==
    (frameIdentity ? frameIdentity(after.content, text) : after.content)
  ) {
    throw Error('Rex view changed');
  }
  return {
    ...(idleEffortIdentity
      ? {
          idleEffortHash: createHash('sha256')
            .update(idleEffortIdentity(before.content, text))
            .digest('hex'),
        }
      : {}),
    text,
    ...(target.app === 'claude-code' &&
    cursor &&
    dimmedCursorSuffix(before.content, text, cursor)
      ? { dimmedCursorSuffix: true as const }
      : {}),
    cursor: cursor
      ? { row: Number(cursor[1]), column: Number(cursor[2]) }
      : null,
    hash: createHash('sha256').update(original).digest('hex'),
  };
}
