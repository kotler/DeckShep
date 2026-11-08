type AgentSnapshot = import("../domain/types").AgentSnapshot;
type Config = import("../domain/types").Config;
type PressContext = import("../domain/types").PressContext;
'use strict';
const { isBackground, modeOf, homeRow, layout, needsContext, needsChat } = require('../domain/layout');
const actor: (a: import("../domain/types").TargetRef | null | undefined) => string | null | undefined = (a: import("../domain/types").TargetRef | null | undefined) => a &&
    [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
function stamp(agent: import("../domain/types").AgentSnapshot | null | undefined, page: number | undefined = 0) {
    return JSON.stringify([
        actor(agent),
        modeOf(agent),
        agent?.state === 'blocked' ? agent.statusAt : null,
        agent?.chatId || null,
        agent?.runId || null,
        agent?.nativeIdentity || null,
        agent?.claudeUiEpoch || 0,
        page,
        ...(isBackground(agent)
            ? [
                ((agent) as any).backgroundTurnId,
                ((agent) as any).backgroundIds,
            ]
            : []),
    ]);
}
function snapshot(agent: import("../domain/types").AgentSnapshot | null | undefined) {
    if (!agent)
        return null;
    return Object.fromEntries([
        'session',
        'window',
        'block',
        'terminalId',
        'backend',
        'composerSupported',
        'pid',
        'name',
        'app',
        'cwd',
        'state',
        'kind',
        'statusAt',
        'chatId',
        'nativeVerified',
        'nativeIdentity',
        'runId',
        'backgroundOnly',
        'backgroundIds',
        'backgroundTurnId',
        'activityStatusAt',
        'claudeControlsEnabled',
        'claudeUiEpoch',
        'claudeTurnId',
        'claudeRequestId',
        'claudePicker',
        'claudeMultiSelect',
        'claudeCheckboxList',
        'claudeQuestionReview',
        'permissionMode',
        'vimMode',
        'atBottom',
    ]
        .filter((k: string) => ((agent) as Record<string, any>)[k] !== undefined)
        .map((k: string) => [
        k,
        Array.isArray(((agent) as Record<string, any>)[k])
            ? [...((agent) as Record<string, any>)[k]]
            : ((agent) as Record<string, any>)[k],
    ]));
}
function assertContext(context: Partial<import("../domain/types").PressContext> | null | undefined, current: import("../domain/types").AgentSnapshot | null | undefined) {
    const target: import("../domain/types").AgentSnapshot | null | undefined = context?.target;
    if (!target || actor(target) !== actor(current)) {
        const error: Error = Error('Reselect agent on deck');
        ((error) as any).code = 'SELECTION_CHANGED';
        throw error;
    }
    if (context!.action !== 'zoom' &&
        target.app === 'claude-code' &&
        (!(((current) as any).nativeVerified) ||
            target.chatId !== ((current) as any).chatId ||
            target.nativeIdentity !== ((current) as any).nativeIdentity ||
            (target.runId && target.runId !== ((current) as any).runId))) {
        const error: Error = Error('Claude session changed; reselect');
        ((error) as any).code = 'SELECTION_CHANGED';
        throw error;
    }
    if (context!.action !== 'zoom' &&
        target.app === 'claude-code' &&
        (!(((current) as any).claudeControlsEnabled) ||
            target.claudeUiEpoch !== ((current) as any).claudeUiEpoch))
        throw Error('Claude controls updating; press again');
    const background: boolean = isBackground(target) &&
        ((current) as any).state === 'working' &&
        target.statusAt === ((current) as any).statusAt;
    if (!background && modeOf(target) !== modeOf(current))
        throw Error('Agent state changed; press again');
    if (target.state === 'blocked' &&
        (!target.statusAt ||
            target.statusAt !== ((current) as any).statusAt ||
            target.kind !== ((current) as any).kind))
        throw Error('Waiting request changed; press again');
}
module.exports = {
    isBackground,
    modeOf,
    actor,
    stamp,
    snapshot,
    assertContext,
    homeRow,
    layout,
    needsContext,
    needsChat,
};

export {};
