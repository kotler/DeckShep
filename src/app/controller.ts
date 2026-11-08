const boundary = require('../schemas');
type GuardPipeline = import("../guards/pipeline").GuardPipeline;
type CompletionDisplay = import("../render/completion").CompletionDisplay;
type AgentSnapshot = import("../domain/types").AgentSnapshot;
type Config = import("../domain/types").Config;
type PressContext = import("../domain/types").PressContext;
'use strict';
const { pluginDirectory } = require("../platform/paths.ts");
const defaultFs = require('fs'), path = require('path'), unused: null = null;
const { Bridge } = require('./session'), { svg: defaultSvg, pulse: defaultPulse } = require('../render/visuals');
const { agentLines, modelLines, modeLines, effortLines, reviewerLines, sameTarget, } = require('../domain/labels'), { AgentMetadata } = require('../agents/codex/metadata');
const C = require('../guards/context');
const { GuardPipeline } = require('../guards/pipeline.ts');
const { DeliveryKernel } = require('./delivery.ts');
const { controlAccent } = require('../render/signal');
const { CompletionDisplay } = require('../render/completion');
const preferences = require('./preferences');
const { IntegrationSetup, diagnostics, herdrSessions } = require('./setup');
const { Controller } = require('./profile-controller');
const { CodexProvider } = require('../agents/codex/provider.ts');
const { ClaudeProvider } = require('../agents/claude/provider.ts');
function createApplication(dependencies: Record<string, any>) {
    const ws: any = dependencies.socket;
    const arg: (key: string) => any = (key: string) => dependencies.args?.[key];
    const fs: any = dependencies.fs || defaultFs;
    const clock: any = dependencies.clock || (() => Date.now());
    const { svg, pulse } = dependencies.renderer || { svg: defaultSvg, pulse: defaultPulse };
    const backendFactory: any = dependencies.backendFactory || ((c: import("../domain/types").Config) => c.backend === 'herdr' ? new (require('./herdr-session').HerdrBridge)(c) : new Bridge(c));
    const metadataFactory: any = dependencies.metadataFactory || ((b: any) => new AgentMetadata(b));
    const schedule: any = dependencies.setInterval || setInterval;
    const integrationSetup = dependencies.integrationSetup || new IntegrationSetup();
    const providers: any = dependencies.providers || [new CodexProvider(), new ClaudeProvider()];
    const emit: (event: any, context: any, payload: any) => void = (event: any, context: any, payload: any) => {
        if (ws.readyState === 1)
            ws.send(JSON.stringify({ event, context, payload }));
    };
    let saved: {
        version: number;
        revision: number;
        shared: {};
        profiles: {
            rex: {};
            herdr: {};
        };
    } | {
        version: number;
        revision: any;
        shared: {};
        profiles: {
            [k: string]: {};
        };
    } = preferences.store(), storeError: string = '', loadedV2: boolean = false, queue: Promise<void> = Promise.resolve(), sequence: number = 0, appearanceSequence: number = 0;
    const controllers: Map<any, any> = new Map(), owners: Map<any, any> = new Map();
    async function settled() {
        let pending: any;
        do {
            pending = queue;
            await pending;
        } while (pending !== queue);
    }
    function persist() {
        loadedV2 = true;
        emit('setGlobalSettings', arg('-pluginUUID'), preferences.serialize(saved));
    }
    function getController(scope: any) {
        if (!['rex', 'herdr'].includes(scope))
            throw Error('Unknown controller profile');
        if (!controllers.has(scope))
            controllers.set(scope, new Controller(scope, createRuntime(scope)));
        return controllers.get(scope);
    }
    function applyAllSettings() {
        for (const runtime of controllers.values())
            runtime.applySettings();
    }
    function createRuntime(scope: any) {
        const configPath: string = path.join(pluginDirectory, 'config.json');
        let diskConfig: any = boundary.parse('config', fs.readFileSync(configPath)), config: any = preferences.profileConfig(diskConfig, saved, scope);
        let activePress: any = null, visibility: number = 0, actionBusy: boolean = false, settingsError: string = '', setupBusy: boolean = false, inspectorMessage: string = '';
        const backendKey: (c: any) => string = (c: any) => c.backend +
            '|claude:' +
            String(c.claude?.enabled === true) +
            '|' +
            (c.backend === 'herdr'
                ? [c.herdr?.socketPath || '', c.herdr?.titleIdentity === true].join('|')
                : c.rexPath || '');
        const guards: GuardPipeline = new GuardPipeline(() => ({
            scope, visible: !!activePress && keys.has(activePress.ctx), appearance: activePress ? keys.get(activePress.ctx)?.appearance : undefined,
            visibility, generation: ((bridge) as any).generation,
            backendKey: ((bridge) as any).backendKey, page,
            stamp: C.stamp(selected(), page),
        }), () => clock());
        function makeBridge(c: any) {
            const b: any = backendFactory(c);
            ((b) as any).backendKey = backendKey(c);
            ((b) as any).generation = ++sequence;
            b.attachDelivery(new DeliveryKernel(((b) as any), guards, () => activePress?.display || null));
            return b;
        }
        let bridge: any = makeBridge(config), metadata: any = metadataFactory(bridge);
        const completion: CompletionDisplay = new CompletionDisplay(), keys: Map<any, any> = new Map(), transitions: Map<any, any> = new Map();
        let page: number = 0, bank: number = 0, busy: boolean = false, offline: boolean = true, metadataBusy: boolean = false, metadataAgain: boolean = false, startupSelectionRead: boolean = false, contextState: {
            stamp: string | null;
            armedAt: number;
        } = (({
            stamp: null,
            armedAt: 0,
        }) as {
            stamp: string | null;
            armedAt: number;
        });
        function loadConfig() {
            try {
                diskConfig = boundary.parse('config', fs.readFileSync(configPath));
                settingsError = '';
            }
            catch {
                settingsError = 'Settings file invalid; using the last valid defaults';
            }
            const next: any = preferences.profileConfig(diskConfig, saved, scope);
            if (backendKey(next) !== ((bridge) as any).backendKey) {
                if (actionBusy || setupBusy)
                    return;
                bridge = makeBridge(next);
                metadata = metadataFactory(bridge);
                if (metadataBusy)
                    metadataAgain = true;
                startupSelectionRead = false;
                bank = 0;
                page = 0;
                transitions.clear();
                contextState = (({
                    stamp: null,
                    armedAt: 0,
                }) as {
                    stamp: string | null;
                    armedAt: number;
                });
                for (const k of keys.values()) {
                    k.notice = null;
                    k.feedback = null;
                }
            }
            config = next;
            bridge.config = config;
        }
        const backendName: () => "Herdr" | "Rex" = () => (scope === 'herdr' ? 'Herdr' : 'Rex');
        const clean: (s: any) => string = (s: any) => String(s || '')
            .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
            .slice(0, 15);
        function selected() {
            return bridge.agents?.find((a: any) => sameTarget(bridge.lastTarget, a));
        }
        function mapping(k: any) {
            const override: any = k.settings.action;
            if (override) {
                if (override === 'tools')
                    return 'questions';
                if ([
                    'planPrompt',
                    'modelPicker',
                    'effortPicker',
                    'previous',
                    'bankprev',
                ].includes(override))
                    return 'none';
                return override;
            }
            const { column: c, row: r } = k.coordinates;
            return r === 0 ? 'agent:' + c : C.layout(page, selected(), bridge.delivery?.backend.capabilities)[(r - 1) * 5 + c];
        }
        function bankLines() {
            if (offline)
                return ['Agents ▶', backendName() + ' offline'];
            const visible: any = bridge.slots
                .slice(bank * 5, bank * 5 + 5)
                .filter((s: any) => bridge.agents?.some((a: any) => a.session === s.session && a.block === s.block)).length;
            const total: number = Math.max(1, Math.ceil(bridge.slots.length / 5)), outside: number = Math.max(0, (bridge.agents?.length || 0) - visible);
            return [
                'Agents ▶',
                ...(total > 1 ? [`bank ${bank + 1}/${total}`] : []),
                ...(outside
                    ? [`${outside} off-page`]
                    : bridge.agents?.length
                        ? []
                        : ['No agents']),
            ];
        }
        function capture(k: any) {
            const target: any = selected(), action: any = mapping(k), contextStamp: string = C.stamp(target, page);
            return {
                setupBusy,
                scope,
                appearance: k.appearance,
                visibility,
                generation: ((bridge) as any).generation,
                action,
                page,
                backendKey: ((bridge) as any).backendKey,
                stamp: contextStamp,
                target: C.snapshot(action.startsWith('agent:') ? k.target : target),
                armedAt: contextState.armedAt,
                verifyChat: C.needsChat(action, target),
            };
        }
        function render() {
            metadata.hydrate(bridge.agents || []);
            const now: any = clock(), target: any = selected(), mode: "unknown" | "working" | "question" | "background" | "ready" | "approval" = C.modeOf(target), contextStamp: string = C.stamp(target, page);
            completion.update(bridge.agents || [], target, now);
            if (contextState.stamp !== contextStamp)
                contextState = { stamp: contextStamp, armedAt: now + 350 };
            for (const [ctx, k] of keys) {
                const action: any = mapping(k);
                let icon: any = (({
                    effortIncrease: 'blank',
                    effortDecrease: 'blank',
                    plan: 'blank',
                    permissions: 'reviewer',
                    more: 'more',
                    questions: 'more',
                    prompts: 'more',
                    back: 'previous',
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
                }) as Record<string, any>)[action] || action;
                let lines: any[] = [], color: string = '#233a50', p: number = 0, badge: string = '';
                if (action.startsWith('agent:')) {
                    const slot: any = bridge.slots[bank * 5 + Number(action.split(':')[1])], a: any = bridge.agents?.find((a: any) => a.block === slot?.block && a.session === slot?.session);
                    k.target = a;
                    if (a) {
                        const shown: import("../domain/types").AgentSnapshot = completion.agent(a), prior: any = transitions.get(a.block);
                        if (!prior ||
                            prior.state !== shown.state ||
                            prior.pid !== a.pid ||
                            prior.statusAt !== a.statusAt)
                            transitions.set(a.block, {
                                state: shown.state,
                                pid: a.pid,
                                statusAt: a.statusAt,
                                at: now,
                            });
                        icon = a.app;
                        lines = agentLines(shown, config.aliases);
                        color = C.isBackground(shown)
                            ? '#126b78'
                            : config.palette[shown.state === 'idle' ? 'ready' : shown.state] ||
                                config.palette.unknown;
                        p = pulse(C.isBackground(shown) ? 'idle' : shown.state, now - transitions.get(a.block).at, config.animation);
                        if (sameTarget(bridge.lastTarget, a))
                            badge = 'selected';
                    }
                    else {
                        icon = 'empty';
                        lines = offline
                            ? [backendName() + ' offline', 'UNKNOWN']
                            : slot
                                ? ['Closed']
                                : ['No agent'];
                        color = offline ? config.palette.error : config.palette.idle;
                    }
                }
                else {
                    const gaps: any = bridge.slotGaps(), names: {
                        collapse: string[];
                        banknext: string[];
                        next: string[];
                        model: string[];
                        effort: string[];
                        effortIncrease: string[];
                        effortDecrease: string[];
                        permissions: any[];
                        plan: any[];
                        interrupt: string[];
                        stopTerminals: string[];
                        steer: string[];
                        queue: string[];
                        zoom: string[];
                        up: string[];
                        down: string[];
                        left: string[];
                        right: string[];
                        questionPrev: string[];
                        questionNext: string[];
                        answer: string[];
                        escape: string[];
                        approvalUp: string[];
                        approvalDown: string[];
                        approvalConfirm: string[];
                        approvalEscape: string[];
                        review: string[];
                        tests: string[];
                        continue: string[];
                        send: any[];
                        more: string[];
                        questions: string[];
                        prompts: string[];
                        back: string[];
                        none: never[];
                        claudeToggle: string[];
                        claudeInfo: string[];
                        claudeModeInfo: any[];
                        inputInfo: string[];
                        status: any[];
                    } = {
                        collapse: [
                            'Collapse',
                            ...(offline
                                ? [backendName() + ' offline']
                                : gaps
                                    ? [`${gaps} gap${gaps === 1 ? '' : 's'}`]
                                    : []),
                        ],
                        banknext: bankLines(),
                        next: ['Next agent'],
                        model: modelLines(bridge),
                        effort: effortLines(bridge),
                        effortIncrease: ['Effort +'],
                        effortDecrease: ['Effort −'],
                        permissions: reviewerLines(bridge),
                        plan: modeLines(bridge),
                        interrupt: [
                            'Interrupt',
                            mode === 'working' ? 'running' : 'not running',
                        ],
                        stopTerminals: [
                            'Stop terminals',
                            `${target?.backgroundIds?.length || 0} running`,
                        ],
                        steer: ['Steer', 'typed message'],
                        queue: ['Queue', 'typed message'],
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
                        approvalConfirm: ['Confirm', 'shown choice'],
                        approvalEscape: ['Esc', 'choice'],
                        review: ['Review', 'draft'],
                        tests: ['Tests', 'draft'],
                        continue: ['Continue', 'draft'],
                        send: bridge.draft
                            ? ['Send', bridge.draft.action]
                            : ['Send', 'no draft'],
                        more: [
                            `Page ${page + 1}/3`,
                            ['Home', 'Questions', 'Prompts'][page],
                            page === 0
                                ? {
                                    ready: 'Ready',
                                    working: 'Working',
                                    background: 'Background',
                                    question: 'Question',
                                    approval: 'Choice',
                                    unknown: target ? 'Check ' + backendName() : 'Select agent',
                                }[mode]
                                : 'next page',
                        ],
                        questions: ['Questions'],
                        prompts: ['Prompts'],
                        back: ['Back', 'Questions'],
                        none: [],
                        claudeToggle: ['Toggle', 'Space'],
                        claudeInfo: [
                            'Claude Code',
                            config.claude?.enabled ? 'Experimental' : 'Set up hooks',
                        ],
                        claudeModeInfo: modeLines(bridge),
                        inputInfo: ['Use Herdr', 'keyboard'],
                        status: target
                            ? [
                                'Check ' + backendName(),
                                target.app === 'claude-code'
                                    ? target.claudeError ||
                                        (!target.claudeControlsEnabled ? 'Enable Claude' : '')
                                    : target.kind === 'auth'
                                        ? 'Authentication'
                                        : '',
                            ]
                            : [bridge.selectionNotice ? 'Reselect' : 'Select', 'agent'],
                    };
                    lines = ((names) as Record<string, any>)[action] || [
                        action.toUpperCase(),
                    ];
                    if ((action === 'collapse' && (offline || !gaps)) ||
                        (action === 'interrupt' && mode !== 'working') ||
                        action === 'none')
                        color = '#38414b';
                    if (action === 'stopTerminals' ||
                        (action === 'interrupt' && mode === 'working'))
                        color = '#813c42';
                    if (['steer', 'queue'].includes(action) && !target?.runId) {
                        color = '#38414b';
                        lines = [action === 'steer' ? 'Steer' : 'Queue', 'loading run'];
                    }
                    if (action.startsWith('approval'))
                        color = '#78551e';
                    if (action === 'send' && bridge.draft)
                        color = '#416428';
                    if (([
                        'up',
                        'down',
                        'left',
                        'right',
                        'escape',
                        'questionPrev',
                        'questionNext',
                        'answer',
                    ].includes(action) &&
                        mode !== 'question') ||
                        (action === 'permissions' && mode !== 'ready'))
                        color = '#38414b';
                    if (k.feedback &&
                        k.feedback.action === action &&
                        k.feedback.stamp === contextStamp &&
                        now < k.feedback.until) {
                        lines = ['Unavailable', k.feedback.message];
                        color = '#893748';
                    }
                }
                if (action !== 'plan' &&
                    !['effort', 'effortIncrease', 'effortDecrease'].includes(action) &&
                    k.notice &&
                    k.notice.action === action &&
                    k.notice.stamp === contextStamp &&
                    now < k.notice.until) {
                    lines = [
                        action === 'stopTerminals'
                            ? 'Stop terminals'
                            : action === 'collapse'
                                ? 'Collapse'
                                : action === 'permissions'
                                    ? 'Reviewer'
                                    : action === 'steer'
                                        ? 'Steer'
                                        : action === 'queue'
                                            ? 'Queue'
                                            : ['effortIncrease', 'effortDecrease'].includes(action)
                                                ? 'Effort'
                                                : action === 'plan'
                                                    ? 'Mode'
                                                    : 'Model',
                        k.notice.label,
                    ];
                    color = '#2b654c';
                }
                k.presented = capture(k);
                const img: string = 'data:image/svg+xml;base64,' +
                    Buffer.from(svg({
                        icon,
                        lines,
                        color,
                        pulse: p,
                        badge,
                        accent: controlAccent(action, color),
                        style: config.appearance?.style || 'signal',
                        textOnly: lines.length === 1 &&
                            ['effortIncrease', 'effortDecrease', 'plan'].includes(action),
                        agent: action.startsWith('agent:'),
                    })).toString('base64');
                if (img !== k.lastImage) {
                    emit('setImage', ctx, { image: img, target: 0 });
                    emit('setTitle', ctx, { title: '', target: 0 });
                    k.lastImage = img;
                }
            }
        }
        async function refreshMetadata(force: any = false) {
            if (metadataBusy) {
                metadataAgain = metadataAgain || force;
                return;
            }
            metadataBusy = true;
            try {
                const source: any = bridge, reader: any = metadata, agents: any = await reader.refresh(source.agents || [], force);
                if (source !== bridge)
                    return;
                for (const agent of agents) {
                    if (agent.app !== 'codex')
                        continue;
                    const live: any = bridge.agents?.find((a: any) => sameTarget(a, agent));
                    if (live &&
                        live.cwd === agent.cwd &&
                        (config.backend !== 'herdr' ||
                            (live.chatId === agent.chatId &&
                                live.nativeIdentity === agent.nativeIdentity)) &&
                        !(live.metadataAt > ((agent.metadataAt) as number)))
                        for (const field of [
                            'chatId',
                            'chatName',
                            'project',
                            'model',
                            'effort',
                            'collaborationMode',
                            'reviewer',
                            'runId',
                            'backgroundOnly',
                            'backgroundIds',
                            'backgroundTurnId',
                            'activityStatusAt',
                            'metadataAt',
                        ])
                            if (!(config.backend === 'herdr' &&
                                [
                                    'runId',
                                    'backgroundOnly',
                                    'backgroundIds',
                                    'backgroundTurnId',
                                    'activityStatusAt',
                                ].includes(field)) &&
                                Object.hasOwn(agent, field) &&
                                (![
                                    'backgroundOnly',
                                    'backgroundIds',
                                    'backgroundTurnId',
                                    'activityStatusAt',
                                ].includes(field) ||
                                    live.statusAt === agent.statusAt))
                                live[field] = ((agent) as Record<string, any>)[field];
                }
                render();
            }
            finally {
                metadataBusy = false;
                if (metadataAgain) {
                    metadataAgain = false;
                    void refreshMetadata(true);
                }
            }
        }
        async function refresh(forceMetadata: any = false) {
            if (busy || actionBusy)
                return;
            busy = true;
            try {
                loadConfig();
                await bridge.discover();
                offline = false;
                void refreshMetadata(forceMetadata);
            }
            catch {
                offline = true;
                bridge.agents = [];
                bridge.draft = null;
                bridge.picker = null;
            }
            finally {
                busy = false;
                render();
            }
        }
        async function performLegacy(a: any, display: any) {
            if (a === 'more')
                page = (page + 1) % 3;
            else if (a === 'questions')
                page = 1;
            else if (a === 'prompts')
                page = 2;
            else if (a === 'back')
                page = 0;
            else if (a === 'collapse') {
                const result: any = await bridge.collapse();
                bank = Math.min(bank, Math.max(0, Math.ceil(bridge.slots.length / 5) - 1));
                return result.removed ? result : undefined;
            }
            else if (a === 'banknext')
                bank = (bank + 1) % Math.max(1, Math.ceil(bridge.slots.length / 5));
            else if (a.startsWith('agent:')) {
                if (!display.target || offline)
                    throw Error('No live agent');
                await bridge.focus(display.target);
            }
            else if (a === 'next') {
                await bridge.navigate(1);
                const index: any = bridge.slots.findIndex((s: any) => s.session === bridge.lastTarget?.session &&
                    s.block === bridge.lastTarget?.block);
                if (index >= 0)
                    bank = Math.floor(index / 5);
            }
            else if (['effortIncrease', 'effortDecrease'].includes(a))
                return bridge.adjustEffort(a === 'effortDecrease' ? 'decrease' : 'increase');
            else if (['model', 'effort', 'permissions'].includes(a))
                return bridge.cycleControl(a);
            else if (a === 'plan')
                return bridge.togglePlan();
            else if (a === 'zoom')
                await bridge.zoom();
            else if (a === 'interrupt')
                await bridge.interrupt();
            else if (a === 'stopTerminals')
                return bridge.stopTerminals();
            else if (a === 'steer' || a === 'queue')
                return bridge.submitRunning(a);
            else if (a === 'claudeToggle')
                await bridge.questionKey('space');
            else if (a === 'send')
                await bridge.send();
            else if (a.startsWith('approval'))
                await bridge.approvalKey((({
                    approvalUp: 'up',
                    approvalDown: 'down',
                    approvalConfirm: 'enter',
                    approvalEscape: 'escape',
                }) as Record<string, any>)[a]);
            else if ([
                'up',
                'down',
                'left',
                'right',
                'escape',
                'questionPrev',
                'questionNext',
                'answer',
            ].includes(a))
                await bridge.questionKey((({
                    questionPrev: 'shift+tab',
                    questionNext: 'tab',
                    answer: display.target?.claudeCheckboxList ? 'tab' : 'enter',
                }) as Record<string, any>)[a] || a);
            else
                await bridge.stage(a);
        }
        async function perform(action: string, display: any) {
            const provider: any = providers.find((provider: import("../domain/backend").AgentProvider) => provider.matches(display.target || {}));
            if (C.needsContext(action) && provider && bridge.delivery) {
                return provider.perform(action, { press: display, backend: bridge.delivery.backend, operations: { execute: performLegacy } });
            }
            return performLegacy(action, display);
        }
        async function press(ctx: any, display: any) {
            const k: any = keys.get(ctx);
            if (!k)
                return;
            display = display || k.presented || capture(k);
            const a: any = display.action;
            if (['none', 'status', 'inputInfo', 'claudeInfo', 'claudeModeInfo'].includes(a))
                return;
            let completed: boolean = false;
            actionBusy = true;
            activePress = { ctx, display };
            try {
                let result: any;
                guards.preflight(display, C.needsContext(a));
                if (C.needsContext(a)) {
                    result = await bridge.withContext(display, () => perform(a, display));
                }
                else
                    result = await perform(a, display);
                guards.postflight(display);
                completed = true;
                k.feedback = null;
                if (result)
                    k.notice = {
                        until: clock() + 2500,
                        label: result.label,
                        action: a,
                        stamp: display.stamp,
                    };
            }
            catch (error: unknown) {
                k.notice = null;
                k.feedback = {
                    until: clock() + 10000,
                    message: clean(((error) as Error & {
                        code?: string;
                    }).message),
                    action: a,
                    stamp: display.stamp,
                };
                inspectorMessage = String(((error) as Error & {
                    code?: string;
                }).message)
                    .replace(/[\x00-\x1f\x7f]/g, '')
                    .slice(0, 160);
                render();
                emit('showAlert', ctx, {});
            }
            finally {
                actionBusy = false;
                activePress = null;
            }
            if (completed &&
                display.target?.app === 'claude-code' &&
                !display.target.claudePicker &&
                ['up', 'down', 'approvalUp', 'approvalDown'].includes(a)) {
                render();
                return;
            }
            const waitingAction: boolean = [
                'up',
                'down',
                'left',
                'right',
                'escape',
                'questionPrev',
                'questionNext',
                'answer',
                'claudeToggle',
                'approvalUp',
                'approvalDown',
                'approvalConfirm',
                'approvalEscape',
            ].includes(a);
            if (waitingAction && display.target?.app === 'claude-code') {
                const source: any = bridge;
                try {
                    const live: any = await source.agent(display.target);
                    if (source === bridge) {
                        const index: number = ((source.agents) as any[]).findIndex((item: any) => sameTarget(item, display.target));
                        if (index >= 0) {
                            if (live && sameTarget(live, display.target))
                                ((source.agents) as any[])[index] = live;
                            else
                                ((source.agents) as any[]).splice(index, 1);
                        }
                    }
                }
                catch {
                    void refresh();
                }
                render();
            }
            else
                await refresh(true);
            render();
        }
        async function initialize() {
            if (!keys.size)
                return;
            await refresh();
            if (!startupSelectionRead &&
                (config.backend === 'herdr' || config.allowClipboardFocus)) {
                startupSelectionRead = true;
                try {
                    await bridge.focused();
                }
                catch { }
            }
            render();
        }
        function inspectorStatus(context: any, message?: string | undefined) {
            if (message !== undefined)
                inspectorMessage = message;
            const a: any = selected(), agents: any = bridge.agents || [];
            emit('sendToPropertyInspector', context, {
                kind: 'status',
                profileScope: scope,
                profileName: scope === 'herdr' ? 'Herdr Agents' : 'Rex Agents',
                backend: config.backend || 'rex',
                preferences: preferences.view(config),
                offline,
                agents: agents.length,
                codex: agents.filter((a: any) => a.app === 'codex').length,
                claude: agents.filter((a: any) => a.app === 'claude-code').length,
                claudeIdentified: agents.filter((a: any) => a.app === 'claude-code' && a.nativeVerified).length,
                metadata: agents.filter((a: any) => a.app === 'codex' && a.chatId).length,
                selected: a
                    ? {
                        app: a.app,
                        state: a.state,
                        mode: a.app === 'claude-code' ? null : a.collaborationMode || null,
                        ...(a.app === 'claude-code'
                            ? {
                                identityMessage: a.claudeError || '',
                                nativeVerified: a.nativeVerified === true,
                            }
                            : {}),
                        ...(config.backend === 'herdr' && a.app !== 'claude-code'
                            ? {
                                identityMessage: a.nativeError || '',
                                nativeVerified: a.nativeVerified === true,
                            }
                            : {}),
                    }
                    : null,
                selectionNotice: !!bridge.selectionNotice,
                setupBusy,
                message: inspectorMessage || settingsError || storeError,
            });
        }
        async function inspectorRequest(e: any) {
            if (!keys.has(e.context))
                return;
            if (e.payload?.kind === 'doctor') {
                emit('sendToPropertyInspector', e.context, { kind: 'doctor', checks: await (dependencies.diagnostics || diagnostics)({ selected: selected(), online: !offline, model: e.payload.model }), sessions: (dependencies.herdrSessions || herdrSessions)() });
                return;
            }
            if (['claudePreview', 'claudeApply', 'claudeUndo', 'removeIntegrations'].includes(e.payload?.kind)) {
                try {
                    if (e.payload.kind === 'claudePreview' || e.payload.kind === 'removeIntegrations') {
                        const diff = integrationSetup.preview(e.payload.kind === 'removeIntegrations', e.payload.statusline === true);
                        emit('sendToPropertyInspector', e.context, { kind: 'claudePreview', ...diff });
                    } else if (e.payload.kind === 'claudeApply') integrationSetup.apply();
                    else integrationSetup.undo();
                    inspectorStatus(e.context, e.payload.kind === 'claudePreview' || e.payload.kind === 'removeIntegrations' ? 'Review the exact changes below, then click Apply' : 'Integration updated; no agents restarted');
                } catch { inspectorStatus(e.context, 'Integration settings changed or unavailable; preview again. See docs/CLAUDE.md for recovery.'); }
                return;
            }
            if (e.payload?.kind === 'preferences') {
                try {
                    saved = preferences.update(saved, scope, e.payload.preferences);
                    persist();
                    applyAllSettings();
                    inspectorStatus(e.context, 'Preferences saved');
                }
                catch (error: unknown) {
                    inspectorStatus(e.context, ((error) as Error & {
                        code?: string;
                    }).message);
                }
                return;
            }
            if (e.payload?.kind === 'status') {
                inspectorStatus(e.context);
                return;
            }
            if (e.payload?.kind !== 'setupFooter')
                return;
            if (setupBusy) {
                inspectorStatus(e.context, 'Setup already running');
                return;
            }
            const a: any = selected();
            setupBusy = true;
            // The explicit setup owns this busy interval; captured ordinary key presses
            // still carry setupBusy=true and refuse after the interval ends.
            activePress = { ctx: e.context, display: { ...capture(keys.get(e.context)), setupBusy: false } };
            inspectorStatus(e.context, 'Configuring the selected agent in Rex…');
            try {
                if (config.backend === 'herdr')
                    throw Error('Run /title thread-id in Codex and enable title matching in preferences');
                if (!config.allowClipboardFocus)
                    throw Error('Enable visible-pane checks first');
                if (a?.app !== 'codex' || !['idle', 'done'].includes(a.state))
                    throw Error('Select a ready Codex agent on the deck');
                const display: {
                    target: {
                        [k: string]: any;
                    } | null;
                    verifyChat: boolean;
                } = { target: C.snapshot(a), verifyChat: false };
                await bridge.withContext(display, () => (dependencies.setupCodex || require('../agents/codex/setup-daemon').configure)(bridge, a, pluginDirectory));
                await refresh(true);
                inspectorStatus(e.context, 'Status line configured; no prompt submitted');
            }
            catch (error: unknown) {
                inspectorStatus(e.context, String(((error) as Error & {
                    code?: string;
                }).message)
                    .replace(/[\x00-\x1f\x7f]/g, '')
                    .slice(0, 160));
            }
            finally {
                setupBusy = false;
                activePress = null;
                inspectorStatus(e.context);
            }
        }
        function applySettings() {
            const hadConsent: any = config.allowClipboardFocus;
            loadConfig();
            if (scope === 'rex' && hadConsent && !config.allowClipboardFocus) {
                bridge.lastTarget = null;
                bridge.draft = null;
                bridge.picker = null;
            }
            else if (keys.size &&
                !startupSelectionRead &&
                (scope === 'herdr' || config.allowClipboardFocus))
                queue = queue.then(initialize).catch(() => { });
            render();
        }
        function detach(context: any) {
            keys.delete(context);
            if (!keys.size) {
                visibility++;
                bridge.draft = null;
                bridge.picker = null;
                if (bridge.claude)
                    bridge.claude.picker = null;
                completion.update(bridge.agents || [], null, clock());
            }
        }
        function attach(context: any, payload: any) {
            const first: boolean = !keys.size;
            if (first)
                visibility++;
            keys.set(context, {
                settings: payload.settings || {},
                coordinates: payload.coordinates,
                appearance: ++appearanceSequence,
            });
            render();
            if (first)
                queue = queue.then(initialize).catch(() => { });
        }
        return {
            get setupBusy() {
                return setupBusy;
            },
            get bridge() {
                return bridge;
            },
            get metadata() {
                return metadata;
            },
            keys,
            mapping,
            render,
            refresh,
            refreshMetadata,
            press,
            selected,
            inspectorRequest,
            initialize,
            applySettings,
            attach,
            detach,
            settled,
            ready: settled,
            getPage: () => page,
            getBank: () => bank,
            setBank: (value: any) => (bank = value),
        };
    }
    ws.on('open', () => {
        ws.send(JSON.stringify({ event: arg('-registerEvent'), uuid: arg('-pluginUUID') }));
        ws.send(JSON.stringify({ event: 'getGlobalSettings', context: arg('-pluginUUID') }));
        for (const runtime of controllers.values())
            if (runtime.keys.size)
                queue = queue.then(runtime.initialize).catch(() => { });
    });
    ws.on('message', (raw: any) => {
        try {
            const e: any = boundary.parse('hostEvent', raw);
            if (e.event === 'didReceiveGlobalSettings') {
                try {
                    const input: any = boundary.validate('globalSettings', e.payload?.settings || {});
                    if (input.version !== 2 && loadedV2)
                        return;
                    const incoming: {
                        version: number;
                        revision: number;
                        shared: {};
                        profiles: {
                            rex: {};
                            herdr: {};
                        };
                    } | {
                        version: number;
                        revision: any;
                        shared: {};
                        profiles: {
                            [k: string]: {};
                        };
                    } = preferences.store(input);
                    if (input.version === 2 && incoming.revision < saved.revision)
                        return;
                    saved = incoming;
                    storeError = '';
                    if (input.version === 2)
                        loadedV2 = true;
                    else
                        persist();
                    applyAllSettings();
                }
                catch {
                    storeError =
                        'Saved profile preferences invalid; keeping the last valid settings';
                    for (const runtime of controllers.values())
                        runtime.render();
                }
                return;
            }
            if (e.event === 'willAppear' || e.event === 'didReceiveSettings') {
                if (e.event === 'didReceiveSettings' && !owners.has(e.context))
                    return;
                const scope: any = preferences.scopeOf(e.payload?.settings), prior: any = owners.get(e.context);
                if (prior && prior !== scope)
                    getController(prior).detach(e.context);
                if (!scope) {
                    owners.delete(e.context);
                    emit('setImage', e.context, {
                        image: 'data:image/svg+xml;base64,' +
                            Buffer.from(svg({
                                icon: 'blank',
                                lines: ['Profile', 'setup error'],
                                color: '#893748',
                            })).toString('base64'),
                        target: 0,
                    });
                    emit('setTitle', e.context, { title: '', target: 0 });
                    return;
                }
                const runtime: any = getController(scope);
                owners.set(e.context, scope);
                if (e.event === 'didReceiveSettings' && prior === scope) {
                    const k: any = runtime.keys.get(e.context);
                    if (k)
                        k.settings = e.payload.settings || {};
                    runtime.render();
                }
                else
                    runtime.attach(e.context, e.payload);
                return;
            }
            const scope: any = owners.get(e.context);
            if (!scope)
                return;
            const runtime: any = getController(scope);
            if (e.event === 'willDisappear') {
                runtime.detach(e.context);
                owners.delete(e.context);
                return;
            }
            if (e.event === 'sendToPlugin') {
                const appearance: any = runtime.keys.get(e.context)?.appearance;
                queue = queue
                    .then(() => owners.get(e.context) === scope &&
                    runtime.keys.get(e.context)?.appearance === appearance
                    ? runtime.inspectorRequest(e)
                    : undefined)
                    .catch(() => { });
                return;
            }
            if (e.event === 'keyDown') {
                const k: any = runtime.keys.get(e.context), shown: any = k?.presented, display: any = shown
                    ? { ...shown, pressedAt: clock(), setupBusy: runtime.setupBusy }
                    : undefined;
                queue = queue
                    .then(() => owners.get(e.context) === scope
                    ? runtime.press(e.context, display)
                    : undefined)
                    .catch(() => { });
            }
        }
        catch { }
    });
    ws.on('close', () => dependencies.onClose?.());
    ws.on('error', () => dependencies.onError?.());
    schedule(() => {
        for (const runtime of controllers.values())
            if (runtime.keys.size)
                void runtime.refresh();
    }, 2000);
    schedule(() => {
        for (const runtime of controllers.values())
            if (runtime.keys.size)
                runtime.render();
    }, 250);
    return { controllers, getController, settled,
        receive: (event: any) => ws.emit('message', JSON.stringify(event)),
    };
}
module.exports = { createApplication };

export { createApplication };
