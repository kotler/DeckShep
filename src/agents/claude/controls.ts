type NativePicker = {actor:string;identity:any;id:string;openedAt:number;pending:boolean;automatic?:boolean;applying?:boolean;composerHash?:string;expectedViewHash?:string};
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const crypto = require('node:crypto'), S = require('./state');
const hash: (s: any) => string = (s: any) => crypto.createHash('sha256').update(s).digest('hex');
const actor: (a: any) => string = (a: any) => [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
const changed: () => Error & {
    code: string;
} = () => Object.assign(Error('Reselect Claude agent'), { code: 'SELECTION_CHANGED' });
function approvalStart(lines: string[], hint: any) {
    const panels: number[] = lines
        .slice(0, hint)
        .map((line: string, i: number) => line.trim() === 'Bash command' &&
        i > 0 &&
        /^\s*[─━]{12,}\s*$/.test(lines[i - 1])
        ? i - 1
        : -1)
        .filter((i: number) => i >= 0);
    return panels.length === 1 ? panels[0] : null;
}
function approvalFrame(raw: any) {
    const plain: any = raw.replace(/\x1b\[[0-9;:]*m/g, '').replace(/\r(?=\n|$)/g, '');
    if (plain.includes('\x1b'))
        return null;
    const lines: any = plain
        .split('\n')
        .map((line: any) => line.trimEnd()), hint: any = lines.findLastIndex((s: any) => /\b[Ee]sc to cancel\b/.test(s)), start: number | null = approvalStart(lines, hint);
    if (start === null ||
        hint < 0 ||
        lines
            .slice(hint + 1)
            .some((s: any) => s.trim() &&
            !/^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/.test(s)))
        return null;
    const rawLines: any = raw.split('\n'), styles: any = rawLines
        .slice(0, start)
        .join('\n')
        .match(/\x1b\[[0-9;:]*m/g) || [], reset: any = styles.findLastIndex((code: any) => /^\x1b\[(?:0)?m$/.test(code));
    return {
        text: lines.slice(start, hint + 1).join('\n'),
        styled: styles.slice(Math.max(0, reset)).join('') +
            rawLines.slice(start, hint + 1).join('\n'),
    };
}
function waitingFrame(a: any, text: string, ansi: any) {
    if (a.state === 'blocked' && a.kind === 'permission') {
        const t: {
            text: any;
            styled: any;
        } | null = approvalFrame(text), s: {
            text: any;
            styled: any;
        } | null = approvalFrame(ansi);
        if (t && s) {
            if (t.text !== s.text)
                throw Error('Claude view changed');
            return { text: t.text, styled: s.styled };
        }
    }
    return { text, styled: ansi };
}
function dialog(view: string, type: any) {
    if (type === 'question') {
        const lines: string[] = view.split('\n'), review: number = lines.findLastIndex((line: any) => line.trim() === 'Review your answers'), ready: number = lines.findLastIndex((line: any) => line.trim() === 'Ready to submit your answers?');
        if (review >= 0 &&
            ready > review &&
            lines.slice(0, review).some((line: string) => /✔\s+Submit/.test(line))) {
            const tail: string[] = lines.slice(ready + 1), choices: string[] = tail.filter((line: string) => line.trim() &&
                !/^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/.test(line));
            if (choices.length === 2 &&
                /^\s*(?:[❯›>]\s+)?1\. Submit answers\s*$/.test(choices[0]) &&
                /^\s*(?:[❯›>]\s+)?2\. Cancel\s*$/.test(choices[1]) &&
                choices.filter((line: string) => /^\s*[❯›>]/.test(line)).length === 1) {
                const body: string = lines.slice(review).join('\n');
                return {
                    multiSelect: false,
                    review: true,
                    semantic: hash(body.replace(/^\s*(?:[❯›>]\s*)?(\d+[.)]\s+)/gm, '$1')),
                    hash: hash(view),
                };
            }
        }
    }
    const lines: string[] = view.split('\n'), hint: number = lines.findLastIndex((s: any) => type === 'picker'
        ? /Enter to set as default.*\bs to use this session only\b.*\bEsc to (?:cancel|exit)\b/.test(s)
        : type === 'permission'
            ? /\b[Ee]sc to cancel\b/.test(s)
            : /\b[Ee]nter to (?:select|confirm|submit)\b/.test(s) &&
                /\b[Ee]sc\b/.test(s));
    if (hint < 0 ||
        lines
            .slice(hint + 1)
            .some((s: string) => s.trim() &&
            !/^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/.test(s)))
        throw Error('Claude native dialog unavailable');
    const body: string = lines.slice(0, hint + 1).join('\n');
    const checkboxList: boolean = type === 'question' &&
        /^\s*←\s+[☐☒].*✔\s+Submit\s+→\s*$/m.test(body) &&
        (body.match(/^\s*(?:[❯›>]\s+)?\d+\. \[[ ✔✓xX]\] \S/gm) || []).length >= 2 &&
        /^\s*(?:[❯›>]\s+)?Submit\s*$/m.test(body);
    if ((!/^\s*[❯›>]\s+\d+[.)]\s+\S/m.test(body) &&
        !(checkboxList && /^\s*[❯›>]\s+Submit\s*$/m.test(body))) ||
        !/^\s*(?:[❯›>]\s+)?\d+[.)]\s+\S/m.test(body))
        throw Error('Claude option list unavailable');
    if (type === 'picker' && !/^\s*(?:Select|Choose) model\s*$/m.test(body))
        throw Error('Claude model picker unavailable');
    if (type === 'permission' &&
        !/\b(?:Do you want to|Would you like to|Allow|permission|approve)\b/i.test(body))
        throw Error('Claude approval view unavailable');
    const start: number = type === 'permission' ? (approvalStart(lines, hint) ?? 0) : 0;
    const semanticBody: string = type === 'permission'
        ? [...lines.slice(start, hint), 'Esc to cancel'].join('\n')
        : body;
    return {
        multiSelect: type === 'question' &&
            (/\bspace\b.*\b(?:select|toggle)\b/i.test(body) || checkboxList),
        checkboxList,
        semantic: hash(semanticBody.replace(/^\s*(?:[❯›>]\s*)?(\d+[.)]\s+)/gm, '$1')),
        hash: hash(view),
    };
}
function composer(view: string, cursor: any, agent: import("../../domain/types").AgentSnapshot, { allowEmpty = false, allowCommand = false }: Record<string, any> | undefined = {}) {
    const lines: string[] = view.split('\n'), row: number = cursor?.row - 1, col: number = cursor?.column - 1;
    if (!Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        row >= lines.length ||
        col < 0 ||
        /--\s*NORMAL\s*--/.test(view))
        throw Error('Claude composer cursor unavailable');
    const borders: number[] = lines
        .map((s: string, i: number) => /^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/.test(s.trim())
        ? i
        : -1)
        .filter((i: number) => i >= 0), lower: number | undefined = borders.find((i: number) => i > row), upper: number | undefined = borders.filter((i: number) => i < row).at(-1);
    if (upper === undefined ||
        lower === undefined ||
        lower - upper > 18 ||
        lines
            .slice(lower + 1)
            .some((s: string) => s.trim() &&
            !/^(?:\s*(?:\?|!|⏵|⏸|◯|○|●|✳|✻|\d|Claude|Opus|Sonnet|Haiku|Fable|Model|Effort|--\s*INSERT|esc to interrupt|Esc to interrupt))/.test(s)))
        throw Error('Claude composer is not visible');
    const region: string[] = lines.slice(upper + 1, lower);
    if (row === upper + 1 && col < region[0].search(/❯[ \u00a0]/) + 2)
        throw Error('Claude cursor is before the composer');
    const prompts: number[] = region
        .map((s: string, i: number) => (/^❯[ \u00a0](.*)$/.test(s.trimStart()) ? i : -1))
        .filter((i: number) => i >= 0);
    if (prompts.length !== 1 || prompts[0] !== 0 || row <= upper || row >= lower)
        throw Error('Claude composer is ambiguous');
    if (agent.vimMode &&
        (!/--\s*INSERT\s*--/.test(view) || agent.vimMode !== 'INSERT'))
        throw Error('Claude vim composer must show INSERT');
    let input: string[] = region.slice(0, row - upper);
    input[input.length - 1] = ((input.at(-1)) as string).slice(0, col);
    input[0] = input[0].replace(/^\s*❯[ \u00a0]/, '');
    const typed: string = input.join('\n').trim();
    if (!typed && !allowEmpty)
        throw Error('Type a message first');
    if ((!allowCommand &&
        /^[!\/]/.test(region[0].replace(/^\s*❯[ \u00a0]/, '').trimStart())) ||
        /[\x00-\x08\x0b-\x1f\x7f]/.test(typed))
        throw Error('Claude submission requires plain text');
    return {
        chatId: agent.chatId,
        identity: agent.nativeIdentity,
        turnStamp: agent.runId || agent.claudeTurnId,
        hash: hash(region.join('\n')),
        cursor: { row: cursor.row, column: cursor.column },
        empty: !typed,
    };
}
const same: (a: any, b: any) => boolean = (a: any, b: any) => !!a &&
    !!b &&
    a.chatId === b.chatId &&
    a.identity === b.identity &&
    a.turnStamp === b.turnStamp &&
    a.hash === b.hash &&
    a.cursor.row === b.cursor.row &&
    a.cursor.column === b.cursor.column;
