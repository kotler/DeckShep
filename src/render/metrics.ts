// Advance widths of Arial (Helvetica metrics) in 1/1000 em for the printable
// ASCII range, starting at the space character. Key captions are drawn in
// Arial, so measuring with the real widths keeps a caption such as
// "GPT-6-Astra" whole where a per-class guess would cut it.
const REGULAR: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const BOLD: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
  556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

/** Width of one character at `size`, in SVG units. */
export function charWidth(c: string, size: number, bold: boolean): number {
  const code = c.codePointAt(0) ?? 0;
  const em =
    c === '…'
      ? 1000
      : code >= 32 && code <= 126
        ? (bold ? BOLD : REGULAR)[code - 32]
        : code < 0x2e80
          ? 600 // Latin supplements, punctuation, symbols
          : 1000; // CJK and other full-width scripts
  return (size * em) / 1000;
}

/** Width of a run of characters at `size`, in SVG units. */
export function textWidth(
  chars: readonly string[],
  size: number,
  bold: boolean,
): number {
  let width = 0;
  for (const c of chars) width += charWidth(c, size, bold);
  return width;
}
