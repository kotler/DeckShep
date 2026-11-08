type DaemonRpc = import("./daemon").DaemonRpc;
type Setup = import("./setup-presets").Setup;
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const { pluginDirectory } = require("../../platform/paths.ts");
const fs = require('node:fs'), path = require('node:path');
const { token } = require('../../domain/identity'), { Setup } = require('./setup-presets'), P = require('./presets');
const { readFooter, socketFor, DaemonRpc, loadedThread, } = require('./daemon');
function statusLineWithId(original: string) {
    if (!/^\/statusline(?: [a-z0-9-]+)+$/.test(original))
        throw Error('Invalid native status-line command');
    const fields: string[] = original
        .split(' ')
        .slice(1)
        .filter((x: string) => !['session-id', 'thread-id', '--clear'].includes(x));
    if (!fields.includes('model-with-reasoning'))
        fields.unshift('model-with-reasoning');
    return '/statusline session-id ' + fields.join(' ');
}
async function configure(bridge: Record<string, any>, agent: import("../../domain/types").AgentSnapshot, directory: string) {
    const setup: Setup = new Setup(bridge), file: string = path.join(directory, 'state', 'native-presets.json'), registry: any = P.readRegistry(file), onDisk: any = P.readPresets()['0']?.input;
    if (onDisk && onDisk !== registry.scratch?.input)
        throw Error('Preset 0 belongs to you or changed');
    await bridge.focus(agent);
    await bridge.checked(agent, true);
    const endpoint: {
        pid: number;
        socket: string;
    } = await socketFor(agent.pid), rpc: DaemonRpc = new DaemonRpc(endpoint.socket);
    try {
        await rpc.connect();
        const original: any = await setup.currentStatusLine(agent), input: string = statusLineWithId(original);
        const stateFile: string = path.join(directory, 'state', 'daemon-controls.json'), state: any = P.readRegistry(stateFile);
        state.agents[token(agent)] ??= { originalStatusLine: original };
        P.saveRegistry(stateFile, state);
        await setup.store(agent, '0', input);
        registry.scratch = { slot: '0', input };
        P.saveRegistry(file, registry);
        P.validateOnDisk([registry.scratch]);
        await setup.key(agent, 'ctrl+x', 'p', '0');
        await setup.store(agent, '0', '/statusline');
        registry.scratch = { slot: '0', input: '/statusline' };
        P.saveRegistry(file, registry);
        await setup.key(agent, 'ctrl+x', 'p', '0');
        await setup.wait(agent, (s: any) => /^\s*Configure Status Line\s*$/m.test(s), 'Status-line picker missing');
        const picker: any = await setup.screen(agent);
        if (!/^\s*(?:› )?\[x\] thread-id\s/m.test(picker) ||
            !/^\s*(?:› )?\[x\] model-with-reasoning\s/m.test(picker))
            throw Error('Footer selection not verified');
        await setup.key(agent, 'enter');
        await setup.wait(agent, (s: any) => !/^\s*Configure Status Line\s*$/m.test(s), 'Footer preferences were not saved');
        let id: any;
        for (let i: number = 0; i < 15; i++) {
            try {
                id = await readFooter(bridge, agent);
                break;
            }
            catch {
                await new Promise((r: (value: any) => void) => setTimeout(r, 100));
            }
        }
        if (!id)
            throw Error('Session-ID footer was not confirmed');
        const thread: {
            id: any;
            model: any;
            effort: any;
            cwd: any;
        } = await loadedThread(rpc, id);
        if (thread.cwd !== agent.cwd)
            throw Error('Pane directory does not match thread');
        state.agents[token(agent)].statusLine = input;
        P.saveRegistry(stateFile, state);
        return {
            pid: agent.pid,
            threadId: id,
            model: thread.model,
            effort: thread.effort,
        };
    }
    finally {
        rpc.close();
    }
}
module.exports = { configure, statusLineWithId };

export {};
