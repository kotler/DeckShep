import type { KeySpec } from './spec';

export interface FrameCache {
  /** Returns the data URI; identical specs return the cached string. */
  image(spec: KeySpec): string;
  /** Stable identity of a spec, cheap to compare per key per tick. */
  key(spec: KeySpec): string;
}

/** Canonical text of a spec: sorted keys, undefined fields omitted. */
function identity(spec: KeySpec): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(spec).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  ))
    if (value !== undefined)
      parts.push(JSON.stringify(name) + ':' + JSON.stringify(value));
  return '{' + parts.join(',') + '}';
}

export function createFrameCache(
  draw: (spec: KeySpec) => string,
  capacity: number = 256,
): FrameCache {
  // A Map iterates in insertion order, so re-inserting on a hit keeps the
  // least recently used entry first.
  const images = new Map<string, string>();
  return {
    key: identity,
    image(spec: KeySpec): string {
      const id = identity(spec);
      const hit = images.get(id);
      if (hit !== undefined) {
        images.delete(id);
        images.set(id, hit);
        return hit;
      }
      const image =
        'data:image/svg+xml;base64,' +
        Buffer.from(draw(spec)).toString('base64');
      images.set(id, image);
      while (images.size > Math.max(1, capacity)) {
        const oldest = images.keys().next();
        if (oldest.done) break;
        images.delete(oldest.value);
      }
      return image;
    },
  };
}
