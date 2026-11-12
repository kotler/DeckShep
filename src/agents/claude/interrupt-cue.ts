/** Recognize the native working footer with no configured Claude status line. */
export function hasClaudeInterruptCue(text: string) {
  const lines = text.trimEnd().split('\n');
  const lower = lines.findLastIndex((line) =>
    /^[─━]{12,}\s*$/.test(line.trim()),
  );
  const upper = lines
    .slice(0, lower)
    .findLastIndex((line) => /^[─━]{12,}\s*$/.test(line.trim()));
  if (upper < 0 || lower !== upper + 2 || !/^\s*❯\s*$/.test(lines[upper + 1]))
    return false;
  const footer = lines
    .slice(lower + 1)
    .join(' ')
    .trim();
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

  // Claude may hide shortcut hints. Its active spinner sits immediately above
  // the composer. Never search the transcript for an earlier activity line.
  const above = lines
    .slice(0, upper)
    .map((line) => line.trim())
    .filter(Boolean);
  let activity = above.pop() || '';
  // A compact native indicator and slash-command shortcut may share this area.
  if (/^[◐◑◒◓]\s+\S+\s*·\s*\/[\w-]+$/u.test(activity))
    activity = above.pop() || '';
  return /^[✢✳✶✻✽·]\s+[\p{L}][\p{L} '-]{0,48}…(?:\s+\([^()\n]{1,100}\))?$/u.test(
    activity,
  );
}
