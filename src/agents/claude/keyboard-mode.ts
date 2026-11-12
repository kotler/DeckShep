import type { KeyboardView as View } from '../../domain/backend';
const { configurationView } = require('./cycle');
const { composer } = require('./controls');

const composerBorder = /^[─━]{12,}(?:\s+.*\s+[─━]+)?\s*$/;
export function nativeEffort(view: View) {
  configurationView(view);
  const lines = view.text.split('\n');
  const lower = lines.findLastIndex((line) => composerBorder.test(line.trim()));
  const upper = lines
    .slice(0, lower)
    .findLastIndex((line) => composerBorder.test(line.trim()));
  const badge = lines.slice(0, upper).findLast((line) => line.trim());
  return /^\s*[○◯◐◑◒◓◔◕◉●◎]\s+(low|medium|high|xhigh|max)\s*·\s*\/effort\s*$/i
    .exec(badge || '')?.[1]
    .toLowerCase();
}

/** Claude exposes Plan as a permission mode on the same Shift+Tab cycle. */
export function claudeFooter(view: View) {
  configurationView(view);
  const lines = view.text.split('\n');
  const start = lines.findLastIndex((line) =>
    /^[─━]{12,}(?:\s+.*\s+[─━]+)?\s*$/.test(line.trim()),
  );
  const footer = lines.slice(start + 1).join('\n');
  const badge =
    /^\s*(?:⏵⏵|⏸|◯|○|●)\s*(accept edits|plan mode|bypass permissions|auto mode|manual mode|default mode)(?: on)?(?=\s|$)/im.exec(
      footer,
    );
  const explicit =
    /^\s*(?:Claude\s+|Model:\s*)([^·\n]{1,80}?)\s*·\s*(low|medium|high|xhigh|max)\s*$/im.exec(
      footer,
    );
  const setting =
    /^\s*(?:Claude )?(Opus|Sonnet|Haiku|Fable)\s+(\d+\.\d+(?:\.\d+)?)\s*(?:·\s*(low|medium|high|xhigh|max)\b)?/im.exec(
      footer,
    );
  return {
    model: explicit?.[1]?.trim() || (setting && setting[1] + ' ' + setting[2]),
    effort: nativeEffort(view) || explicit?.[2] || setting?.[3],
    permissions: badge?.[1],
    plan: badge?.[1],
  };
}
export async function cycleClaudeMode(b: any, target: any) {
  const a = await b.claude.selected(true, await b.providerAgent());
  if (b.draft || b.picker || b.claude.picker)
    throw Error('Close native picker');
  const before = await b.claude.view(a);
  composer(before.text, before.cursor, a, { allowEmpty: true });
  configurationView(before, { requireEmpty: true });
  const fresh = await b.checked(a, true);
  b.claude.assert(target, fresh);
  const current = await b.claude.view(fresh);
  if (current.hash !== before.hash) throw Error('Claude view changed');
  await b.claude.key(fresh, 'shift+tab');
  // Stop after one key, including when the client presents a confirmation.
  const after = await b.claude.view(await b.checked(a, true));
  const result = claudeFooter(after);
  if (after.hash === before.hash) throw Error('Check mode in Rex');
  return { label: result.permissions || 'Check Claude' };
}
