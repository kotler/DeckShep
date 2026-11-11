import type { AgentSnapshot, TargetRef } from './types';
import { isBackground } from './layout';

/** A key press the plugin made recently, kept so labels can show it before the
 * provider metadata catches up. */
export interface RecentRequest extends Partial<TargetRef> {
  chatId?: string | null;
  at: number;
}
export interface RecentModel extends RecentRequest {
  model?: string | null;
  modelName?: string | null;
}
export interface RecentEffort extends RecentRequest {
  effort?: string | null;
}
export interface RecentReviewer extends RecentRequest {
  reviewer?: string | null;
}
/** The slice of controller state the label helpers read. */
export interface LabelBridge {
  agents?: AgentSnapshot[];
  lastTarget?: Partial<TargetRef> | null;
  lastModeRequest?: RecentRequest;
  lastModel?: RecentModel;
  lastEffort?: RecentEffort;
  lastReviewer?: RecentReviewer;
}
export const clean: (text: unknown) => string = (text: unknown) =>
  String(text ?? '').replace(
    /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
    '',
  );
/** The most characters a key can show for a press message. */
export const KEY_MESSAGE_MAX = 15;
/** Fixed short wordings for guard and controller messages that are too long. */
const KEY_MESSAGES: Record<string, string> = {
  'select an agent first': 'Select agent',
  'select a ready codex agent on the deck': 'Select agent',
  'input target changed': 'Target changed',
  'input permit expired': 'Press again',
  'reselect agent on deck': 'Reselect agent',
  'claude session changed; reselect': 'Reselect agent',
  'controller changed; no input sent': 'No input sent',
  'control unverified': 'Not verified',
  'control input changed': 'Input changed',
  'enable visible-pane checks first': 'Enable checks',
  'unsupported input action': 'Not supported',
};
/**
 * A press message cut to key width without breaking a word: the text itself
 * when it fits, the clause before `;`, `Press again` for a stale context, a
 * fixed short label, or whole words followed by an ellipsis.
 */
