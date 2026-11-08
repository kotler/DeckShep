type DaemonRpc = import("./daemon").DaemonRpc;
type Setup = import("./setup-presets").Setup;
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const crypto = require('node:crypto');
const { readFooter, DaemonRpc, socketFor } = require('./daemon');
const { Setup } = require('./setup-presets');
const digest: (text: string) => string = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
function composerSnapshot(view: string, cursor: any, chatId: any, { allowEmpty = false }: Record<string, any> | undefined = {}) {
    const lines: string[] = view.split('\n'), footer: number = lines.findIndex((line: string) => new RegExp('^\\s{0,4}' + chatId + '\\s*·').test(line));
    const row: number = cursor.row - 1, column: number = cursor.column - 1;
    if (footer < 0 ||
        row < 0 ||
        row >= footer ||
        footer - row > 16 ||
        lines.slice(row + 1, footer).some((line: string) => line.trim()))
        throw Error('Native composer not visible');
    let regionStart: number = row;
    while (regionStart > 0 &&
        row - regionStart < 15 &&
        lines[regionStart - 1].trim())
        regionStart--;
    const starts: {
        index: number;
        match: RegExpExecArray | null;
    }[] = lines
        .map((line: string, index: number) => ({ index, match: /^(\s{0,4})› (.*)$/.exec(line) }))
        .filter((x: {
        index: number;
        match: RegExpExecArray | null;
    }) => x.match && x.index >= regionStart && x.index <= row);
    if (starts.length !== 1)
        throw Error('Native composer is ambiguous');
    const start: {
        index: number;
        match: RegExpExecArray | null;
    } = starts[0], prefix: number = ((start.match) as RegExpExecArray)[1].length + 2;
    if (column < 0)
        throw Error('Composer cursor unavailable');
    const before: string[] = lines.slice(start.index, row + 1);
    before[before.length - 1] = ((before.at(-1)) as string).slice(0, column);
    before[0] = before[0].slice(prefix);
    const text: string = before.join('\n').trim();
    if (!text && !allowEmpty)
        throw Error('Type a message first');
    if (/^[!\/]/.test(text) || /[\x00-\x08\x0b-\x1f\x7f]/.test(text))
        throw Error('Steer/Queue requires plain message text');
    return {
        chatId,
        hash: digest(lines.slice(start.index, footer).join('\n')),
        cursor: { row: cursor.row, column: cursor.column },
        empty: !text,
    };
}
async function composerView(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot, chatId: any, options: Record<string, any>) {
    const args: string[] = [
        'block',
        'call',
        '-s',
        agent.session,
        '-b',
        agent.block,
        'format',
        JSON.stringify({ format: 'vt', extra_cursor: true, max_bytes: 960000 }),
    ];
    const before: any = await bridge.run(args), cursor: RegExpExecArray | null = /\x1b\[(\d+);(\d+)H$/.exec(before?.content || '');
    if (before?.id || !cursor)
        throw Error('Composer cursor unavailable');
    const view: any = await new Setup(bridge).screen(agent), after: any = await bridge.run(args);
    if (after?.id ||
        typeof after?.content !== 'string' ||
        digest(before.content) !== digest(after.content))
        throw Error('Composer changed while reading');
    return composerSnapshot(view, { row: Number(cursor[1]), column: Number(cursor[2]) }, chatId, options);
}
interface NativeInputPorts {
    footer(bridge: Record<string, any>, agent: AgentSnapshot): Promise<string>;
    endpoint(pid: number): Promise<{ socket: string }>;
    open(socket: string): { connect(): Promise<unknown>; request(method: string, params: Record<string, unknown>): Promise<any>; close(): void };
}
const inputPorts: NativeInputPorts = { footer: readFooter, endpoint: socketFor, open: socket => new DaemonRpc(socket) };
async function readIdleComposer(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot, options: Record<string, any> | undefined = {}, ports: NativeInputPorts = inputPorts) {
    if (agent.app !== 'codex')
        throw Error('Draft verification supports Codex only');
    const chatId: any = await ports.footer(bridge, agent), endpoint: {
        socket: string;
    } = await ports.endpoint(agent.pid), rpc = ports.open(endpoint.socket);
    let turnStamp: any;
    try {
        await rpc.connect();
        const thread: any = (await rpc.request('thread/read', {
            threadId: chatId,
            includeTurns: false,
        }))?.thread;
        if (thread?.id !== chatId ||
            thread.cwd !== agent.cwd ||
            thread.status?.type !== 'idle')
            throw Error('Chat is not ready for Send');
        const result: any = await rpc.request('thread/turns/list', {
            threadId: chatId,
            limit: 1,
            sortDirection: 'desc',
            itemsView: 'notLoaded',
        });
        if (!Array.isArray(result?.data) || result.data.length > 1)
            throw Error('Latest-turn metadata unavailable');
        const turn: any = result.data[0];
        if (turn &&
            (typeof turn.id !== 'string' ||
                !['completed', 'interrupted', 'failed'].includes(turn.status) ||
                turn.itemsView !== 'notLoaded' ||
                !Array.isArray(turn.items) ||
                turn.items.length))
            throw Error('Chat turn changed');
        turnStamp = turn
            ? JSON.stringify([
                turn.id,
                turn.status,
                turn.startedAt ?? null,
                turn.completedAt ?? null,
            ])
            : 'no-turn';
    }
    finally {
        rpc.close();
    }
    const snapshot: {
        chatId: any;
        hash: string;
        cursor: {
            row: any;
            column: any;
        };
        empty: boolean;
    } = await composerView(bridge, agent, chatId, options);
    if ((await ports.footer(bridge, agent)) !== chatId)
        throw Error('Chat changed while reading');
    return { ...snapshot, turnStamp };
}
const sameComposer: (a: any, b: any) => boolean = (a: any, b: any) => a?.chatId === b?.chatId &&
    a?.hash === b?.hash &&
    a?.turnStamp === b?.turnStamp &&
    a?.cursor?.row === b?.cursor?.row &&
    a?.cursor?.column === b?.cursor?.column;
async function readComposer(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot, ports: NativeInputPorts = inputPorts) {
    const chatId: any = await ports.footer(bridge, agent);
    const endpoint: {
        socket: string;
    } = await ports.endpoint(agent.pid), rpc = ports.open(endpoint.socket);
    let runId: any;
    try {
        await rpc.connect();
        const thread: any = (await rpc.request('thread/read', {
            threadId: chatId,
            includeTurns: false,
        }))?.thread;
        if (thread?.id !== chatId ||
            thread.cwd !== agent.cwd ||
            thread.status?.type !== 'active' ||
            !Array.isArray(thread.status.activeFlags) ||
            thread.status.activeFlags.length)
            throw Error('Run is not accepting direct input');
        const turn: any = (await rpc.request('thread/turns/list', {
            threadId: chatId,
            limit: 1,
            sortDirection: 'desc',
            itemsView: 'notLoaded',
        }))?.data?.[0];
        if (turn?.status !== 'inProgress' ||
            turn.itemsView !== 'notLoaded' ||
            !Array.isArray(turn.items) ||
            turn.items.length ||
            typeof turn.id !== 'string')
            throw Error('Active turn metadata unavailable');
        runId = turn.id;
        const expected: any = bridge.actionContext?.target.runId;
        if (!expected || expected !== runId)
            throw Error('Run metadata changed; press again');
    }
    finally {
        rpc.close();
    }
    const vt: any = await bridge.run([
        'block',
        'call',
        '-s',
        agent.session,
        '-b',
        agent.block,
        'format',
        JSON.stringify({ format: 'vt', extra_cursor: true, max_bytes: 960000 }),
    ]);
    const cursor: RegExpExecArray | null = /\x1b\[(\d+);(\d+)H$/.exec(vt?.content || '');
    if (vt?.id || !cursor)
        throw Error('Composer cursor unavailable');
    const view: any = await new Setup(bridge).screen(agent);
    return {
        ...composerSnapshot(view, { row: Number(cursor[1]), column: Number(cursor[2]) }, chatId),
        runId,
    };
}
async function requestSnapshot(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot) {
    const view: any = await bridge.run([
        'block',
        'call',
        '-s',
        agent.session,
        '-b',
        agent.block,
        'format',
        JSON.stringify({ format: 'vt', extra_cursor: true, max_bytes: 960000 }),
    ]);
    if (view?.id || typeof view?.content !== 'string' || !view.content)
        throw Error('Approval view unavailable');
    return digest(view.content);
}
module.exports = {
    composerSnapshot,
    readComposer,
    readIdleComposer,
    sameComposer,
    requestSnapshot,
};

export {};
