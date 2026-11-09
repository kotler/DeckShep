import { validate } from '../schemas';

// JSON.parse accepts duplicate keys. Reject them before strict schema parsing,
// including escaped equivalents and duplicates nested inside the peer object.
export function uniquePeerJSON(text: string): unknown {
  try {
    return decodeUniquePeerJSON(text);
  } catch {
    throw Error('Peer unverified');
  }
}
function decodeUniquePeerJSON(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const tokens =
    /\s*("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}\[\],:]|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/gy;
  const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
  let end = 0;
  for (;;) {
    const match = tokens.exec(text);
    if (!match) break;
    end = tokens.lastIndex;
    const token = match[1],
      top = stack.at(-1);
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && top) top.key = true;
    else if (token.startsWith('"') && top?.key) {
      const key = JSON.parse(token) as string;
      if (top.keys.has(key)) throw Error('Peer unverified');
      top.keys.add(key);
      top.key = false;
    }
  }
  if (text.slice(end).trim()) throw Error('Peer unverified');
  return value;
}

export function peerSessionFrame(bytes: Buffer, seq: number, state: string) {
  const frame = uniquePeerJSON(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  );
  if (!frame || typeof frame !== 'object' || Array.isArray(frame))
    throw Error('Peer unverified');
  const value = frame as Record<string, unknown>;
  const expected = [
    'peer',
    'protocol',
    'seq',
    'state',
    ...(state === 'finished' ? ['socketToken'] : []),
  ].sort();
  if (
    Object.keys(value).sort().join(',') !== expected.join(',') ||
    value.protocol !== 2 ||
    value.seq !== seq ||
    value.state !== state ||
    (state === 'finished' &&
      !['matched', 'unavailable'].includes(String(value.socketToken)))
  )
    throw Error('Peer unverified');
  if (!value.peer || typeof value.peer !== 'object' || 'protocol' in value.peer)
    throw Error('Peer unverified');
  return validate('herdrAppPeer', { ...value.peer, protocol: 1 });
}
