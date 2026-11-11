type AgentSnapshot = import('./types').AgentSnapshot;
type Config = import('./types').Config;
type PressContext = import('./types').PressContext;
('use strict');
const clean: (text: unknown) => string = (text: unknown) =>
  String(text ?? '').replace(
    /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
    '',
  );
const segments: Intl.Segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});
function ellipsize(
  text: string,
  width: number | undefined = 126,
  fontSize: number | undefined = 18,
) {
  const glyphs: string[] = Array.from(
    segments.segment(clean(text)),
    (part: Intl.SegmentData) => part.segment,
  );
  const measure: (g: any) => number = (g: any) =>
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
function agentLines(agent: import('./types').AgentSnapshot, aliases: any = {}) {
  const status: string = require('./layout').isBackground(agent)
    ? 'BACKGROUND'
    : {
        idle: 'READY',
        done: 'COMPLETE',
        working: 'WORKING',
        blocked: agent.kind === 'permission' ? 'CHOICE' : 'WAIT INPUT',
        error: 'ERROR',
        unknown: 'UNKNOWN',
      }[agent.state] || 'UNKNOWN';
  return [
    ellipsize(
      aliases[agent.block] ||
        agent.chatName ||
        (agent.app === 'codex' ? 'Name unavailable' : 'Untitled agent'),
      120,
      26,
    ),
    ellipsize(agent.project || 'Unknown folder', 120, 22),
    status,
  ];
}
function shortModel(model: any) {
  return clean(model)
    .replace(/^gpt[- ]?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (c: string) => c.toUpperCase());
}
function sameTarget(a: any, b: any) {
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
function footerMissing(agent: any): boolean {
  return agent?.app === 'codex' && agent.footerMissing === true;
}
const NO_FOOTER_ID = 'No footer ID';
function modeLines(bridge: Record<string, any>) {
  const agent: any = bridge.agents?.find((a: any) =>
    sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Mode'];
  if (footerMissing(agent)) return ['Mode', NO_FOOTER_ID];
  if (agent.app === 'claude-code') return ['Mode', 'Use keyboard'];
  if (
    sameTarget(bridge.lastModeRequest, agent) &&
    (!bridge.lastModeRequest.chatId ||
      bridge.lastModeRequest.chatId === agent.chatId) &&
    bridge.lastModeRequest.at >= (agent.metadataAt || 0)
  )
    return ['Updating…'];
  return [
    ({ plan: 'Plan', default: 'Default' } as Record<string, any>)[
      agent.collaborationMode
    ] || 'Mode',
  ];
}
function modelLines(bridge: Record<string, any>) {
  const target: any = bridge.lastTarget;
  if (!target) return ['Model', 'Select agent'];
  const agent: any = bridge.agents?.find((a: any) => sameTarget(a, target));
  if (!agent) return ['Model', 'Agent closed'];
  if (footerMissing(agent)) return ['Model', NO_FOOTER_ID];
  const recent: any =
      sameTarget(bridge.lastModel, target) &&
      (!bridge.lastModel.chatId || bridge.lastModel.chatId === agent.chatId) &&
      bridge.lastModel.at > (agent.metadataAt || 0)
        ? bridge.lastModel
        : null,
    verified: any = recent ? recent.model : agent.model;
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
function effortLines(bridge: Record<string, any>) {
  const agent: any = bridge.agents?.find((a: any) =>
    sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Effort', ''];
  if (footerMissing(agent)) return ['Effort', NO_FOOTER_ID];
  const recent: any = bridge.lastEffort;
  const fresh: boolean =
      sameTarget(recent, agent) &&
      recent.chatId === agent.chatId &&
      recent.at > (agent.metadataAt || 0),
    value: any = fresh ? recent.effort : agent.effort;
  return [
    'Effort',
    value
      ? clean(value).replace(/^./, (c: string) => c.toUpperCase()) +
        (!fresh && agent.claudeEffortStale ? '?' : '')
      : '',
  ];
}
function reviewerLines(bridge: Record<string, any>) {
  const agent: any = bridge.agents?.find((a: any) =>
    sameTarget(bridge.lastTarget, a),
  );
  if (!agent) return ['Permissions'];
  if (footerMissing(agent)) return ['Permissions', NO_FOOTER_ID];
  const recent: any = bridge.lastReviewer;
  const value: any =
    sameTarget(recent, agent) &&
    recent.chatId === agent.chatId &&
    recent.at > (agent.metadataAt || 0)
      ? recent.reviewer
      : agent.reviewer;
  const label: any = (
    {
      user: 'Ask me',
      auto_review: 'Approve for me',
    } as Record<string, any>
  )[value];
  return label ? ['Permissions', label] : ['Permissions'];
}
module.exports = {
  clean,
  ellipsize,
  agentLines,
  modelLines,
  modeLines,
  effortLines,
  reviewerLines,
  footerMissing,
  shortModel,
  sameTarget,
};

export {};
