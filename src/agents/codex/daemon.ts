const boundary = require('../../schemas');
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { execFile } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const WebSocket = require('ws');
const UUID: "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pause: (ms: number) => Promise<any> = (ms: number) => new Promise((resolve: (value: any) => void) => setTimeout(resolve, ms));
const permissionVersionVerified: (version: string) => boolean = (version: string) => ['0.166.0', '0.167.0'].includes(version);
function socketFromListing(listing: string, pid: number) {
    const rows: ({
        pid: number;
        address: string;
        name: string;
    } | null)[] = listing
        .split('\n')
        .map((line: string) => {
        const m: RegExpExecArray | null = /^codex\s+(\d+)\s+\S+\s+\S+\s+unix\s+(0x[0-9a-f]+)\s+\S+\s+(.+)$/.exec(line);
        return m ? { pid: Number(m[1]), address: m[2], name: m[3].trim() } : null;
    })
        .filter(Boolean);
    const peers: Set<string> = new Set(rows
        .filter((r: {
        pid: number;
        address: string;
        name: string;
    } | null) => ((r) as {
        pid: number;
        address: string;
        name: string;
    }).pid === pid &&
        /^->0x[0-9a-f]+$/.test(((r) as {
            pid: number;
            address: string;
            name: string;
        }).name))
        .map((r: {
        pid: number;
        address: string;
        name: string;
    } | null) => ((r) as {
        pid: number;
        address: string;
        name: string;
    }).name.slice(2)));
    const found: ({
        pid: number;
        address: string;
        name: string;
    } | null)[] = rows.filter((r: {
        pid: number;
        address: string;
        name: string;
    } | null) => peers.has(((r) as {
        pid: number;
        address: string;
        name: string;
    }).address) &&
        path.isAbsolute(((r) as {
            pid: number;
            address: string;
            name: string;
        }).name));
    const unique: {
        pid: number;
        socket: string;
    }[] = [
        ...new Map(found.map((r: {
            pid: number;
            address: string;
            name: string;
        } | null) => [
            ((r) as {
                pid: number;
                address: string;
                name: string;
            }).pid +
                '|' +
                ((r) as {
                    pid: number;
                    address: string;
                    name: string;
                }).name,
            {
                pid: ((r) as {
                    pid: number;
                    address: string;
                    name: string;
                }).pid,
                socket: ((r) as {
                    pid: number;
                    address: string;
                    name: string;
                }).name,
            },
        ])).values(),
    ];
    if (unique.length !== 1)
        throw Error('CLI daemon connection unavailable or ambiguous');
    return unique[0];
}
function safeSocket(file: string) {
    const uid: number = ((process.getuid) as () => number)(), parent: import("node:fs").Stats = fs.lstatSync(path.dirname(file)), socket: import("node:fs").Stats = fs.lstatSync(file);
    if (!parent.isDirectory() ||
        parent.uid !== uid ||
        parent.mode & 0o022 ||
        !socket.isSocket() ||
        socket.uid !== uid ||
        socket.mode & 0o077)
        throw Error('Unsafe CLI daemon socket');
}
async function socketFor(pid: number) {
    const listing: any = await new Promise((resolve: (value: any) => void, reject: (reason?: any) => void) => execFile('/usr/sbin/lsof', [
        '-n',
        '-a',
        '-U',
        '-u',
        String(((process.getuid) as () => number)()),
    ], { timeout: 4000, maxBuffer: 4e6 }, (error: import("child_process").ExecFileException | null, out: string) => error
        ? reject(Error('Cannot inspect CLI daemon connection'))
        : resolve(out)));
    const endpoint: {
        pid: number;
        socket: string;
    } = socketFromListing(listing, pid);
    safeSocket(endpoint.socket);
    return endpoint;
}
function footerId(view: string, cursorRow: number) {
    const lines: string[] = view.split('\n'), nonempty: {
        text: string;
        row: number;
    }[] = lines
        .map((text: string, index: number) => ({ text, row: index + 1 }))
        .filter((l: {
        text: string;
        row: number;
    }) => l.text.trim());
    const candidates: {
        row: number;
        match: RegExpExecArray | null;
    }[] = nonempty
        .slice(-2)
        .map((l: {
        text: string;
        row: number;
    }) => ({
        row: l.row,
        match: new RegExp('^\\s{0,4}(' + UUID + ')\\s*·\\s*(?:GPT-|gpt-).*$', 'i').exec(l.text),
    }))
        .filter((l: {
        row: number;
        match: RegExpExecArray | null;
    }) => l.match);
    if (candidates.length !== 1 ||
        !Number.isInteger(cursorRow) ||
        candidates[0].row < cursorRow + 2)
        throw Error('Session-ID footer missing; run daemon setup');
    return ((candidates[0].match) as RegExpExecArray)[1].toLowerCase();
}
async function readFooter(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot) {
    if (bridge.backend === 'herdr')
        return bridge.nativeChatId(agent);
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
    const deadline: number = Date.now() + 4000;
    for (let attempt: number = 0; attempt < 40; attempt++) {
        const before: any = await bridge.run(args);
        if (before?.id || typeof before?.content !== 'string')
            throw Error('Terminal metadata incomplete');
        const cursor: RegExpExecArray | null = /\x1b\[(\d+);(\d+)H$/.exec(before.content);
        if (!cursor)
            throw Error('Terminal cursor metadata unavailable');
        const view: any = await new (require('./setup-presets').Setup)(bridge).screen(agent), after: any = await bridge.run(args);
        if (after?.id || typeof after?.content !== 'string')
            throw Error('Terminal metadata incomplete');
        if (before.content === after.content) {
            try {
                return footerId(view, Number(cursor[1]));
            }
            catch { }
        }
        if (Date.now() >= deadline)
            break;
        if (attempt < 39)
            await pause(100);
    }
    throw Error('Session footer unavailable; check Rex');
}
class DaemonRpc {
    declare ws: any;
    declare pending: Map<any, any>;
    declare nextId: number;
    declare watchedSettings: Set<any>;
    declare settingsByThread: Map<any, any>;
    declare settingsSequence: number;
    declare opened: Promise<any>;
    declare serverVersion: string | null | undefined;
    constructor(socket: any, makeSocket: any = () => new WebSocket('ws://localhost/', {
        createConnection: () => net.createConnection(socket),
        handshakeTimeout: 3000,
        maxPayload: 4e6,
        perMessageDeflate: false,
    })) {
        this.ws = makeSocket();
        this.pending = new Map();
        this.nextId = 0;
        this.watchedSettings = new Set();
        this.settingsByThread = new Map();
        this.settingsSequence = 0;
        this.opened = new Promise((resolve: (value: any) => void, reject: (reason?: any) => void) => {
            this.ws.once('open', resolve);
            this.ws.once('error', () => reject(Error('CLI daemon unavailable')));
        });
        this.ws.on('message', (raw: any) => {
            let message: any;
            try {
                message = boundary.parse('daemonFrame', raw.toString());
            }
            catch {
                return this.fail();
            }
            if (message.method === 'thread/settings/updated' &&
                this.watchedSettings.has(message.params?.threadId)) {
                let state: any = null;
                try {
                    state = permissionSnapshot(message.params.threadSettings, false);
                }
                catch { }
                this.settingsByThread.set(message.params.threadId, {
                    state,
                    sequence: ++this.settingsSequence,
                });
                return;
            }
            if (message.method ||
                (!Object.hasOwn(message, 'result') &&
                    !Object.hasOwn(message, 'error')))
                return;
            const p: any = this.pending.get(message.id);
            if (!p)
                return;
            this.pending.delete(message.id);
            clearTimeout(p.timer);
            if (message.error) {
                const error: Error = Error('CLI daemon rejected ' + p.method);
                ((error) as any).code = 'DAEMON_REJECTED';
                if (String(message.error.message).startsWith('no rollout found for thread id '))
                    ((error) as any).kind = 'NO_ROLLOUT';
                p.reject(error);
            }
            else
                p.resolve(message.result);
        });
        this.ws.on('error', () => this.fail());
        this.ws.on('close', () => this.fail());
    }
    fail() {
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(Error('CLI daemon disconnected; verify any requested change'));
        }
        this.pending.clear();
    }
    async connect() {
        await this.opened;
        const initialized: any = await this.request('initialize', {
            clientInfo: {
                name: 'agent_switchboard',
                title: 'Agent Switchboard',
                version: '1.3.4',
            },
            capabilities: { experimentalApi: true },
        });
        this.serverVersion =
            /^[^\s/]+\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(initialized?.userAgent || '')?.[1] || null;
        this.ws.send(JSON.stringify({ method: 'initialized', params: {} }));
    }
    request(method: string, params: any) {
        if (![
            'initialize',
            'thread/loaded/list',
            'thread/read',
            'thread/turns/list',
            'thread/resume',
            'model/list',
            'thread/settings/update',
            'thread/backgroundTerminals/list',
            'thread/backgroundTerminals/terminate',
        ].includes(method))
            return Promise.reject(Error('Unsupported daemon method'));
        if (method.startsWith('thread/backgroundTerminals/')) {
            const keys: string = Object.keys(params || {})
                .sort()
                .join(','), validId: boolean = new RegExp('^' + UUID + '$', 'i').test(params?.threadId);
            const list: boolean = method.endsWith('/list') &&
                validId &&
                ['limit,threadId', 'cursor,limit,threadId'].includes(keys) &&
                params.limit === 100 &&
                (!Object.hasOwn(params, 'cursor') ||
                    (typeof params.cursor === 'string' && params.cursor.length > 0));
            const terminate: boolean = method.endsWith('/terminate') &&
                validId &&
                keys === 'processId,threadId' &&
                typeof params.processId === 'string' &&
                params.processId.length > 0 &&
                params.processId.length <= 256 &&
                !/[\x00-\x1f\x7f]/.test(params.processId);
            if (!list && !terminate)
                return Promise.reject(Error('Only scoped background-terminal requests are allowed'));
        }
        if (method === 'thread/turns/list' &&
            (!params ||
                Object.keys(params).sort().join(',') !==
                    'itemsView,limit,sortDirection,threadId' ||
                params.itemsView !== 'notLoaded' ||
                params.limit !== 1 ||
                params.sortDirection !== 'desc' ||
                !new RegExp('^' + UUID + '$', 'i').test(params.threadId)))
            return Promise.reject(Error('Only latest-turn metadata reads are allowed'));
        if (method === 'thread/resume' &&
            (!params ||
                Object.keys(params).sort().join(',') !== 'excludeTurns,threadId' ||
                params.excludeTurns !== true ||
                !new RegExp('^' + UUID + '$', 'i').test(params.threadId)))
            return Promise.reject(Error('Only metadata-only settings subscriptions are allowed'));
        if (method === 'thread/settings/update') {
            const keys: string = Object.keys(params || {})
                .sort()
                .join(',');
            const model: any = keys === 'model,threadId' &&
                typeof params.model === 'string' &&
                params.model;
            const reviewer: boolean = keys === 'approvalsReviewer,threadId' &&
                ['user', 'auto_review'].includes(params.approvalsReviewer);
            const effort: boolean = keys === 'effort,threadId' &&
                typeof params.effort === 'string' &&
                /^[a-z][a-z0-9_]{0,31}$/.test(params.effort);
            if (!model && !reviewer && !effort)
                return Promise.reject(Error('Only explicit model, effort or reviewer updates are allowed'));
        }
        if (this.ws.readyState !== 1)
            return Promise.reject(Error('CLI daemon is offline'));
        const id: number = ++this.nextId;
        return new Promise((resolve: (value: any) => void, reject: (reason?: any) => void) => {
            const timer: NodeJS.Timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(Error('CLI daemon timeout; verify any requested change'));
            }, 4000);
            this.pending.set(id, { resolve, reject, timer, method });
            try {
                this.ws.send(JSON.stringify({ id, method, params }));
            }
            catch {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(Error('CLI daemon write failed'));
            }
        });
    }
    watchSettings(id: any) {
        this.watchedSettings.add(id);
        return this.settingsSequence;
    }
    latestSettings(id: any) {
        return this.settingsByThread.get(id) || null;
    }
    close() {
        this.fail();
        this.watchedSettings.clear();
        this.settingsByThread.clear();
        this.ws.terminate();
    }
}
function permissionSnapshot(raw: any, resumed: any) {
    if (!raw ||
        !['user', 'auto_review'].includes(raw.approvalsReviewer) ||
        typeof raw.model !== 'string' ||
        typeof raw.cwd !== 'string' ||
        !raw.approvalPolicy)
        throw Error('Reviewer settings unavailable');
    const sandbox: any = resumed ? raw.sandbox : raw.sandboxPolicy, effort: any = resumed ? raw.reasoningEffort : raw.effort;
    if (!sandbox ||
        typeof sandbox.type !== 'string' ||
        !Array.isArray(raw.disabledPluginIds) ||
        !Object.hasOwn(raw, 'activePermissionProfile') ||
        !Object.hasOwn(raw, 'collaborationMode') ||
        !Object.hasOwn(raw, 'serviceTier'))
        throw Error('Incomplete permission boundaries');
    return structuredClone({
        reviewer: raw.approvalsReviewer,
        model: raw.model,
        modelProvider: raw.modelProvider,
        effort,
        cwd: raw.cwd,
        approvalPolicy: raw.approvalPolicy,
        sandboxPolicy: sandbox,
        activePermissionProfile: raw.activePermissionProfile,
        collaborationMode: raw.collaborationMode,
        serviceTier: raw.serviceTier,
        disabledPluginIds: raw.disabledPluginIds,
        multiAgentMode: raw.multiAgentMode,
    });
}
function sameOtherSettings(a: any, b: any) {
    const { reviewer: ignoredA, ...left } = a, { reviewer: ignoredB, ...right } = b;
    return isDeepStrictEqual(left, right);
}
async function readPermissionSettings(rpc: Record<string, any>, id: any) {
    if (!permissionVersionVerified(rpc.serverVersion))
        throw Error('Settings daemon version not verified');
    const before: {
        id: any;
        model: any;
        effort: any;
        cwd: any;
    } = await loadedThread(rpc, id), sequence: any = rpc.watchSettings(id);
    let result: any;
    try {
        result = await rpc.request('thread/resume', {
            threadId: id,
            excludeTurns: true,
        });
    }
    catch (error: unknown) {
        if (((error) as any).kind ===
            'NO_ROLLOUT')
            throw Error('Settings need completed chat history');
        throw error;
    }
    if (result?.thread?.id !== id ||
        !Array.isArray(result.thread.turns) ||
        result.thread.turns.length)
        throw Error('Unexpected settings subscription response');
    const event: any = rpc.latestSettings(id), state: any = event && event.sequence > sequence
        ? event.state
        : permissionSnapshot(result, true);
    if (!state)
        throw Error('Invalid live permission settings');
    const after: {
        id: any;
        model: any;
        effort: any;
        cwd: any;
    } = await loadedThread(rpc, id);
    if (!isDeepStrictEqual(before, after) ||
        state.model !== after.model ||
        state.effort !== after.effort ||
        state.cwd !== after.cwd)
        throw Error('Settings changed while subscribing');
    return state;
}
async function loadedThread(rpc: Record<string, any>, id: any) {
    let cursor: any = null, found: boolean = false;
    for (let page: number = 0; page < 20; page++) {
        const list: any = await rpc.request('thread/loaded/list', {
            limit: 100,
            ...(cursor ? { cursor } : {}),
        });
        if (!Array.isArray(list?.data))
            throw Error('Invalid loaded-thread metadata');
        if (list.data.includes(id)) {
            found = true;
            break;
        }
        cursor = list.nextCursor;
        if (!cursor)
            break;
    }
    if (!found)
        throw Error('Current chat is not loaded in this daemon');
    const result: any = await rpc.request('thread/read', {
        threadId: id,
        includeTurns: false,
    }), t: any = result?.thread;
    if (t?.id !== id ||
        typeof t.model !== 'string' ||
        typeof t.cwd !== 'string' ||
        t.status?.type !== 'idle')
        throw Error('Current chat is unavailable or busy');
    return { id: t.id, model: t.model, effort: t.reasoningEffort, cwd: t.cwd };
}
async function availableModels(rpc: Record<string, any>, include: string[] | undefined = []) {
    let cursor: any = null, all: any[] = [];
    for (let page: number = 0; page < 10; page++) {
        const list: any = await rpc.request('model/list', {
            limit: 100,
            includeHidden: false,
            ...(cursor ? { cursor } : {}),
        });
        if (!Array.isArray(list?.data))
            throw Error('Invalid daemon model catalog');
        all.push(...list.data
            .filter((m: any) => m.hidden === false &&
            /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(m.model) &&
            Array.isArray(m.supportedReasoningEfforts))
            .map((m: any) => ({
            id: m.model,
            label: m.displayName || m.model,
            efforts: m.supportedReasoningEfforts.map((e: any) => e.reasoningEffort),
        })));
        cursor = list.nextCursor;
        if (!cursor)
            break;
        if (page === 9)
            throw Error('Model catalog incomplete');
    }
    const models: any[] = include.length
        ? include.map((id: string) => all.find((m: any) => m.id === id)).filter(Boolean)
        : all;
    if (!models.length || new Set(models.map((m: any) => m.id)).size !== models.length)
        throw Error('No unique available models');
    return models;
}
function nextModel(current: any, models: any) {
    const compatible: any = models.filter((m: any) => current.effort == null || m.efforts.includes(current.effort));
    if (!compatible.length)
        throw Error('No model supports the current effort');
    const i: any = compatible.findIndex((m: any) => m.id === current.model);
    return compatible[(i + 1) % compatible.length];
}
function nextEffort(current: any, models: any) {
    const levels: any = models.find((m: any) => m.id === current.model)?.efforts;
    if (!levels?.length ||
        levels.some((e: any) => typeof e !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(e)) ||
        new Set(levels).size !== levels.length)
        throw Error('Supported effort levels unavailable');
    const index: any = levels.indexOf(current.effort);
    if (index < 0)
        throw Error('Current effort unavailable; check Codex');
    return levels[(index + 1) % levels.length];
}
function sameExceptEffort(before: any, after: any, target: any) {
    const expected: any = structuredClone(before);
    expected.effort = target;
    if (expected.collaborationMode?.settings)
        expected.collaborationMode.settings.reasoning_effort = target;
    return isDeepStrictEqual(expected, after);
}
class DaemonControls {
    declare b: Record<string, any>;
    declare socketFor: any;
    declare footer: any;
    declare connect: any;
    constructor(bridge: Record<string, any>, dependencies: any = {}) {
        this.b = bridge;
        this.socketFor = dependencies.socketFor || socketFor;
        this.footer = dependencies.footer || readFooter;
        this.connect =
            dependencies.connect || ((async (endpoint: {
                socket: string;
            }) => {
                const rpc: DaemonRpc = new DaemonRpc(endpoint.socket);
                try {
                    await rpc.connect();
                    return rpc;
                }
                catch (e: unknown) {
                    rpc.close();
                    throw e;
                }
            }) as (endpoint: {
                socket: string;
            }) => Promise<DaemonRpc>);
    }
    async cycleEffort(agent: import("../../domain/types").AgentSnapshot) {
        const endpoint: any = await this.socketFor(agent.pid), rpc: any = await this.connect(endpoint);
        try {
            const id: any = await this.footer(this.b, agent), current: any = await readPermissionSettings(rpc, id);
            if (current.cwd !== agent.cwd)
                throw Error('Pane and daemon directory mismatch');
            const target: any = nextEffort(current, await availableModels(rpc));
            await this.b.checked(agent, true);
            const latest: any = await this.socketFor(agent.pid);
            if (latest.pid !== endpoint.pid ||
                latest.socket !== endpoint.socket ||
                (await this.footer(this.b, agent)) !== id)
                throw Error('Pane, chat or daemon changed');
            if (!isDeepStrictEqual(await readPermissionSettings(rpc, id), current))
                throw Error('Chat settings changed; press again');
            const sequence: any = rpc.settingsSequence;
            await this.b.deliverMutation(agent, 'thread/settings/update', () => rpc.request('thread/settings/update', {
                threadId: id,
                effort: target,
            }));
            let confirmed: any;
            for (let i: number = 0; i < 15; i++) {
                const event: any = rpc.latestSettings(id);
                if (event && event.sequence > sequence) {
                    confirmed = event.state;
                    break;
                }
                await pause(100);
            }
            confirmed ??= await readPermissionSettings(rpc, id);
            if (!confirmed || !sameExceptEffort(current, confirmed, target))
                throw Error('Effort or preserved settings unconfirmed; check Codex');
            this.b.lastEffort = {
                session: agent.session,
                block: agent.block,
                pid: agent.pid,
                ...(agent.terminalId ? { terminalId: agent.terminalId } : {}),
                ...(agent.nativeIdentity
                    ? { nativeIdentity: agent.nativeIdentity }
                    : {}),
                chatId: id,
                effort: target,
                at: Date.now(),
            };
            return { kind: 'effort', label: target };
        }
        finally {
            rpc.close();
        }
    }
    async cycle(agent: import("../../domain/types").AgentSnapshot) {
        const endpoint: any = await this.socketFor(agent.pid), rpc: any = await this.connect(endpoint);
        try {
            const id: any = await this.footer(this.b, agent), current: {
                id: any;
                model: any;
                effort: any;
                cwd: any;
            } = await loadedThread(rpc, id);
            if (current.cwd !== agent.cwd)
                throw Error('Pane and daemon directory mismatch');
            const models: any[] = await availableModels(rpc, this.b.config.modelDiscovery?.include || []), chosen: any = nextModel(current, models);
            await this.b.checked(agent, true);
            const latestEndpoint: any = await this.socketFor(agent.pid);
            if (latestEndpoint.pid !== endpoint.pid ||
                latestEndpoint.socket !== endpoint.socket ||
                (await this.footer(this.b, agent)) !== id)
                throw Error('Pane, chat or daemon changed');
            const latest: {
                id: any;
                model: any;
                effort: any;
                cwd: any;
            } = await loadedThread(rpc, id);
            if (JSON.stringify(latest) !== JSON.stringify(current))
                throw Error('Chat settings changed; press again');
            await this.b.deliverMutation(agent, 'thread/settings/update', () => rpc.request('thread/settings/update', {
                threadId: id,
                model: chosen.id,
            }));
            for (let i: number = 0; i < 10; i++) {
                const confirmed: {
                    id: any;
                    model: any;
                    effort: any;
                    cwd: any;
                } = await loadedThread(rpc, id);
                if (confirmed.model === chosen.id &&
                    confirmed.effort === current.effort) {
                    this.b.lastModel = {
                        session: agent.session,
                        block: agent.block,
                        pid: agent.pid,
                        ...(agent.terminalId ? { terminalId: agent.terminalId } : {}),
                        ...(agent.nativeIdentity
                            ? { nativeIdentity: agent.nativeIdentity }
                            : {}),
                        chatId: id,
                        model: chosen.id,
                        at: Date.now(),
                    };
                    return { kind: 'model', label: chosen.label };
                }
                await pause(100);
            }
            throw Error('Model change unconfirmed; check Codex');
        }
        finally {
            rpc.close();
        }
    }
    async cyclePermissions(agent: import("../../domain/types").AgentSnapshot) {
        const endpoint: any = await this.socketFor(agent.pid), rpc: any = await this.connect(endpoint);
        try {
            if (!permissionVersionVerified(rpc.serverVersion))
                throw Error('Settings daemon version not verified');
            const id: any = await this.footer(this.b, agent), current: any = await readPermissionSettings(rpc, id);
            if (current.cwd !== agent.cwd)
                throw Error('Pane and daemon directory mismatch');
            const target: "user" | "auto_review" = current.reviewer === 'user' ? 'auto_review' : 'user';
            await this.b.checked(agent, true);
            const latestEndpoint: any = await this.socketFor(agent.pid);
            if (latestEndpoint.pid !== endpoint.pid ||
                latestEndpoint.socket !== endpoint.socket ||
                (await this.footer(this.b, agent)) !== id)
                throw Error('Pane, chat or daemon changed');
            if (!isDeepStrictEqual(await readPermissionSettings(rpc, id), current))
                throw Error('Chat settings changed; press again');
            const sequence: any = rpc.settingsSequence;
            await this.b.deliverMutation(agent, 'thread/settings/update', () => rpc.request('thread/settings/update', {
                threadId: id,
                approvalsReviewer: target,
            }));
            let confirmed: any;
            for (let i: number = 0; i < 15; i++) {
                const event: any = rpc.latestSettings(id);
                if (event && event.sequence > sequence) {
                    confirmed = event.state;
                    break;
                }
                await pause(100);
            }
            confirmed ??= await readPermissionSettings(rpc, id);
            if (!confirmed ||
                confirmed.reviewer !== target ||
                !sameOtherSettings(current, confirmed))
                throw Error('Reviewer or permission boundaries unconfirmed; check Codex');
            this.b.lastReviewer = {
                session: agent.session,
                block: agent.block,
                pid: agent.pid,
                ...(agent.terminalId ? { terminalId: agent.terminalId } : {}),
                ...(agent.nativeIdentity
                    ? { nativeIdentity: agent.nativeIdentity }
                    : {}),
                chatId: id,
                reviewer: target,
                at: Date.now(),
            };
            return {
                kind: 'permissions',
                label: target === 'user' ? 'Ask me' : 'Approve for me',
            };
        }
        finally {
            rpc.close();
        }
    }
}
module.exports = {
    DaemonControls,
    DaemonRpc,
    socketFor,
    socketFromListing,
    safeSocket,
    readFooter,
    footerId,
    loadedThread,
    availableModels,
    nextModel,
    nextEffort,
    sameExceptEffort,
    permissionSnapshot,
    sameOtherSettings,
    readPermissionSettings,
};

export {DaemonRpc,DaemonControls};