class ClaudeControls {
    declare b: Record<string, any>;
    declare read: any;
    declare inspect: any;
    declare now: any;
    declare bindings: Map<any, any>;
    declare sequence: number;
    declare picker: NativePicker | null;
    declare submissions: Map<any, any>;
    declare viewReader: any;
    declare bindingsDefault: any;
    declare cycleWait: any;
    constructor(bridge: Record<string, any>, deps: Record<string, any> | undefined = {}) {
        this.b = bridge;
        this.read = deps.read || S.readRecord;
        this.inspect = deps.inspect || S.processInfo;
        this.now = deps.now || Date.now;
        this.bindings = new Map();
        this.sequence = 0;
        this.picker = null;
        this.submissions = new Map();
        this.viewReader = deps.view;
        this.bindingsDefault = deps.bindingsDefault || S.defaultBindings;
        this.cycleWait = deps.cycleWait;
    }
    prune(agents: import("../../domain/types").AgentSnapshot[]) {
        const live: Set<string> = new Set(agents.filter((a: import("../../domain/types").AgentSnapshot) => a.app === 'claude-code').map(actor));
        for (const key of this.bindings.keys())
            if (!live.has(key))
                this.bindings.delete(key);
        if (this.picker && !live.has(this.picker.actor))
            this.picker = null;
        while (this.submissions.size > 256)
            this.submissions.delete(this.submissions.keys().next().value);
    }
    async view(a: any, connection?: any) {
        if (this.viewReader)
            return this.viewReader(a);
        if (a.backend === 'herdr') {
            const read: (rpc: Record<string, any>) => Promise<{
                text: any;
                hash: string;
                cursor: null;
            } | undefined> = async (rpc: Record<string, any>) => {
                for (let attempt: number = 0; attempt < 3; attempt++) {
                    try {
                        const [text, ansi] = await Promise.all([
                            this.b.readView(rpc, a, 'text'),
                            this.b.readView(rpc, a, 'ansi'),
                        ]), [after, styled] = await Promise.all([
                            this.b.readView(rpc, a, 'text'),
                            this.b.readView(rpc, a, 'ansi'),
                        ]), before: {
                            text: any;
                            styled: any;
                        } = waitingFrame(a, text, ansi), next: {
                            text: any;
                            styled: any;
                        } = waitingFrame(a, after, styled);
                        if (before.text !== next.text || before.styled !== next.styled)
                            throw Error('Claude view changed');
                        return { text, hash: hash(before.styled), cursor: null };
                    }
                    catch (error: unknown) {
                        if (((error) as Error & {
                            code?: string;
                        }).message !==
                            'Claude view changed' ||
                            attempt === 2)
                            throw error;
                        await new Promise((resolve: (value: any) => void) => setTimeout(resolve, 20));
                    }
                }
            };
            return connection ? read(connection) : this.b.use(read);
        }
        const args: any[] = [
            'block',
            'call',
            '-s',
            a.session,
            '-b',
            a.block,
            'format',
            JSON.stringify({ format: 'vt', extra_cursor: true, max_bytes: 960000 }),
        ];
        const before: any = await this.b.run(args), cursor: RegExpExecArray | null = /\x1b\[(\d+);(\d+)H$/.exec(before?.content || '');
        if (before?.id || !cursor)
            throw Error('Claude viewport/cursor unavailable');
        const text: any = await new (require('../codex/setup-presets').Setup)(this.b).screen(a), after: any = await this.b.run(args);
        if (after?.id || hash(before.content) !== hash(after?.content || ''))
            throw Error('Claude view changed');
        return {
            text,
            cursor: { row: Number(cursor[1]), column: Number(cursor[2]) },
            hash: hash(before.content),
        };
    }
    async enrich(agent: import("../../domain/types").AgentSnapshot) {
        if (agent.app !== 'claude-code')
            return agent;
        const a: any = {
            ...agent,
            chatName: agent.chatName || 'Claude Code',
            claudeControlsEnabled: this.b.config.claude?.enabled === true,
            composerSupported: agent.backend !== 'herdr',
            nativeVerified: false,
        };
        const key: string = actor(a), previous: any = this.bindings.get(key);
        let sameRoot: boolean = false;
        try {
            const p: any = await this.inspect(a.pid), r: any = S.validate(await this.read(a.pid), a, p, this.now());
            const metadataFresh: boolean = Number.isFinite(r.metadataAt) &&
                r.metadataAt > 0 &&
                r.metadataAt <= this.now() + 1000 &&
                this.now() - r.metadataAt < 15000;
            const defaultBindings: any = await this.bindingsDefault(r.configDirectory);
            if (!defaultBindings) {
                a.claudeControlsEnabled = false;
                a.claudeError = 'Claude default keybindings required';
            }
            const root: string = [
                p.startedAt,
                r.sessionId,
                r.generation,
                defaultBindings,
            ].join('|');
            sameRoot = previous?.root === root;
            const trackedPicker: boolean = sameRoot &&
                this.picker?.actor === key &&
                this.picker.identity === previous.id &&
                !this.picker.pending &&
                Number.isFinite(this.picker.openedAt) &&
                this.now() - this.picker.openedAt >= 0 &&
                this.now() - this.picker.openedAt < 300000;
            const pausedRequest: boolean = sameRoot &&
                previous.confirmed === true &&
                r.state === 'blocked' &&
                ['question', 'permission'].includes(r.kind) &&
                S.text(r.requestId, 128) &&
                this.now() - r.updatedAt >= 0 &&
                this.now() - r.updatedAt < 300000;
            const controlsFresh: boolean = metadataFresh || trackedPicker || pausedRequest;
            if (!controlsFresh) {
                a.claudeControlsEnabled = false;
                a.claudeError = 'Wait for fresh Claude status line';
            }
            const base: string = [root, controlsFresh].join('|');
            let binding: any = previous;
            if (!binding || binding.base !== base) {
                binding = {
                    root,
                    base,
                    confirmed: metadataFresh || (sameRoot && previous.confirmed === true),
                    id: 'claude:' + ++this.sequence + ':' + hash(base),
                };
                this.bindings.set(key, binding);
            }
            Object.assign(a, {
                nativeVerified: true,
                nativeIdentity: binding.id,
                chatId: r.sessionId,
                claudeTurnId: r.turnId,
                runId: r.state === 'working' ? r.turnId : null,
                chatName: r.title || 'Claude ' + r.sessionId.slice(0, 8),
                permissionMode: r.permissionMode || null,
                vimMode: r.vimMode || null,
                metadataAt: r.metadataAt || 0,
                model: metadataFresh ? r.model : null,
                modelName: metadataFresh ? r.modelName : null,
                effort: metadataFresh ? r.effort : null,
                state: r.state,
                kind: r.kind || null,
                claudeRequestId: r.requestId || null,
                statusAt: [r.generation, r.turnId, r.state, r.requestId || ''].join(':'),
            });
            if (agent.state === 'working' &&
                r.state !== 'working' &&
                r.state !== 'blocked') {
                a.state = 'unknown';
                a.runId = null;
            }
            if (r.state === 'working' &&
                ['idle', 'done', 'error'].includes(agent.state)) {
                a.state = agent.state;
                a.runId = null;
            }
            if (r.state === 'blocked' &&
                ['idle', 'done', 'error'].includes(agent.state)) {
                a.state = 'unknown';
                a.kind = null;
                if (r.kind === 'question' && controlsFresh)
                    try {
                        const d: {
                            multiSelect: boolean;
                            review: boolean;
                            semantic: string;
                            hash: string;
                            checkboxList?: undefined;
                        } | {
                            multiSelect: boolean;
                            checkboxList: boolean;
                            semantic: string;
                            hash: string;
                            review?: undefined;
                        } = dialog((await this.view(a)).text, 'question');
                        if (d.review) {
                            a.state = 'blocked';
                            a.kind = 'question';
                        }
                    }
                    catch { }
                if (a.state === 'unknown' &&
                    ['idle', 'done'].includes(agent.state) &&
                    metadataFresh &&
                    r.metadataAt > r.updatedAt)
                    try {
                        const view: any = await this.view(a);
                        if (a.backend === 'herdr')
                            require('./cycle').configurationView(view, {
                                requireEmpty: true,
                            });
                        else if (!composer(view.text, view.cursor, a, { allowEmpty: true }).empty)
                            throw Error('Claude empty composer unavailable');
                        a.state = agent.state;
                        a.claudeRequestId = null;
                        a.statusAt += ':native-ended';
                        this.b.draft = null;
                    }
                    catch { }
            }
            if (a.claudeControlsEnabled &&
                (a.state === 'blocked' ||
                    (this.picker?.actor === key && !this.picker.pending))) {
                const owned: boolean = this.picker?.actor === key &&
                    this.picker.identity === a.nativeIdentity, automatic: any = owned &&
                    ((this.picker) as any).automatic;
                try {
                    const view: any = await this.view(a);
                    if (owned) {
                        let d: any;
                        try {
                            d = dialog(view.text, 'picker');
                            a.claudePickerVisible = true;
                        }
                        catch (error: unknown) {
                            if (!automatic ||
                                !(((this.picker) as any).applying))
                                throw error;
                            require('./cycle').configurationView(view);
                        }
                        if (automatic)
                            a.claudeCycling = true;
                        else {
                            a.state = 'blocked';
                            a.kind = 'question';
                            a.claudePicker = true;
                            a.statusAt =
                                'picker:' +
                                    ((this.picker) as {
                                        actor: string;
                                        identity: any;
                                        id: string;
                                        openedAt: any;
                                        pending: boolean;
                                    }).id +
                                    ':' +
                                    ((d) as {
                                        multiSelect: boolean;
                                        review: boolean;
                                        semantic: string;
                                        hash: string;
                                        checkboxList?: undefined;
                                    } | {
                                        multiSelect: boolean;
                                        checkboxList: boolean;
                                        semantic: string;
                                        hash: string;
                                        review?: undefined;
                                    }).semantic;
                        }
                    }
                    else {
                        const d: {
                            multiSelect: boolean;
                            review: boolean;
                            semantic: string;
                            hash: string;
                            checkboxList?: undefined;
                        } | {
                            multiSelect: boolean;
                            checkboxList: boolean;
                            semantic: string;
                            hash: string;
                            review?: undefined;
                        } = dialog(view.text, a.kind);
                        a.claudeMultiSelect = d.multiSelect;
                        a.claudeCheckboxList = d.checkboxList === true;
                        a.claudeQuestionReview = d.review === true;
                        a.statusAt += ':' + d.semantic;
                    }
                    a.claudeViewHash = view.hash;
                    binding.uiPending = false;
                }
                catch (error: unknown) {
                    a.claudeUiPending = true;
                    if (automatic &&
                        ((error) as Error & {
                            code?: string;
                        }).message ===
                            'Claude view changed')
                        a.claudeCycling = true;
                    else {
                        a.claudeControlsEnabled = false;
                        a.claudeError = 'Wait for Claude view';
                        if (!binding.uiPending)
                            binding.uiEpoch = (binding.uiEpoch || 0) + 1;
                        binding.uiPending = true;
                    }
                }
            }
            a.claudeUiEpoch = binding.uiEpoch || 0;
        }
        catch {
            this.bindings.delete(key);
            a.nativeVerified = false;
            a.nativeIdentity = null;
            a.chatId = null;
            a.model = null;
            a.effort = null;
            a.runId = null;
            a.claudeError = 'Set up Claude hooks / check version';
        }
        if (previous &&
            previous.id !== a.nativeIdentity &&
            this.b.lastTarget &&
            actor(this.b.lastTarget) === key) {
            this.b.draft = null;
            this.b.picker = null;
            this.picker = null;
            if (sameRoot && a.nativeVerified) {
                this.b.lastTarget = {
                    ...this.b.lastTarget,
                    chatId: a.chatId,
                    nativeIdentity: a.nativeIdentity,
                };
            }
            else {
                this.b.lastTarget = null;
                this.b.selectionNotice = true;
            }
        }
        if (!this.b.lastTarget || actor(this.b.lastTarget) !== key) {
            if (this.picker?.actor === key &&
                previous &&
                previous.id !== a.nativeIdentity)
                this.picker = null;
        }
        return a;
    }
    assert(expected: any, current: any) {
        if (!current?.nativeVerified ||
            !expected?.chatId ||
            expected.chatId !== current.chatId ||
            !expected.nativeIdentity ||
            expected.nativeIdentity !== current.nativeIdentity)
            throw changed();
        if (!current.claudeControlsEnabled)
            throw Error(current.claudeError || 'Claude controls updating');
        if (expected.claudeUiEpoch !== undefined &&
            expected.claudeUiEpoch !== current.claudeUiEpoch)
            throw Error('Claude controls changed; press again');
        if (expected.runId && current.runId !== expected.runId)
            throw Error('Claude turn changed');
    }
    async selected(ready: any = false, initial?: any) {
        const a: any = initial || (await this.b.focused());
        if (a.app !== 'claude-code')
            throw changed();
        this.assert(this.b.actionContext?.target || a, a);
        if (ready && !['idle', 'done', 'error'].includes(a.state))
            throw Error('Claude is not ready');
        return a;
    }
    async readComposer(a: any, options: Record<string, any> | undefined = {}) {
        if (a.backend === 'herdr')
            throw Error('Use the Herdr keyboard');
        const view: any = await this.view(a);
        return composer(view.text, view.cursor, a, options);
    }
    async key(a: any, ...keys: any[]) {
        const fresh: any = await this.b.checked(a);
        this.assert(a, fresh);
        await this.b.run(['send-key', '-s', a.session, '-b', a.block, ...keys]);
    }
    async cycle(kind: string, initial: any) {
        return require('./cycle').cycle(this, kind, initial);
    }
    configurationKeyAllowed(a: any, key: string) {
        const p: NativePicker | null = this.picker;
        return !!(p?.automatic &&
            p.actor === actor(a) &&
            p.identity === a.nativeIdentity &&
            this.b.actionContext &&
            ['model', 'effort'].includes(this.b.actionContext.action) &&
            (p.pending
                ? key === 'alt+p' && ['idle', 'done', 'error'].includes(a.state)
                : a.claudePickerVisible &&
                    ['up', 'down', 'left', 'right', 's', 'esc', 'escape'].includes(key)));
    }
    async openPicker() {
        const a: any = await this.selected(true);
        if (this.picker)
            throw Error('Close Claude model picker first');
        if (a.backend === 'herdr')
            throw Error('Open Claude model picker with the Herdr keyboard');
        await this.readComposer(a, { allowEmpty: true });
        const fresh: any = await this.b.checked(a, true);
        this.assert(a, fresh);
        this.picker = {
            actor: actor(a),
            identity: a.nativeIdentity,
            id: crypto.randomUUID(),
            openedAt: this.now(),
            pending: true,
        };
        try {
            await this.b.run(['send-key', '-s', a.session, '-b', a.block, 'alt+p']);
            this.picker.pending = false;
        }
        catch (error: unknown) {
            this.picker = null;
            throw error;
        }
        this.b.draft = null;
        return { kind: 'model', label: 'Use arrows / Confirm' };
    }
    async waiting(key: string, kind: string, initial: any) {
        const a: any = await this.selected(false, initial), waiting: (x: any) => boolean = (x: any) => x.state === 'blocked' &&
            (kind === 'permission'
                ? x.kind === 'permission'
                : x.kind === 'question');
        if (!waiting(a))
            throw Error('No Claude ' + kind + ' waiting');
        if (![
            'up',
            'down',
            'left',
            'right',
            'enter',
            'escape',
            'tab',
            'shift+tab',
            'space',
        ].includes(key) ||
            (kind === 'permission' &&
                !['up', 'down', 'enter', 'escape'].includes(key)))
            throw Error('Unsupported Claude waiting key');
        if (a.claudePicker &&
            !['up', 'down', 'left', 'right', 'enter', 'escape'].includes(key))
            throw Error('Use arrows, Confirm or Esc in Claude picker');
        if (a.backend === 'herdr' && !a.atBottom)
            throw Error('Scroll the Herdr pane to bottom');
        const before: any = a.claudeViewHash;
        if (typeof before !== 'string')
            throw Error('Claude waiting view unavailable');
        if (key === 'space' && !a.claudeMultiSelect)
            throw Error('No Claude multi-select toggle visible');
        if (a.backend === 'herdr' && this.b.sendClaudeWaitingKey) {
            try {
                await this.b.sendClaudeWaitingKey(a, a.claudePicker && key === 'enter' ? 's' : key, kind);
            }
            finally {
                if (a.claudePicker && ['enter', 'escape'].includes(key))
                    this.picker = null;
            }
            this.b.draft = null;
            return;
        }
        const current: any = await this.b.checked(a);
        this.assert(a, current);
        if (!waiting(current) || current.statusAt !== a.statusAt)
            throw Error('Claude waiting request changed');
        if (before !== current.claudeViewHash)
            throw Error('Claude waiting view changed');
        try {
            await this.b.run([
                'send-key',
                '-s',
                current.session,
                '-b',
                current.block,
                a.claudePicker && key === 'enter' ? 's' : key,
            ]);
        }
        finally {
            if (a.claudePicker && ['enter', 'escape'].includes(key))
                this.picker = null;
        }
        this.b.draft = null;
    }
    async interrupt() {
        const a: any = await this.selected();
        if (a.state !== 'working' || !a.runId)
            throw Error('Claude is not running');
        const view: any = await this.view(a);
        if (!/\besc to interrupt\b/i.test(view.text))
            throw Error('Claude interrupt hint unavailable');
        const identity: string = a.nativeIdentity + '|' + a.runId;
        if (this.submissions.has('interrupt:' + identity))
            throw Error('Interrupt already requested');
        const fresh: any = await this.b.checked(a);
        this.assert(a, fresh);
        if (fresh.state !== 'working' || fresh.runId !== a.runId)
            throw Error('Claude turn ended');
        if (!/\besc to interrupt\b/i.test((await this.view(fresh)).text))
            throw Error('Claude interrupt context changed');
        this.submissions.set('interrupt:' + identity, this.now());
        this.b.draft = null;
        await this.key(fresh, 'escape');
        return { kind: 'interrupt', label: 'Interrupt requested' };
    }
    async stage(action: string) {
        const a: any = await this.selected(true), text: any = this.b.config.prompts[action];
        if (this.b.draft || this.picker)
            throw Error('Review or cancel the current draft first');
        if (!['review', 'tests', 'continue'].includes(action) ||
            !S.text(text, 4000) ||
            /^\s*[!\/]/.test(text))
            throw Error('Invalid plain-text shortcut');
        const before: {
            chatId: string | null | undefined;
            identity: string | null | undefined;
            turnStamp: string | null | undefined;
            hash: string;
            cursor: {
                row: any;
                column: any;
            };
            empty: boolean;
        } = await this.readComposer(a, { allowEmpty: true }), modes: any = await this.b.method(a, 'modes');
        if (!modes.modes?.some((m: any) => m.number === 2004 && m.set))
            throw Error('Bracketed paste unavailable');
        await this.b.checked(a, true);
        await this.b.run(['send', '-s', a.session, '-b', a.block], `\x1b[200~${text}\x1b[201~`);
        const snapshot: {
            chatId: string | null | undefined;
            identity: string | null | undefined;
            turnStamp: string | null | undefined;
            hash: string;
            cursor: {
                row: any;
                column: any;
            };
            empty: boolean;
        } = await this.readComposer(a, { allowEmpty: true });
        if (snapshot.identity !== before.identity ||
            snapshot.turnStamp !== before.turnStamp ||
            snapshot.empty ||
            snapshot.hash === before.hash)
            throw Error('Paste not confirmed; use Claude keyboard');
        await this.b.checked(a, true);
        this.b.draft = { target: a, at: this.now(), action, snapshot };
    }
    async send() {
        const draft: any = this.b.draft;
        if (!draft ||
            draft.target.app !== 'claude-code' ||
            this.now() - draft.at > this.b.config.draftMaxAgeMs)
            throw Error('No recent Claude draft');
        try {
            const a: any = await this.selected(true);
            this.assert(draft.target, a);
            const before: {
                chatId: string | null | undefined;
                identity: string | null | undefined;
                turnStamp: string | null | undefined;
                hash: string;
                cursor: {
                    row: any;
                    column: any;
                };
                empty: boolean;
            } = await this.readComposer(a), current: any = await this.b.checked(a, true), after: {
                chatId: string | null | undefined;
                identity: string | null | undefined;
                turnStamp: string | null | undefined;
                hash: string;
                cursor: {
                    row: any;
                    column: any;
                };
                empty: boolean;
            } = await this.readComposer(current);
            if (!same(draft.snapshot, before) || !same(before, after))
                throw Error('Claude draft changed; use keyboard');
            this.b.draft = null;
            await this.key(current, 'enter');
        }
        catch (error: unknown) {
            this.b.draft = null;
            throw error;
        }
    }
    async running(kind: string) {
        if (!['steer', 'queue'].includes(kind))
            throw Error('Unsupported Claude input action');
        const a: any = await this.selected();
        if (a.state !== 'working' || !a.runId)
            throw Error('Claude is not running');
        const before: {
            chatId: string | null | undefined;
            identity: string | null | undefined;
            turnStamp: string | null | undefined;
            hash: string;
            cursor: {
                row: any;
                column: any;
            };
            empty: boolean;
        } = await this.readComposer(a), current: any = await this.b.checked(a), after: {
            chatId: string | null | undefined;
            identity: string | null | undefined;
            turnStamp: string | null | undefined;
            hash: string;
            cursor: {
                row: any;
                column: any;
            };
            empty: boolean;
        } = await this.readComposer(current);
        this.assert(a, current);
        if (current.state !== 'working' ||
            current.runId !== a.runId ||
            !same(before, after))
            throw Error('Claude turn or input changed');
        const identity: string = a.nativeIdentity + '|' + a.runId + '|' + before.hash;
        if (this.submissions.has(identity))
            throw Error('Already submitted; check Claude');
        this.submissions.set(identity, this.now());
        this.b.draft = null;
        await this.key(current, ...(kind === 'queue' ? ['enter'] : ['ctrl+x', 'ctrl+s']));
        return { kind, label: kind === 'queue' ? 'Queued' : 'Sent now' };
    }
}
module.exports = { ClaudeControls, composer, dialog, same, actor };

export {ClaudeControls};
