const boundary = require('../../schemas');
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), TOML = require('@iarna/toml');
const codexFile: () => string = () => path.join(((process.env.HOME) as string), '.codex', 'config.toml');
const signature: (c: any) => string = (c: any) => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
function readPresets() {
    return (((TOML.parse(fs.readFileSync(codexFile(), 'utf8')).tui) as any)?.presets || {});
}
function readRegistry(file: string) {
    try {
        return boundary.parse('registry', fs.readFileSync(file, 'utf8'));
    }
    catch (e: unknown) {
        if (((e) as Error & {
            code?: string;
        }).code === 'ENOENT')
            return { agents: {} };
        throw e;
    }
}
function saveRegistry(file: string, value: any) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp: string = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
}
function choices(config: Record<string, any>, baseline: any) {
    if (!/^\/permissions\s+\S+\s+--approval-policy=/.test(baseline) ||
        !/ --reviewer=(user|auto_review)$/.test(baseline))
        throw Error('Unsupported permission snapshot');
    const models: any = config.models.map((m: any, i: any) => ({
        slot: String(i + 1),
        label: m.label,
        input: '/model ' + m.id,
        kind: 'model',
    }));
    const efforts: any = config.efforts.map((e: any, i: any) => ({
        slot: String(models.length + i + 1),
        label: e,
        input: '/model --reasoning=' + e,
        kind: 'effort',
    }));
    if (models.length + efforts.length !== 7)
        throw Error('Setup needs three models and four effort levels');
    const permissions: {
        slot: string;
        label: string;
        input: any;
        kind: string;
    }[] = [
        {
            slot: '8',
            label: 'Approve for me',
            input: baseline.replace(/ --reviewer=(user|auto_review)$/, ' --reviewer=auto_review'),
            kind: 'permissions',
        },
        {
            slot: '9',
            label: 'Ask me',
            input: baseline.replace(/ --reviewer=(user|auto_review)$/, ' --reviewer=user'),
            kind: 'permissions',
        },
    ];
    for (const m of config.models)
        if (!/^[a-z0-9.-]+$/.test(m.id))
            throw Error('Invalid model ID');
    for (const e of config.efforts)
        if (!['low', 'medium', 'high', 'xhigh'].includes(e))
            throw Error('Invalid effort');
    return [...models, ...efforts, ...permissions];
}
function validateOnDisk(entries: any[]) {
    const p: any = readPresets();
    for (const e of entries)
        if (p[e.slot]?.input !== e.input)
            throw Error('Native presets changed; run setup again');
}
module.exports = {
    readPresets,
    readRegistry,
    saveRegistry,
    choices,
    validateOnDisk,
    signature,
    codexFile,
};

export {};
