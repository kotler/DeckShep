type AgentSnapshot = import("./types").AgentSnapshot;
type Config = import("./types").Config;
type PressContext = import("./types").PressContext;
function isBackground(agent: import("./types").AgentSnapshot | null | undefined) {
    return (agent?.app === 'codex' &&
        agent.state === 'working' &&
        agent.backgroundOnly === true &&
        typeof agent.statusAt === 'string' &&
        agent.activityStatusAt === agent.statusAt &&
        Array.isArray(agent.backgroundIds) &&
        agent.backgroundIds.length > 0 &&
        !!agent.backgroundTurnId);
}
function modeOf(agent: import("./types").AgentSnapshot | null | undefined) {
    if (!agent ||
        !['codex', 'claude-code'].includes(agent.app) || ((agent.backend === 'herdr' &&
        ((agent) as any).nativeVerified === false) as any) ||
        (agent.app === 'claude-code' &&
            (!(((agent) as any).nativeVerified) ||
                !(((agent) as any).claudeControlsEnabled))))
        return 'unknown';
    if (isBackground(agent))
        return 'background';
    if (['idle', 'done', 'error'].includes(((agent) as any).state))
        return 'ready';
    if (((agent) as any).state === 'working')
        return 'working';
    if (((agent) as any).state === 'blocked' &&
        ((agent) as any).kind === 'question')
        return 'question';
    if (((agent) as any).state === 'blocked' &&
        ((agent) as any).kind === 'permission')
        return 'approval';
    return 'unknown';
}
function homeRow(agent: import("./types").AgentSnapshot | null | undefined, capabilities?: ReadonlySet<string> | undefined) {
    switch (modeOf(agent)) {
        case 'ready':
            return [
                'model',
                'effort',
                'zoom',
                ((agent) as any).app === 'claude-code'
                    ? 'claudeModeInfo'
                    : 'plan',
                'interrupt',
            ];
        case 'working':
            return (capabilities ? !capabilities.has('composerCursor') : ((agent) as any).composerSupported === false)
                ? ['none', 'none', 'zoom', 'none', 'interrupt']
                : ['steer', 'queue', 'zoom', 'none', 'interrupt'];
        case 'background':
            return ['none', 'none', 'zoom', 'none', 'stopTerminals'];
        case 'question':
            return [
                'up',
                'down',
                'answer',
                'escape',
                ((agent) as any).app === 'claude-code' &&
                    ((agent) as any).claudeMultiSelect
                    ? 'claudeToggle'
                    : 'interrupt',
            ];
        case 'approval':
            return [
                'approvalUp',
                'approvalDown',
                'approvalConfirm',
                'approvalEscape',
                'interrupt',
            ];
        case 'unknown':
        default:
            return ['status', 'none', 'zoom', 'none', 'interrupt'];
    }
}
function layout(page: number, agent: import("./types").AgentSnapshot | null | undefined, capabilities?: ReadonlySet<string> | undefined) {
    const stop: "stopTerminals" | "claudeToggle" | "interrupt" = isBackground(agent)
        ? 'stopTerminals'
        : agent?.app === 'claude-code' &&
            agent.kind === 'question' &&
            agent.claudeMultiSelect
            ? 'claudeToggle'
            : 'interrupt';
    if (page === 1)
        return [
            'questionPrev',
            'up',
            'questionNext',
            'answer',
            'more',
            'left',
            'down',
            'right',
            'escape',
            stop,
        ];
    if (page === 2 && (capabilities ? !capabilities.has('composerCursor') : agent?.composerSupported === false))
        return [
            'inputInfo',
            'none',
            'none',
            'none',
            'more',
            'none',
            'none',
            'zoom',
            'none',
            stop,
        ];
    if (page === 2)
        return [
            'review',
            'tests',
            'continue',
            'send',
            'more',
            'none',
            'none',
            'zoom',
            'none',
            stop,
        ];
    return [
        'collapse',
        'banknext',
        'next',
        agent?.app === 'claude-code' ? 'claudeInfo' : 'permissions',
        'more',
        ...homeRow(agent, capabilities),
    ];
}
const localActions: Set<string> = new Set([
    'none',
    'status',
    'inputInfo',
    'claudeInfo',
    'claudeModeInfo',
    'more',
    'questions',
    'prompts',
    'back',
    'collapse',
    'banknext',
    'next',
]);
function needsContext(action: string) {
    return !localActions.has(action) && !action.startsWith('agent:');
}
function needsChat(action: string, target: import("./types").AgentSnapshot | null | undefined) {
    return target?.state !== 'blocked' && action !== 'zoom';
}
module.exports = { isBackground, modeOf, homeRow, layout, needsContext, needsChat, localActions };

export {};
