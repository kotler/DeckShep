import type { AgentSnapshot, Config } from '../domain/types';
import type { AgentFaceState, KeySpec } from '../render/spec';
import type { AttentionKind } from '../domain/navigation';
import { rexSettingsAction } from './rex-keyboard-settings';
import { BLOCKER_TEXT, controlBlocker } from '../domain/blockers';

const {
  agentLines,
  modelLines,
  modeLines,
  effortLines,
  reviewerLines,
  footerMissing,
} = require('../domain/labels');
const { isBackground } = require('../domain/layout');
const { controlAccent } = require('../render/signal');

/** The selected agent's control mode, as `modeOf` reports it. */
export type FaceMode =
  'unknown' | 'working' | 'question' | 'background' | 'ready' | 'approval';

export interface FaceSlot {
  session: string;
  block: string;
}

/** The fields of the (untyped) session bridge that a key face reads. */
export interface FaceBridge {
  slots: FaceSlot[];
  agents?: FaceSlot[];
  draft?: { action: string } | null;
  [field: string]: unknown;
}

export interface FaceConfig {
  aliases: Config['aliases'];
  palette: Config['palette'];
  animation: Config['animation'];
  appearance?: { style?: string };
  claude?: { enabled?: boolean };
  allowClipboardFocus?: boolean;
}

/** A transient overlay set by a press: `feedback` replaces, `notice` confirms. */
export interface FaceFeedback {
  action: string;
  stamp: string;
  until: number;
  message: string;
}
export interface FaceNotice {
  action: string;
  stamp: string;
  until: number;
  label: string;
}

/** Facts about the agent in an agent slot, gathered by the controller. */
export interface FaceAgent {
  /** The slot exists in the bank, whether or not an agent fills it. */
  slotPresent: boolean;
  /** Absent: the slot is closed, offline or empty. */
  agent?: AgentSnapshot;
  /** Completion-adjusted snapshot (`completion.agent(agent)`). */
  shown?: AgentSnapshot;
  /** Milliseconds since the displayed state began. */
  elapsedMs: number;
  /** This agent is the one the controls act on. */
  selected: boolean;
}

export type PulseFunction = (
  state: string,
  elapsedMs: number,
  animation: Config['animation'],
) => number;

export interface KeyFaceInput {
  /** The mapped action of the key, e.g. `agent:2` or `permissions`. */
  action: string;
  scope: string;
  backendName: string;
  offline: boolean;
  now: number;
  /** `C.stamp(target, page)` for this tick. */
  contextStamp: string;
  mode: FaceMode;
  /** The selected agent, if any. */
  target: AgentSnapshot | undefined;
  bridge: FaceBridge;
  /** Current bank index, for the Page key. */
  bank: number;
  /** `bridge.slotGaps()`; only read for non-agent keys. */
  gaps: number;
  config: FaceConfig;
  agentView?: FaceAgent;
  feedback: FaceFeedback | null | undefined;
  notice: FaceNotice | null | undefined;
  pulse: PulseFunction;
  /** The `attention` key: its top candidate's kind and how many there are. */
  attention?: { kind: AttentionKind; count: number } | undefined;
  /** The key has a long-press action. */
  hold?: boolean;
}

const ATTENTION_FACE: Record<
  AttentionKind,
  { heading: string; palette: string; accent: string }
> = {
  waiting: { heading: 'Waiting', palette: 'blocked', accent: '#d19c30' },
  error: { heading: 'Error', palette: 'error', accent: '#d34263' },
  done: { heading: 'Done', palette: 'done', accent: '#28ad82' },
};

const ICON_ALIASES: Record<string, string> = {
  effortIncrease: 'blank',
  effortDecrease: 'blank',
  plan: 'blank',
  permissions: 'reviewer',
  questionPrev: 'previous',
  questionNext: 'next',
  answer: 'send',
  approvalUp: 'up',
  approvalDown: 'down',
  approvalConfirm: 'permissions',
  approvalEscape: 'escape',
  none: 'blank',
  inputInfo: 'blank',
  status: 'blank',
  claudeInfo: 'claude-code',
  claudeModeInfo: 'blank',
  claudeToggle: 'permissions',
};

