const spinner =
  /^[✢✳✶✻✽·]\s+([\p{L}][\p{L} '-]{0,48})…(?:\s+\([^()\n]{1,100}\))?$/u;
const shortcut =
  /^(?:[◐◑◒◓]\s+\S+\s*·\s*\/[\w-]+|●\s+(?:low|medium|high|xhigh|max)\s*·\s*\/effort)$/u;

/** Recognize the native working cues around Claude's empty composer. */
export function hasClaudeInterruptCue(
  text: string,
  evidence?: 'verified-busy-registration',
) {
  const lines = text.trimEnd().split('\n');
  const lower = lines.findLastIndex((line) =>
    /^[─━]{12,}\s*$/.test(line.trim()),
  );
  const upper = lines
    .slice(0, lower)
    .findLastIndex((line) => /^[─━]{12,}\s*$/.test(line.trim()));
  if (upper < 0 || lower !== upper + 2 || !/^\s*❯\s*$/.test(lines[upper + 1]))
    return false;
  const footerRows = lines
    .slice(lower + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  // A model / project / branch / usage status line can sit between the
  // composer and native shortcuts. Its content is never an interrupt cue.
  if (
    /^(?:Claude\s+)?(?:Haiku|Sonnet|Opus|Fable)\s+\d+(?:\.\d+)+\s*\|[^|\n]+\|[^|\n]+(?:\|[^|\n]*\d+%)?$/i.test(
      footerRows[0] || '',
    )
  )
    footerRows.shift();
  const footer = footerRows.join(' ');
  const hints = footer.split(/\s*·\s*/).map((part) => part.trim());
  const badge =
    /^(?:⏵⏵|⏸|◯|○|●)\s*(?:accept edits|plan mode|bypass permissions|auto mode|manual mode|default mode)(?: on)?(?:\s*\(shift\+tab to cycle\))?$/i;
  if (
    hints.some(
      (part) =>
        part &&
        !badge.test(part) &&
        !/^(?:esc to interrupt|← for agents|\? for shortcuts)$/i.test(part),
    )
  )
    return false;
  if (hints.some((part) => /^esc to interrupt$/i.test(part))) return true;

  // During streaming the spinner can disappear. Only the Rex caller that
  // revalidates the rendered busy registration may use the normal mode footer.
  if (
    evidence === 'verified-busy-registration' &&
    hints.some((part) => badge.test(part))
  )
    return true;

  // Claude may hide shortcut hints. Its active spinner sits immediately above
  // the composer. Never search the transcript for an earlier activity line.
  const above = lines
    .slice(0, upper)
    .map((line) => line.trim())
    .filter(Boolean);
  let activity = above.pop() || '';
  // A compact native indicator and slash-command shortcut may share this area.
  if (shortcut.test(activity)) activity = above.pop() || '';
  return spinner.test(activity);
}

/** Compare repaints only on the native activity row above an empty composer. */
export function interruptFrameIdentity(vt: string, text: string) {
  if (!hasClaudeInterruptCue(text)) return vt;
  const rows = vt.split('\n');
  const plain = rows.map((row) =>
    row
      .replace(/\x1b\[[\d;]*m/g, '')
      .replace(/\x1b\[\d+C/g, ' ')
      .trim(),
  );
  const prompt = plain.findLastIndex((row) => /^❯\s*$/.test(row));
  if (prompt < 2 || !/^[─━]{12,}$/.test(plain[prompt - 1])) return vt;
  let i = prompt - 2;
  while (i >= 0 && !plain[i]) i--;
  if (shortcut.test(plain[i] || '')) {
    i--;
    while (i >= 0 && !plain[i]) i--;
  }
  const activity = spinner.exec(plain[i] || '');
  if (!activity) return vt;
  rows[i] = '✻ ' + activity[1] + '…';
  // Tool progress above the native spinner repaints independently. Compare
  // the verified cue, its screen position, the complete composer and footer.
  return i + ':' + rows.slice(i).join('\n');
}
