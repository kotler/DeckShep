const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  net = require('node:net');
const { spawnSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const {
  authorization,
  settingsHashes,
  OwnedProcesses,
} = require('./safety.cjs');
const {
  isolatedEnvironment,
  signedInCredentials,
} = require('./environment.cjs');
const reason = authorization('herdr-tui');
test(
  'live Herdr: isolated server, disposable providers, native selection/zoom and settings fingerprints',
  { skip: reason || false, timeout: 480000 },
  async (t) => {
    const before = settingsHashes(os.homedir()),
      directory = fs.realpathSync(
        fs.mkdtempSync(path.join('/tmp', 'asw-live-')),
      ),
      owned = new OwnedProcesses();
    let verifyCredentials = () => {};
    t.after(async () => {
      try {
        try {
          await owned.shutdown();
        } finally {
          verifyCredentials();
          assert.deepEqual(
            settingsHashes(os.homedir()),
            before,
            'GLOBAL SETTINGS CHANGED',
          );
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
    assert(
      process.env.ASW_CODEX_MODEL && process.env.ASW_CLAUDE_MODEL,
      'Select supported low-cost models explicitly',
    );
    const printCommand = "printf 'asw-private-approval\\n'";
    const socket = path.join(directory, 'herdr.sock'),
      repo = path.join(directory, 'repo');
    fs.mkdirSync(repo);
    assert.equal(
      spawnSync('git', ['init', repo], { stdio: 'ignore' }).status,
      0,
    );
    const env = isolatedEnvironment(directory);
    const plugin = path.join(directory, 'com.kotl3r.deckshep.sdPlugin');
    fs.cpSync(path.resolve('dist/com.kotl3r.deckshep.sdPlugin'), plugin, {
      recursive: true,
    });
    const configured = spawnSync(
      process.execPath,
      [
        path.join(plugin, 'configure-claude.js'),
        '--plugin-dir',
        plugin,
        '--settings',
        path.join(env.CLAUDE_CONFIG_DIR, 'settings.json'),
        '--statusline',
        '--apply',
      ],
      { cwd: repo, env, stdio: 'ignore' },
    );
    assert.equal(configured.status, 0, 'Private Claude hook setup failed');
    const privateSettings = path.join(env.CLAUDE_CONFIG_DIR, 'settings.json');
    const claudeSettings = JSON.parse(fs.readFileSync(privateSettings));
    claudeSettings.permissions = { ask: ['Bash'] };
    fs.writeFileSync(privateSettings, JSON.stringify(claudeSettings), {
      mode: 0o600,
    });
    if (process.env.ASW_LIVE_AUTH === 'signed-in')
      verifyCredentials = signedInCredentials(env);
    else {
      assert(
        process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY,
        'Supply test credentials or authorize signed-in accounts',
      );
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    fs.writeFileSync(
      path.join(env.CODEX_HOME, 'config.toml'),
      'cli_auth_credentials_store = "file"\nmodel_reasoning_effort = "low"\nsandbox_mode = "read-only"\napproval_policy = "on-request"\n[projects.' +
        JSON.stringify(repo) +
        ']\ntrust_level = "trusted"\n',
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(env.CLAUDE_CONFIG_DIR, '.claude.json'),
      JSON.stringify({
        hasCompletedOnboarding: true,
        theme: 'dark',
        projects: {
          [repo]: {
            hasTrustDialogAccepted: true,
            hasCompletedProjectOnboarding: true,
          },
        },
      }),
      { mode: 0o600 },
    );
    fs.copyFileSync(
      path.join(env.CLAUDE_CONFIG_DIR, '.claude.json'),
      path.join(env.HOME, '.claude.json'),
    );
    for (const [binary, version] of [
      ['codex', 'codex-cli 0.167.0'],
      ['claude', '2.1.319 (Claude Code)'],
    ]) {
      const result = spawnSync(binary, ['--version'], {
        env,
        cwd: repo,
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.status, 0, 'Native version probe failed');
      assert.equal(
        result.stdout.trim(),
        version,
        'Only calibrated provider versions are accepted',
      );
    }
    assert.equal(
      spawnSync(
        process.env.ASW_HERDR_BINARY || 'herdr',
        ['integration', 'install', 'claude'],
        { cwd: repo, env, stdio: 'ignore', timeout: 10000 },
      ).status,
      0,
      'Private Herdr Claude lifecycle integration failed',
    );
    const codexSocket = path.join(directory, 'codex.sock');
    const codexServer = owned.spawn(
      'codex',
      ['app-server', '--listen', 'unix://' + codexSocket],
      { cwd: repo, env },
    );
    const server = owned.spawn(
      process.env.ASW_HERDR_BINARY || 'herdr',
      ['server'],
      { cwd: repo, env },
    );
    const wait = async (predicate, timeout = 30000) => {
      const end = Date.now() + timeout;
      for (;;) {
        owned.assert(server.pid);
        if (await predicate()) return;
        if (Date.now() > end) throw Error('Isolated native state timed out');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    await wait(async () => fs.existsSync(socket));
    const stat = fs.lstatSync(socket);
    assert(
      stat.isSocket() &&
        stat.uid === process.getuid() &&
        !stat.isSymbolicLink(),
    );
    fs.chmodSync(socket, 0o600);
    await wait(async () => fs.existsSync(codexSocket));
    owned.assert(codexServer.pid);
    const endpointIdentity = `${stat.dev}:${stat.ino}`;
    function assertEndpoint() {
      owned.assert(server.pid);
      const current = fs.lstatSync(socket);
      assert(
        current.isSocket() &&
          current.uid === process.getuid() &&
          !(current.mode & 0o077),
      );
      assert.equal(
        `${current.dev}:${current.ino}`,
        endpointIdentity,
        'Private socket was replaced',
      );
      assert(fs.realpathSync(socket).startsWith(directory + '/'));
    }
    let id = 0;
    async function request(method, params = {}) {
      assertEndpoint();
      return new Promise((resolve, reject) => {
        let client,
          done = false,
          data = '';
        const decoder = new StringDecoder('utf8'),
          requestId = String(++id);
        const finish = (error, result) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          client?.destroy();
          error ? reject(error) : resolve(result);
        };
        const timer = setTimeout(
          () => finish(Error('Isolated RPC timeout; no retry')),
          35000,
        );
        client = net.createConnection(socket);
        client.on('error', () => finish(Error('Isolated RPC unavailable')));
        client.on('end', () =>
          finish(Error('Isolated RPC ended before reply')),
        );
        client.on('connect', () => {
          try {
            assertEndpoint();
            client.write(
              JSON.stringify({ id: requestId, method, params }) + '\n',
            );
          } catch (error) {
            finish(error);
          }
        });
        client.on('data', (bytes) => {
          if (done) return;
          data += decoder.write(bytes);
          if (Buffer.byteLength(data) > 4e6)
            return finish(Error('Oversized isolated reply'));
          if (!data.includes('\n')) return;
          try {
            const reply = require('../../src/schemas').parse(
              'herdrFrame',
              data.split('\n')[0],
            );
            assert.equal(reply.id, requestId);
            if (reply.error)
              throw Error(
                'Isolated request refused: ' +
                  method +
                  ' code ' +
                  reply.error.code,
              );
            finish(null, reply.result);
          } catch (error) {
            finish(error);
          }
        });
      });
    }
    const ping = await request('ping');
    assert.equal(
      ping.protocol,
      22,
      'Only the verified Herdr protocol is accepted',
    );
    assert.equal(ping.version, '0.9.5');
    t.diagnostic(
      'Private Herdr protocol/version and owned Codex server verified',
    );
    const workspace = await request('workspace.create', {
      cwd: repo,
      focus: true,
      label: 'asw-owned',
    });
    const snapshot = await request('session.snapshot');
    // The installed protocol-22 shape is also checked by the production bridge;
    // fail rather than guessing IDs on an unverified native version.
    assert.equal(snapshot.snapshot?.protocol, 22);
    assert.equal(ping.version, '0.9.5');
    const firstPane = workspace.root_pane?.pane_id;
    assert(
      firstPane &&
        snapshot.snapshot.panes.some((pane) => pane.pane_id === firstPane),
      'Dedicated pane creation failed',
    );
    await request('agent.start', {
      name: 'asw-codex',
      kind: 'codex',
      pane_id: firstPane,
      args: [
        '--model',
        process.env.ASW_CODEX_MODEL,
        '--remote',
        'unix://' + codexSocket,
      ],
    });
    const split = await request('pane.split', {
      target_pane_id: firstPane,
      direction: 'right',
      cwd: repo,
      focus: false,
    });
    const secondPane = split.root_pane?.pane_id || split.pane?.pane_id;
    assert(secondPane && secondPane !== firstPane);
    await request('agent.start', {
      name: 'asw-claude',
      kind: 'claude',
      pane_id: secondPane,
      args: ['--model', process.env.ASW_CLAUDE_MODEL, '--effort', 'low'],
    });
    // Only this newly started pane receives the native title command.
    const firstProcess = (
      await request('pane.process_info', { pane_id: firstPane })
    ).process_info;
    for (const foreground of firstProcess.foreground_processes || [])
      owned.observe(foreground.pid);
    const secondProcess = (
      await request('pane.process_info', { pane_id: secondPane })
    ).process_info;
    for (const foreground of secondProcess.foreground_processes || [])
      owned.observe(foreground.pid);
    await request('pane.send_text', {
      pane_id: firstPane,
      text: '/title thread-id',
    });
    await request('pane.send_keys', { pane_id: firstPane, keys: ['Enter'] });
    const { HerdrBridge } = require('../../src/app/herdr-session');
    const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
    const bridge = new HerdrBridge({
      ...defaults,
      backend: 'herdr',
      herdr: { socketPath: socket, titleIdentity: true },
      claude: { enabled: true },
    });
    const S = require('../../src/agents/claude/state');
    bridge.claude =
      new (require('../../src/agents/claude/controls').ClaudeControls)(bridge, {
        read: (pid) => S.readRecord(pid, path.join(plugin, 'state/claude')),
      });
    let lastFound = [];
    try {
      await wait(async () => {
        lastFound = await bridge.discover();
        return (
          lastFound.length === 2 && lastFound.every((a) => a.nativeVerified)
        );
      });
    } catch (error) {
      t.diagnostic(
        JSON.stringify(
          lastFound.map((a) => ({
            app: a.app,
            verified: a.nativeVerified,
            error:
              typeof (a.nativeError || a.claudeError) === 'string' &&
              !(a.nativeError || a.claudeError).includes('/')
                ? a.nativeError || a.claudeError
                : 'unavailable',
          })),
        ),
      );
      const info = (await request('agent.get', { target: firstPane })).agent;
      t.diagnostic(
        JSON.stringify({
          nativeTitleUUID: /^[a-f0-9-]{29,36}(?:\.\.\.)?$/.test(
            info.terminal_title_stripped,
          ),
          claudeRecords: fs.existsSync(path.join(plugin, 'state/claude')),
        }),
      );
      const view = (
        await request('pane.read', {
          pane_id: secondPane,
          source: 'visible',
          format: 'text',
          strip_ansi: true,
        })
      ).read.text;
      t.diagnostic(
        JSON.stringify({
          welcome: /Welcome to Claude/.test(view),
          trust: /trust this|trust the files/i.test(view),
          theme: /text style|text theme|dark mode/i.test(view),
          login: /log in|login|sign in/i.test(view),
          security: /security|safety check|Quick safety/i.test(view),
          hooks: /hook error|Hook error/i.test(view),
        }),
      );
      throw error;
    }
    t.diagnostic('Both disposable providers discovered');
    const agents = await bridge.discover();
    for (const agent of agents) owned.observe(agent.pid);
    const { createApplication } = require('../../src/app/controller');
    const { EventEmitter } = require('node:events');
    const host = new EventEmitter(),
      frames = [];
    host.readyState = 1;
    host.send = (raw) => frames.push(JSON.parse(raw));
    const config = {
      ...defaults,
      backend: 'herdr',
      herdr: { socketPath: socket, titleIdentity: true },
      claude: { enabled: true },
    };
    const app = createApplication({
      socket: host,
      fs: { readFileSync: () => JSON.stringify(config) },
      backendFactory: () => bridge,
      setInterval: () => {},
    });
    for (let index = 0; index < 15; index++)
      app.receive({
        event: 'willAppear',
        context: 'live-' + index,
        payload: {
          coordinates: { column: index % 5, row: Math.floor(index / 5) },
          settings: { profileScope: 'herdr' },
        },
      });
    await app.settled();
    const runtime = [...app.controllers.values()][0];
    async function refresh() {
      await runtime.refresh(true);
      await app.settled();
    }
    async function press(index, expectAlert = false) {
      for (const agent of await bridge.discover()) owned.assert(agent.pid);
      await new Promise((resolve) => setTimeout(resolve, 400));
      app.receive({ event: 'keyDown', context: 'live-' + index });
      await app.settled();
      if (!expectAlert) {
        const key = runtime.keys.get('live-' + index);
        assert(
          !key.feedback,
          'Native ' +
            key.presented?.action +
            ' refused: ' +
            (key.feedback?.message || 'unavailable'),
        );
      }
    }
    await press(0);
    assert.equal((await bridge.focused()).block, agents[0].block);
    await press(7);
    assert.equal((await bridge.focused()).block, agents[1].block);
    await press(7);
    assert.equal((await bridge.focused()).block, agents[0].block);
    async function select(block) {
      await refresh();
      const index = bridge.slots.findIndex((slot) => slot.block === block);
      assert(index >= 0 && index < 5);
      await press(index);
    }
    const D = require('../../src/agents/codex/daemon');
    async function native(operation) {
      owned.assert(codexServer.pid);
      const rpc = new D.DaemonRpc(codexSocket);
      await rpc.connect();
      try {
        return await operation(rpc);
      } finally {
        rpc.close();
      }
    }
    const codex = agents.find((a) => a.app === 'codex');
    assert(codex.chatId);
    await press(agents.indexOf(codex));
    const { latestTurn } = require('../../src/agents/codex/background');
    async function turn() {
      return native((rpc) => latestTurn(rpc, codex.chatId));
    }
    async function completedTurn(previous) {
      await wait(async () => {
        let value;
        try {
          value = await turn();
        } catch {
          return false;
        }
        if (value.id === previous) return false;
        if (value.status === 'failed')
          throw Error('Disposable model request failed');
        return value.status === 'completed';
      }, 90000);
    }
    await request('agent.prompt', {
      target: codex.block,
      text: 'Reply OK only. Do not use tools.',
    });
    await completedTurn(null);
    await select(codex.block);
    assert.equal(runtime.keys.get('live-11').presented.action, 'effort');
    const originalSettings = await native((rpc) =>
      D.readPermissionSettings(rpc, codex.chatId),
    );
    await press(11);
    const changedSettings = await native((rpc) =>
      D.readPermissionSettings(rpc, codex.chatId),
    );
    assert.notEqual(
      changedSettings.effort,
      originalSettings.effort,
      'Effort press must change native state',
    );
    for (let cycle = 0; cycle < 8; cycle++) {
      if (
        (await native((rpc) => D.readPermissionSettings(rpc, codex.chatId)))
          .effort === originalSettings.effort
      )
        break;
      await refresh();
      await press(11);
    }
    assert.deepEqual(
      await native((rpc) => D.readPermissionSettings(rpc, codex.chatId)),
      originalSettings,
      'Effort cycling must restore every setting',
    );
    t.diagnostic(
      'Native Codex Effort cycle and full-settings restoration passed',
    );
    const previousTurn = (await turn()).id;
    await request('agent.prompt', {
      target: codex.block,
      text: 'Write an original 10000-word adventure story as continuous prose. Start the story immediately and keep writing. Do not use tools, summarize, outline, or provide code.',
    });
    await wait(async () => {
      const value = await turn();
      return value.id !== previousTurn && value.status === 'inProgress';
    });
    await select(codex.block);
    const activeTurn = await turn();
    await press(14);
    await wait(async () => {
      const value = await turn();
      return value.id === activeTurn.id && value.status === 'interrupted';
    });
    t.diagnostic('Native Interrupt stopped the exact disposable turn');
    await select(codex.block);
    const { terminalIds } = require('../../src/agents/codex/background');
    if ((await native((rpc) => terminalIds(rpc, codex.chatId))).length) {
      assert.equal(
        runtime.keys.get('live-14').presented.action,
        'stopTerminals',
      );
      await press(14);
      await wait(
        async () =>
          !(await native((rpc) => terminalIds(rpc, codex.chatId))).length,
      );
      await refresh();
    }
    assert.equal(
      runtime.keys.get('live-13').presented.action,
      'plan',
      'Question setup requires the native ready state',
    );
    await press(13); // Native Plan mode exposes request_user_input.
    assert.equal(
      (await native((rpc) => D.readPermissionSettings(rpc, codex.chatId)))
        .collaborationMode.mode,
      'plan',
    );
    const questionTurn = (await turn()).id;
    await request('agent.prompt', {
      target: codex.block,
      text: 'Use request_user_input to ask exactly one single-choice question with Red and Blue options. Do not use any other tools.',
    });
    await wait(async () => {
      const a = (await bridge.discover()).find((a) => a.block === codex.block);
      if ((await turn()).status === 'completed')
        throw Error(
          'Disposable question turn ended before a native request appeared',
        );
      return a?.state === 'blocked' && a.kind === 'question';
    }, 90000);
    await select(codex.block);
    await press(11);
    await press(12);
    await completedTurn(questionTurn);
    await select(codex.block);
    await press(13);
    assert.deepEqual(
      await native((rpc) => D.readPermissionSettings(rpc, codex.chatId)),
      originalSettings,
      'Question scenario must restore original settings',
    );
    t.diagnostic(
      'Native Codex question navigation/confirmation completed and Plan settings restored',
    );
    const approvalTurn = (await turn()).id;
    await request('agent.prompt', {
      target: codex.block,
      text:
        'Execute exactly ' +
        printCommand +
        " using exec_command with sandbox_permissions=require_escalated and justification='Disposable print-only approval test'. Ask for one-time approval. Do not save an approval rule or run any other command.",
    });
    await wait(async () => {
      const a = (await bridge.discover()).find((a) => a.block === codex.block);
      return a?.state === 'blocked' && a.kind === 'permission';
    }, 90000);
    await select(codex.block);
    const approvalView = await bridge.use((rpc) =>
      bridge.readView(rpc, codex, 'text'),
    );
    const displayedCommands = approvalView
      .split('\n')
      .filter((line) => /^\s*\$\s+/.test(line))
      .map((line) => line.replace(/^\s*\$\s+/, '').trim());
    assert.equal(
      displayedCommands.length,
      1,
      'Approval must display exactly one complete command',
    );
    assert.equal(
      displayedCommands[0],
      printCommand,
      'Only the exact test print command may be approved',
    );
    const rules = path.join(env.CODEX_HOME, 'rules/default.rules');
    const rulesBefore = fs.existsSync(rules) ? fs.readFileSync(rules) : null;
    await press(12);
    await completedTurn(approvalTurn);
    assert.deepEqual(
      await native((rpc) => D.readPermissionSettings(rpc, codex.chatId)),
      originalSettings,
      'One-time approval must preserve settings',
    );
    assert.deepEqual(
      fs.existsSync(rules) ? fs.readFileSync(rules) : null,
      rulesBefore,
      'Approval must not persist a rule',
    );
    t.diagnostic(
      'Native Codex one-time print-only approval completed without changed settings',
    );
    await select(codex.block);
    await press(12); // Zoom uses the production native-focus and input guards.
    const other = agents.find((a) => a.block !== codex.block);
    owned.assert(other.pid);
    await request('agent.focus', { target: other.block });
    const beforeAlerts = frames.filter(
      (frame) => frame.event === 'showAlert',
    ).length;
    await press(14, true);
    assert(
      frames.filter((frame) => frame.event === 'showAlert').length >
        beforeAlerts,
      'Stale native focus must refuse Interrupt',
    );
    assert.equal((await bridge.focused()).block, other.block);
    await refresh();
    const claude = agents.find((a) => a.app === 'claude-code');
    await press(agents.indexOf(claude));
    async function claudeState() {
      return S.readRecord(claude.pid, path.join(plugin, 'state/claude'));
    }
    async function waitClaude(predicate) {
      await wait(async () => {
        const view = await bridge.use((rpc) =>
          bridge.readView(rpc, claude, 'text'),
        );
        if (/hit your.*limit|usage limit|rate limit/i.test(view))
          throw Object.assign(Error('Signed-in Claude usage limit'), {
            code: 'ASW_CLAUDE_USAGE_LIMIT',
          });
        return predicate(await claudeState());
      }, 90000);
      await refresh();
    }
    await t.test('Claude native question and print-only approval', async () => {
      await request('agent.prompt', {
        target: claude.block,
        text: 'Use AskUserQuestion now to ask exactly one single-choice question with options Red and Blue. Do not use any other tools.',
      });
      await waitClaude((r) => r.state === 'blocked' && r.kind === 'question');
      const question = await claudeState();
      await press(11); // Down to the second native option.
      await press(12); // Native question review.
      await refresh();
      if ((await claudeState()).state === 'blocked') {
        const view = await bridge.use((rpc) =>
          bridge.readView(rpc, claude, 'text'),
        );
        let review = false;
        try {
          review =
            require('../../src/agents/claude/controls').dialog(view, 'question')
              .review === true;
        } catch {}
        if (review) await press(12);
      }
      await waitClaude(
        (r) => r.turnId === question.turnId && r.state === 'done',
      );
      t.diagnostic(
        'Native Claude question completed through deck navigation/confirmation',
      );
      await request('agent.prompt', {
        target: claude.block,
        text:
          'Use Bash with exactly these arguments: ' +
          JSON.stringify({
            command: printCommand,
            description: 'Print fixed test marker',
          }) +
          '. Do not run another command or save a persistent approval rule.',
      });
      await waitClaude((r) => r.state === 'blocked' && r.kind === 'permission');
      const approval = await claudeState();
      const allowedInputs = [
        { command: printCommand, description: 'Print fixed test marker' },
        { description: 'Print fixed test marker', command: printCommand },
        { command: printCommand },
      ];
      assert(
        allowedInputs.some(
          (input) => S.hash(['Bash', input]) === approval.pendingToolDigest,
        ),
        'Only the exact native print tool request may be approved',
      );

      const settingsBefore = fs.readFileSync(privateSettings);
      await press(12); // One-time Allow; never select the persistent-rule option.
      await waitClaude(
        (r) => r.turnId === approval.turnId && r.state === 'done',
      );
      assert(
        fs.readFileSync(privateSettings).equals(settingsBefore),
        'Approval must not persist a rule',
      );
      t.diagnostic(
        'Native Claude one-time print-only approval completed without saved rule',
      );
    });
    await request('pane.close', { pane_id: codex.block });
    await wait(async () => (await bridge.discover()).length === 1);
    await refresh();
    assert.equal(
      bridge.slots.length,
      2,
      'Closed agent must leave a stable slot',
    );
    await press(5);
    assert.equal(
      bridge.slots.length,
      1,
      'Collapse must remove the closed slot',
    );
    assert.equal(
      bridge.slots[0].block,
      claude.block,
      'Collapse must preserve live order',
    );
    t.diagnostic(
      'Native pane closure and explicit Collapse preserved the surviving agent',
    );
    assert.deepEqual(settingsHashes(os.homedir()), before);
  },
);