const NOTICE_HEADINGS: Record<string, string> = {
  stopTerminals: 'Stop',
  collapse: 'Collapse',
  permissions: 'Permissions',
  steer: 'Steer',
  queue: 'Queue',
  effortIncrease: 'Effort',
  effortDecrease: 'Effort',
  plan: 'Mode',
};

const REX_HEADINGS: Record<string, string> = {
  model: 'Model',
  effort: 'Effort',
  permissions: 'Permissions',
  plan: 'Mode',
};

const GREY = '#38414b';
const QUESTION_ONLY = [
  'up',
  'down',
  'left',
  'right',
  'escape',
  'questionPrev',
  'questionNext',
  'answer',
];

/** Strip control characters and cut a caption value to key width. */
function clean(value: unknown): string {
  return String(value || '')
    .replace(/[\x00-\x1f\x7f-\x9f‪-‮⁦-⁩]/g, '')
    .slice(0, 15);
}

/** The Page key's captions: bank position and agents hidden off-page. */
export function bankLines(
  bridge: FaceBridge,
  bank: number,
  offline: boolean,
  backendName: string,
): string[] {
  if (offline) return ['Page', backendName + ' offline'];
  const visible = bridge.slots
    .slice(bank * 5, bank * 5 + 5)
    .filter((s) =>
      bridge.agents?.some(
        (a) => a.session === s.session && a.block === s.block,
      ),
    ).length;
  const total = Math.max(1, Math.ceil(bridge.slots.length / 5)),
    outside = Math.max(0, (bridge.agents?.length || 0) - visible);
  return [
    'Page',
    ...(total > 1 ? [`${bank + 1}/${total}`] : []),
    ...(outside
      ? [`${outside} off-page`]
      : bridge.agents?.length
        ? []
        : ['No agents']),
  ];
}

