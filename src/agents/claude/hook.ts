#!/usr/bin/env node
const boundary = require('../../schemas');
type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const { pluginDirectory } = require("../../platform/paths.ts");
const S = require('./state');
async function main() {
    const statusline: boolean = process.argv.includes('--statusline'), lost: () => Promise<void> = async () => {
        if (!statusline)
            try {
                await S.invalidate();
            }
            catch { }
    };
    let size: number = 0, chunks: any[] = [];
    for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 1048576) {
            await lost();
            return;
        }
        chunks.push(chunk);
    }
    const input: Buffer<ArrayBuffer> = Buffer.concat(chunks);
    let data: any;
    try {
        data = boundary.parse('claudePayload', input.toString('utf8'));
    }
    catch {
        await lost();
        return;
    }
    try {
        await S.record(data, { statusline });
    }
    catch { }
    if (statusline) {
        const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
        const saved: any = boundary.parse('setupRecord', fs.readFileSync(path.join(pluginDirectory, 'state', 'claude-setup.json'), 'utf8'));
        const command: any = saved.originalStatusLine?.command;
        if (command) {
            const child: import("child_process").ChildProcessByStdio<import("stream").Writable, import("stream").Readable, null> = spawn('/bin/sh', ['-c', command], {
                stdio: ['pipe', 'pipe', 'ignore'],
            });
            child.stdout.pipe(process.stdout);
            child.stdin.on('error', () => { });
            child.stdin.end(input);
            const timer: NodeJS.Timeout = setTimeout(() => child.kill(), 2500);
            await new Promise((resolve: (value: any) => void) => {
                child.on('error', resolve);
                child.on('close', resolve);
            });
            clearTimeout(timer);
        }
        else
            process.stdout.write('Claude ' +
                (S.text(data.model?.display_name) ? data.model.display_name : '') +
                (S.text(data.effort?.level) ? ' · ' + data.effort.level : ''));
    }
}
if (require.main === module)
    main().catch(() => { });
module.exports = { main };

export {};
