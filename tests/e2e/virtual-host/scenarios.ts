import type { AgentSnapshot } from '../../../src/domain/types';
import type {
  AppPaneStatus,
  AppPaneRef,
} from '../../../src/domain/app-selection';

export const scenarioNames = [
  'idle-two-codex',
  'working-rex',
  'question',
  'approval',
  'background-terminals',
  'closed-slot',
  'overflow-banks',
  'claude-mixed',
  'herdr-tui',
  'offline',
  'herdr-app-panes',
] as const;
export type ScenarioName = (typeof scenarioNames)[number];
export interface Scenario {
  agents: AgentSnapshot[];
  focused: string;
  offline?: boolean;
  slots?: { session: string; block: string }[];
  app?: { panes: AppPaneStatus[]; selected: AppPaneRef | null; epoch: number };
}
// Identity/state fields follow plugin-harness and the running/background fixtures.
// These synthetic records never come from a process, account or workspace.
function agent(block: string, index: number): AgentSnapshot {
  return {
    session: 'fixture',
    window: 'window-' + block,
    block,
    pid: 4200 + index,
    app: 'codex',
    name: 'codex',
    state: 'idle',
    chatId: 'chat-' + block,
    statusAt: 'request-1',
    project: 'Fixture ' + block,
    chatName: 'Chat ' + block,
    model: 'fixture-model',
    effort: 'medium',
    nativeVerified: true,
    nativeIdentity: 'identity-' + block,
    atBottom: true,
  };
}
export function scenario(input: ScenarioName | Scenario): Scenario {
  if (typeof input !== 'string') {
    if (
      !input ||
      !Array.isArray(input.agents) ||
      typeof input.focused !== 'string'
    )
      throw Error('Invalid fixture scenario');
    return structuredClone(input);
  }
  if (!scenarioNames.includes(input)) throw Error('Unknown fixture scenario');
  if (input === 'herdr-app-panes') {
    const panes: AppPaneStatus[] = Array.from({ length: 7 }, (_, index) => ({
      target: {
        space: 's1',
        tab: 'c1',
        pane: 'p' + (index + 1),
        terminal: 't' + (index + 1),
      },
      reportedApp: index === 1 ? 'claude-code' : 'codex',
      reportedStatus: index === 0 ? 'working' : 'idle',
      name: 'Pane ' + (index + 1),
    }));
    return {
      agents: [],
      focused: '',
      app: { panes, selected: panes[0].target, epoch: 1 },
    };
  }
  const agents = ['a', 'b'].map(agent);
  if (input === 'working-rex' || input === 'herdr-tui')
    Object.assign(agents[0], { state: 'working', runId: 'turn-1' });
  if (input === 'question' || input === 'approval')
    Object.assign(agents[0], {
      state: 'blocked',
      kind: input === 'question' ? 'question' : 'permission',
    });
  if (input === 'background-terminals')
    Object.assign(agents[0], {
      state: 'working',
      backgroundOnly: true,
      backgroundIds: ['terminal-1', 'terminal-2'],
      backgroundTurnId: 'turn-1',
      activityStatusAt: 'request-1',
    });
  if (input === 'overflow-banks')
    for (let index = 2; index < 7; index++)
      agents.push(agent(String.fromCharCode(97 + index), index));
  if (input === 'claude-mixed')
    Object.assign(agents[1], {
      app: 'claude-code',
      name: 'claude',
      nativeIdentity: 'claude-fixture',
      claudeUiEpoch: 1,
      claudeViewHash: 'fixture-view',
      permissionMode: 'default',
    });
  const result: Scenario = {
    agents,
    focused: 'a',
    offline: input === 'offline',
  };
  if (input === 'closed-slot')
    result.slots = [
      { session: 'fixture', block: 'a' },
      { session: 'fixture', block: 'closed' },
      { session: 'fixture', block: 'b' },
    ];
  return result;
}