export function keyMessage(text: unknown): string {
  const full = clean(text).replace(/\s+/g, ' ').trim();
  if (full.length <= KEY_MESSAGE_MAX) return full;
  const semicolon = full.indexOf(';');
  if (semicolon > 0) {
    const clause = full.slice(0, semicolon).trim();
    if (clause && clause.length <= KEY_MESSAGE_MAX) return clause;
  }
  if (/;\s*press again$/i.test(full)) return 'Press again';
  const fixed = KEY_MESSAGES[full.toLowerCase()];
  if (fixed) return fixed;
  const room = KEY_MESSAGE_MAX - 1;
  let kept = '';
  for (const word of full.split(' ')) {
    const next = kept ? kept + ' ' + word : word;
    if (next.length > room) break;
    kept = next;
  }
  return (kept || Array.from(full).slice(0, room).join('')) + '…';
}
const segments: Intl.Segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});
export function ellipsize(
  text: string,
  width: number | undefined = 126,
  fontSize: number | undefined = 18,
) {
  const glyphs: string[] = Array.from(
    segments.segment(clean(text)),
    (part: Intl.SegmentData) => part.segment,
  );
  const measure: (g: string) => number = (g: string) =>
    fontSize *
    (/^[ilI.,'`!:;| ]$/.test(g)
      ? 0.28
      : /^[MW@#%]$/.test(g)
        ? 0.9
        : /^[A-Z]$/.test(g)
          ? 0.66
          : /^[\u0000-\u024f]$/.test(g)
            ? 0.54
            : 1);
  if (glyphs.reduce((sum: number, g: string) => sum + measure(g), 0) <= width)
    return glyphs.join('');
  let result: string = '',
    used: number = 0;
  for (const glyph of glyphs) {
    const size: number = measure(glyph);
    if (used + size + fontSize > width) break;
    result += glyph;
    used += size;
  }
  return result + '…';
}
export function agentLines(
  agent: AgentSnapshot,
  aliases: Record<string, string | undefined> = {},
) {
  const status: string = isBackground(agent)
    ? 'Bg task'
    : {
        idle: 'Ready',
        done: 'Done',
        working: 'Working',
        blocked: agent.kind === 'permission' ? 'Approve' : 'Asking',
        error: 'Error',
        unknown: 'Unknown',
      }[agent.state] || 'Unknown';
  return [
    ellipsize(
      aliases[agent.block] ||
        agent.chatName ||
        (agent.app === 'codex' ? 'Unnamed' : 'Untitled'),
      120,
      26,
    ),
    ellipsize(agent.project || 'No folder', 120, 22),
    status,
  ];
}
export function shortModel(model: unknown) {
  return clean(model)
    .replace(/^gpt[- ]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (c: string) => c.toUpperCase());
}
export function sameTarget(
  a: Partial<TargetRef> | null | undefined,
  b: Partial<TargetRef> | null | undefined,
) {
  return (
    a &&
    b &&
    a.session === b.session &&
    a.block === b.block &&
    a.pid === b.pid &&
    (!a.app || !b.app || a.app === b.app) &&
    (!a.name || !b.name || a.name === b.name) &&
    (a.terminalId || null) === (b.terminalId || null) &&
    (a.nativeIdentity || null) === (b.nativeIdentity || null)
  );
}
/** Codex controls in Rex need the session ID in the user's own footer. */
export function footerMissing(
  agent: Pick<AgentSnapshot, 'app' | 'footerMissing'> | null | undefined,
): boolean {
  return agent?.app === 'codex' && agent.footerMissing === true;
}
const NO_FOOTER_ID = 'No footer ID';
export function modeLines(bridge: LabelBridge) {
  const agent: AgentSnapshot | undefined = bridge.agents?.find(
    (a: AgentSnapshot) => sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Mode'];
  if (footerMissing(agent)) return ['Mode', NO_FOOTER_ID];
  if (agent.app === 'claude-code') return ['Mode', 'Use keyboard'];
  const request: RecentRequest | undefined = bridge.lastModeRequest;
  if (
    request &&
    sameTarget(request, agent) &&
    (!request.chatId || request.chatId === agent.chatId) &&
    request.at >= (agent.metadataAt || 0)
  )
    return ['Updating…'];
  return [
    ({ plan: 'Plan', default: 'Default' } as Record<string, string>)[
      String(agent.collaborationMode)
    ] || 'Mode',
  ];
}
export function modelLines(bridge: LabelBridge) {
  const target: Partial<TargetRef> | null | undefined = bridge.lastTarget;
  if (!target) return ['Model', 'Select agent'];
  const agent: AgentSnapshot | undefined = bridge.agents?.find(
    (a: AgentSnapshot) => sameTarget(a, target),
  );
  if (!agent) return ['Model', 'Agent closed'];
  if (footerMissing(agent)) return ['Model', NO_FOOTER_ID];
  const lastModel: RecentModel | undefined = bridge.lastModel;
  const recent: RecentModel | null =
      lastModel &&
      sameTarget(lastModel, target) &&
      (!lastModel.chatId || lastModel.chatId === agent.chatId) &&
      lastModel.at > (agent.metadataAt || 0)
        ? lastModel
        : null,
    verified: string | null | undefined = recent ? recent.model : agent.model;
  return [
    'Model',
    ellipsize(
      verified
        ? agent.app === 'claude-code'
          ? recent?.modelName ||
            (agent.model === verified ? agent.modelName : null) ||
            verified.replace(/^claude-/, '')
          : shortModel(verified)
        : '',
      126,
      16,
    ) + (!recent && verified && agent.claudeModelStale ? '?' : ''),
  ];
}
export function effortLines(bridge: LabelBridge) {
  const agent: AgentSnapshot | undefined = bridge.agents?.find(
    (a: AgentSnapshot) => sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Effort', ''];
  if (footerMissing(agent)) return ['Effort', NO_FOOTER_ID];
  const recent: RecentEffort | undefined = bridge.lastEffort;
  const fresh: boolean | null | undefined =
      recent &&
      sameTarget(recent, agent) &&
      recent.chatId === agent.chatId &&
      recent.at > (agent.metadataAt || 0),
    value: string | null | undefined = fresh ? recent?.effort : agent.effort;
  return [
    'Effort',
    value
      ? clean(value).replace(/^./, (c: string) => c.toUpperCase()) +
        (!fresh && agent.claudeEffortStale ? '?' : '')
      : '',
  ];
}
export function reviewerLines(bridge: LabelBridge) {
  const agent: AgentSnapshot | undefined = bridge.agents?.find(
    (a: AgentSnapshot) => sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Permissions'];
  if (footerMissing(agent)) return ['Permissions', NO_FOOTER_ID];
  const recent: RecentReviewer | undefined = bridge.lastReviewer;
  const value: string | null | undefined =
    recent &&
    sameTarget(recent, agent) &&
    recent.chatId === agent.chatId &&
    recent.at > (agent.metadataAt || 0)
      ? recent.reviewer
      : agent.reviewer;
  const label: string | undefined = (
    {
      user: 'Ask me',
      auto_review: 'Approve for me',
    } as Record<string, string>
  )[String(value)];
  return label ? ['Permissions', label] : ['Permissions'];
}