/** The shape-coded state of a live agent, as the agent key displays it. */
function liveState(shown: AgentSnapshot): AgentFaceState {
  if (isBackground(shown)) return 'background';
  switch (shown.state) {
    case 'idle':
      return 'ready';
    case 'working':
      return 'working';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'blocked':
      return shown.kind === 'question'
        ? 'question'
        : shown.kind === 'permission'
          ? 'approval'
          : 'unknown';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function agentFace(input: KeyFaceInput): {
  icon: string;
  lines: string[];
  color: string;
  pulse: number;
  badge: '' | 'selected';
  state: AgentFaceState;
} {
  const { config, offline, backendName } = input;
  const view = input.agentView;
  const agent = view?.agent,
    shown = view?.shown;
  if (view && agent && shown) {
    const background = isBackground(shown);
    return {
      icon: agent.app,
      lines: agentLines(shown, config.aliases),
      color: background
        ? '#126b78'
        : config.palette[shown.state === 'idle' ? 'ready' : shown.state] ||
          config.palette.unknown,
      pulse: input.pulse(
        background ? 'idle' : shown.state,
        view.elapsedMs,
        config.animation,
      ),
      badge: view.selected ? 'selected' : '',
      state: liveState(shown),
    };
  }
  return {
    icon: 'empty',
    lines: offline
      ? [backendName + ' offline']
      : view?.slotPresent
        ? ['Closed']
        : ['No agent'],
    color: offline ? config.palette.error : config.palette.idle,
    pulse: 0,
    badge: '',
    state: offline ? 'offline' : view?.slotPresent ? 'closed' : 'empty',
  };
}

function statusLines({
  target,
  bridge,
  backendName,
  config,
  scope,
}: KeyFaceInput): string[] {
  if (!target) return [bridge.selectionNotice ? 'Reselect' : 'Select', 'agent'];
  if (target.state === 'blocked') {
    if (target.kind === 'form') return ['Answer in', backendName];
    if (target.kind === 'auth') return ['Open browser'];
  }
  // Name the one thing to fix instead of a bare "Check Rex".
  const blocker =
    scope === 'rex'
      ? controlBlocker(target as AgentSnapshot, {
          visibleChecks: config.allowClipboardFocus === true,
          claudeEnabled: config.claude?.enabled === true,
        })
      : null;
  if (blocker) return ['Check ' + backendName, BLOCKER_TEXT[blocker].caption];
  const detail =
    target.app === 'claude-code'
      ? target.claudeError ||
        (!target.claudeControlsEnabled ? 'Enable Claude' : '')
      : target.kind === 'auth'
        ? 'Sign in'
        : '';
  return ['Check ' + backendName, detail];
}

function controlLines(input: KeyFaceInput): Record<string, string[]> {
  const { bridge, target, mode, offline, backendName, gaps, config } = input;
  return {
    collapse: [
      'Collapse',
      ...(offline
        ? [backendName + ' offline']
        : gaps
          ? [`${gaps} gap${gaps === 1 ? '' : 's'}`]
          : []),
    ],
    banknext: bankLines(bridge, input.bank, offline, backendName),
    next: ['Next agent'],
    attention: input.attention
      ? [
          ATTENTION_FACE[input.attention.kind].heading,
          `${input.attention.count} agent${input.attention.count === 1 ? '' : 's'}`,
        ]
      : [],
    model: modelLines(bridge),
    effort: effortLines(bridge),
    effortIncrease: ['Effort +'],
    effortDecrease: ['Effort −'],
    permissions: reviewerLines(bridge),
    plan: modeLines(bridge),
    interrupt: [
      'Interrupt',
      mode === 'working' && footerMissing(target) && !target?.rexSettings
        ? 'No footer ID'
        : mode === 'working'
          ? 'running'
          : 'not running',
    ],
    stopTerminals: ['Stop', `${target?.backgroundIds?.length || 0} terminals`],
    steer: ['Steer', 'typed text'],
    queue: ['Queue', 'typed text'],
    zoom: ['Zoom'],
    up: ['Up'],
    down: ['Down'],
    left: ['Left'],
    right: ['Right'],
    questionPrev: ['Shift+Tab', 'question'],
    questionNext: ['Tab', 'question'],
    answer: target?.claudePicker
      ? ['Apply', 'this session']
      : target?.claudeCheckboxList
        ? ['Review', 'answers']
        : target?.claudeQuestionReview
          ? ['Submit', 'answers']
          : ['Confirm', 'Enter'],
    escape: ['Esc', 'question'],
    approvalUp: ['Up', 'choice'],
    approvalDown: ['Down', 'choice'],
    approvalConfirm: ['Confirm', 'highlighted'],
    approvalEscape: ['Esc', 'choice'],
    review: ['Review', 'draft'],
    tests: ['Tests', 'draft'],
    continue: ['Continue', 'draft'],
    send: bridge.draft ? ['Send', bridge.draft.action] : ['Send', 'no draft'],
    none: [],
    claudeToggle: ['Toggle', 'Space'],
    claudeInfo: [
      'Claude Code',
      config.claude?.enabled
        ? 'Preview'
        : input.scope === 'rex'
          ? 'Enable keys'
          : 'Set up hooks',
    ],
    claudeModeInfo: modeLines(bridge),
    inputInfo: ['Use Herdr', 'keyboard'],
    status: statusLines(input),
  };
}

/** The surface colour of the Attention key: its top candidate's state colour. */
function attentionColor(input: KeyFaceInput, kind: AttentionKind): string {
  return input.config.palette[ATTENTION_FACE[kind].palette] || '#233a50';
}

function controlFace(input: KeyFaceInput): { lines: string[]; color: string } {
  const { action, target, mode, gaps, offline } = input;
  let color = '#233a50';
  let lines: string[] = controlLines(input)[action] || [action.toUpperCase()];
  if (action === 'attention' && input.attention)
    color = attentionColor(input, input.attention.kind);
  if (
    (action === 'collapse' && (offline || !gaps)) ||
    (action === 'interrupt' && mode !== 'working') ||
    action === 'none'
  )
    color = GREY;
  if (
    action === 'stopTerminals' ||
    (action === 'interrupt' && mode === 'working')
  )
    color = '#813c42';
  if (['steer', 'queue'].includes(action) && !target?.runId) {
    color = GREY;
    lines = [action === 'steer' ? 'Steer' : 'Queue', 'loading run'];
  }
  if (
    ['model', 'effort', 'permissions', 'plan', 'interrupt'].includes(action) &&
    footerMissing(target) &&
    !(
      target?.rexSettings &&
      ((rexSettingsAction(action) && mode === 'ready') ||
        (action === 'interrupt' && mode === 'working'))
    )
  )
    color = GREY;
  if (target?.rexSettings && rexSettingsAction(action) && mode === 'ready') {
    const settings = target.rexSettings as Record<string, unknown>;
    const value =
      settings[action] ||
      (action === 'effort' && settings.effortHidden && settings.process
        ? 'Press to cycle'
        : '');
    lines = [REX_HEADINGS[action], clean(value)];
  }
  if (action === 'effort' && target?.rexSettings?.effortSlider) {
    lines = ['Apply effort', clean(target.rexSettings.effort)];
  }
  if (action.startsWith('approval')) color = '#78551e';
  if (action === 'send' && input.bridge.draft) color = '#416428';
  if (
    (QUESTION_ONLY.includes(action) && mode !== 'question') ||
    (action === 'permissions' && mode !== 'ready')
  )
    color = GREY;
  const feedback = input.feedback;
  if (
    feedback &&
    feedback.action === action &&
    feedback.stamp === input.contextStamp &&
    input.now < feedback.until
  ) {
    lines = ['Unavailable', feedback.message];
    color = '#893748';
  }
  return { lines, color };
}

/**
 * Everything one key shows, as a value. Pure: no clock, no I/O, and the
 * inputs are only read.
 */
export function keyFace(input: KeyFaceInput): KeySpec {
  const { action } = input;
  const isAgent = action.startsWith('agent:');
  let icon: string = ICON_ALIASES[action] || action;
  let lines: string[];
  let color: string;
  let pulse = 0;
  let badge: '' | 'selected' = '';
  let state: AgentFaceState | undefined;
  if (isAgent) {
    const face = agentFace(input);
    ({ icon, lines, color, pulse, badge, state } = face);
  } else ({ lines, color } = controlFace(input));
  const attention = action === 'attention' ? input.attention : undefined;
  const notice = input.notice;
  if (
    action !== 'plan' &&
    !['effort', 'effortIncrease', 'effortDecrease'].includes(action) &&
    notice &&
    notice.action === action &&
    notice.stamp === input.contextStamp &&
    input.now < notice.until
  ) {
    lines = [NOTICE_HEADINGS[action] || 'Model', notice.label];
    color = '#2b654c';
  }
  const spec: KeySpec = {
    icon,
    lines,
    color,
    pulse,
    badge,
    accent:
      attention && color === attentionColor(input, attention.kind)
        ? ATTENTION_FACE[attention.kind].accent
        : controlAccent(action, color),
    style: input.config.appearance?.style || 'signal',
    textOnly:
      lines.length === 1 &&
      ['effortIncrease', 'effortDecrease', 'plan'].includes(action),
    agent: isAgent,
  };
  if (state) spec.state = state;
  if (!isAgent && action !== 'none' && color === GREY) spec.dim = true;
  if (input.hold) spec.hold = true;
  return spec;
}
