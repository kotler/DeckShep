const crypto = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawnSync } = require('node:child_process');
const { authorization } = require('./safety.cjs');
function isolatedEnvironment(directory, source = process.env) {
  const env = {};
  // Never inherit terminal routing, daemon addresses, hooks, NODE_OPTIONS or
  // another agent's context. These are the only host environment dependencies.
  for (const key of [
    'PATH',
    'LANG',
    'LC_ALL',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
    'CODEX_CA_CERTIFICATE',
  ])
    if (source[key]) env[key] = source[key];
  Object.assign(env, {
    HOME: path.join(directory, 'home'),
    SHELL: '/bin/sh',
    TERM: 'xterm-256color',
    XDG_CONFIG_HOME: path.join(directory, 'config'),
    XDG_STATE_HOME: path.join(directory, 'state'),
    XDG_CACHE_HOME: path.join(directory, 'cache'),
    TMPDIR: path.join(directory, 'tmp'),
    HERDR_SOCKET_PATH: path.join(directory, 'herdr.sock'),
    CODEX_HOME: path.join(directory, 'home/.codex'),
    CLAUDE_CONFIG_DIR: path.join(directory, 'home/.claude'),
    DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_AUTO_CONNECT_IDE: '0',
  });
  for (const key of [
    'HOME',
    'XDG_CONFIG_HOME',
    'XDG_STATE_HOME',
    'XDG_CACHE_HOME',
    'TMPDIR',
    'CODEX_HOME',
    'CLAUDE_CONFIG_DIR',
  ])
    fs.mkdirSync(env[key], { recursive: true, mode: 0o700 });
  return env;
}
function accessOnly(auth, now = Date.now()) {
  let expiration;
  try {
    expiration =
      JSON.parse(
        Buffer.from(auth.tokens.access_token.split('.')[1], 'base64url'),
      ).exp * 1000;
  } catch {
    throw Error('Signed-in Codex access token unavailable');
  }
  if (!Number.isFinite(expiration) || expiration < now + 1200000)
    throw Error('Sign-in expires too soon for isolated calibration');
  // Never hand a disposable agent the shared refresh token. It must fail when
  // the existing access token expires, rather than rotate the owner's login.
  return {
    ...auth,
    tokens: { ...auth.tokens, refresh_token: '' },
    last_refresh: new Date(now).toISOString(),
  };
}
function signedInCredentials(env, source = process.env) {
  if (
    authorization('herdr-tui', source) ||
    source.ASW_LIVE_AUTH !== 'signed-in'
  )
    throw Error('Signed-in live calibration is not authorized');
  if (source.CLAUDE_CONFIG_DIR)
    throw Error('Custom Claude credential stores need explicit calibration');
  const file = path.join(
    source.CODEX_HOME || path.join(os.homedir(), '.codex'),
    'auth.json',
  );
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw Error('Unsafe signed-in credential cache');
  const auth = accessOnly(JSON.parse(fs.readFileSync(file)));
  const result = spawnSync(
    '/usr/bin/security',
    ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
    { encoding: 'utf8', timeout: 5000 },
  );
  let oauth;
  try {
    oauth = JSON.parse(result.stdout).claudeAiOauth;
  } catch {
    throw Error('Signed-in Claude credential unavailable');
  }
  if (
    result.status !== 0 ||
    !oauth?.accessToken ||
    oauth.expiresAt < Date.now() + 1200000
  )
    throw Error('Signed-in Claude access token unavailable or expiring');
  fs.writeFileSync(
    path.join(env.CODEX_HOME, 'auth.json'),
    JSON.stringify(auth),
    { flag: 'wx', mode: 0o600 },
  );
  env.CLAUDE_CODE_OAUTH_TOKEN = oauth.accessToken;
  const fingerprint = crypto
    .createHash('sha256')
    .update(result.stdout)
    .digest('hex');
  return () => {
    const after = spawnSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', timeout: 5000 },
    );
    if (
      after.status !== 0 ||
      crypto.createHash('sha256').update(after.stdout).digest('hex') !==
        fingerprint
    )
      throw Error('GLOBAL CLAUDE AUTH CHANGED');
  };
}
module.exports = { isolatedEnvironment, accessOnly, signedInCredentials };
