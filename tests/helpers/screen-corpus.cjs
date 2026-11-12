'use strict';
// Recorded terminal frames: what a provider really drew, kept as test input so
// the screen readers are checked against real layouts, per provider release.
//
// Recording happens only inside an authorized live run (tests/live) with
// ASW_RECORD_FRAMES=1, from a provider process that run started itself.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');

const ROOT = path.join(__dirname, '../fixtures/screens');

/** Replace text with filler of the same length, so every column stays put. */
function mask(text, secret, filler = 'x') {
  if (!secret || secret.length < 3) return text;
  return text.split(secret).join(filler.repeat(secret.length));
}

/** Remove what identifies the machine or account. Lengths never change:
 * the readers depend on columns and on cursor arithmetic in the VT stream. */
function sanitize(text, extra = []) {
  let out = String(text);
  const user = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return '';
    }
  })();
  for (const secret of [os.homedir(), os.tmpdir(), os.hostname(), ...extra])
    out = mask(out, secret);
  out = mask(out, user);
  // Addresses and long opaque tokens.
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) =>
    'x'.repeat(m.length),
  );
  out = out.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => 'x'.repeat(m.length));
  return out;
}

function recorder({
  provider,
  version,
  scenario,
  root = ROOT,
  enabled = process.env.ASW_RECORD_FRAMES === '1',
  secrets = [],
}) {
  let count = 0,
    after = 'start',
    vt = '';
  const valid =
    /^[a-z][a-z-]*$/.test(provider || '') &&
    /^\d+\.\d+\.\d+$/.test(version || '') &&
    /^[a-z0-9][a-z0-9-]*$/.test(scenario || '');
  return {
    enabled: enabled && valid,
    /** Wrap the harness's Rex call to keep the raw VT reply of each read. */
    tap(run) {
      return (args) => {
        const reply = run(args);
        const keep = (value) => {
          if (
            args.includes('format') &&
            typeof value?.content === 'string' &&
            value.content
          )
            vt = value.content;
          return value;
        };
        return typeof reply?.then === 'function'
          ? reply.then(keep)
          : keep(reply);
      };
    },
    /** Name the next frame after the key or step that produced it. */
    note(step) {
      after = String(step)
        .replace(/[^a-z0-9+-]/gi, '-')
        .slice(0, 40);
    },
    save(view) {
      if (!this.enabled || typeof view?.text !== 'string') return null;
      const directory = path.join(root, provider, version);
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(
        directory,
        `${scenario}-${String(++count).padStart(2, '0')}.json`,
      );
      fs.writeFileSync(
        file,
        JSON.stringify(
          {
            provider,
            version,
            scenario,
            step: count,
            after,
            cursor: view.cursor ?? null,
            text: sanitize(view.text, secrets),
            vt: sanitize(vt, secrets),
            // Filled in by hand when the frame is reviewed; see the README.
            expect: {},
          },
          null,
          2,
        ) + '\n',
      );
      return file;
    },
  };
}

/** Every recorded frame under one provider, oldest release first. */
function frames(provider, root = ROOT) {
  const base = path.join(root, provider);
  if (!fs.existsSync(base)) return [];
  const order = (a, b) => {
    const x = a.split('.').map(Number),
      y = b.split('.').map(Number);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  return fs
    .readdirSync(base)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort(order)
    .flatMap((version) =>
      fs
        .readdirSync(path.join(base, version))
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => ({
          file: path.join(provider, version, name),
          ...JSON.parse(
            fs.readFileSync(path.join(base, version, name), 'utf8'),
          ),
        })),
    );
}

module.exports = { ROOT, mask, sanitize, recorder, frames };
