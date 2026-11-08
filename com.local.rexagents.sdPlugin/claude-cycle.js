// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
const crypto = require('node:crypto');
const digest =
  /** @param {any} value */
  (value) =>
    crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
const modelName =
  /** @param {string} text */
  (text) =>
    /\b(Opus|Sonnet|Fable|Haiku)\s+(\d+\.\d+(?:\.\d+)?)(?=\s|$)/.exec(text);
/** @param {{text: string, hash: string, cursor?: {row: number, column: number}|null}} view */
function picker(view) {
  const lines = view.text.split('\n'),
    start = lines.findLastIndex(
      /** @param {any} line */ (line) =>
        /^\s*(Select|Choose) model\s*$/.test(line),
    ),
    end = lines.findLastIndex(
      /** @param {any} line */ (line) =>
        /Enter to set as default.*\bs to use this session only\b.*\bEsc to (cancel|exit)\b/.test(
          line,
        ),
    );
  if (
    start < 0 ||
    end <= start ||
    lines
      .slice(end + 1)
      .some(
        /** @param {any} line */ (line) =>
          line.trim() && !/^[─━\s]+$/.test(line),
      )
  )
    throw Error('Claude model picker changed');
  const rows = [];
  for (const line of lines.slice(start + 1, end)) {
    if (/\beffort\b.*←\s*\/\s*→/.test(line)) break;
    const m = /^\s*([❯›>])?\s*(\d+)[.)]\s+(.+?)\s*$/.exec(line);
    if (m) {
      const name = modelName(m[3]),
        isDefault = /^Default\b/.test(m[3]),
        more = /^More models\b/.test(m[3]);
      if (!name && !isDefault && !more)
        throw Error('Unrecognized Claude model row');
      rows.push({
        number: Number(m[2]),
        selected: !!m[1],
        label: m[3],
        name: name ? name[1] + ' ' + name[2] : null,
        model: name
          ? 'claude-' +
            name[1].toLowerCase() +
            '-' +
            name[2].replace(/\./g, '-')
          : null,
        isDefault,
        more,
      });
    } else if (rows.length && line.trim() && !/\beffort\b/i.test(line))
      /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
        rows.at(-1)
      ).label += ' ' + line.trim();
  }
  if (
    rows.length < 2 ||
    rows.length > 20 ||
    rows.some((row, i) => row.number !== i + 1) ||
    rows.filter((row) => row.selected).length !== 1
  )
    throw Error('Incomplete Claude model list');
  const effortLines = lines
    .slice(start + 1, end)
    .filter(
      /** @param {any} line */ (line) => /\beffort\b.*←\s*\/\s*→/.test(line),
    );
  if (effortLines.length > 1) throw Error('Ambiguous Claude effort control');
  const effort = effortLines.length
    ? /\b(extra high|xhigh|low|medium|high|max)\s+effort\b/i
        .exec(effortLines[0])?.[1]
        ?.toLowerCase()
        .replace('extra high', 'xhigh')
    : null;
  if (effortLines.length && !effort)
    throw Error('Unrecognized Claude effort level');
  const available = rows.filter(
    (row) =>
      row.model &&
      !row.isDefault &&
      !row.more &&
      !/unavailable|not available|requires? (?:usage |additional )?credits|not supported|disabled|not included/i.test(
        row.label,
      ),
  );
  return {
    rows,
    available,
    selected: rows.find((row) => row.selected),
    effort,
    hash: view.hash,
    catalog: digest(
      rows.map((row) => [
        row.number,
        row.label.replace(/[✔✓]/g, '').trim(),
        row.model,
        row.isDefault,
        row.more,
      ]),
    ),
  };
}
/** @param {any} p
 * @param {any} current */
function nextModel(p, current) {
  if (p.available.length < 2) throw Error('Only one Claude model is available');
  const index = p.available.findIndex(
    /** @param {any} row */ (row) => row.model === current,
  );
  if (index < 0)
    throw Error('Current Claude model is outside the visible cycle');
  return p.available[(index + 1) % p.available.length];
}
/** @param {{text: string, hash: string, cursor?: {row: number, column: number}|null}} view
 * @param {Record<string, any>} [options] */
function configurationView(view, { requireEmpty = false } = {}) {
  const lines = view.text.split('\n'),
    border = /^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/;
  const borders = lines
      .map(
        /** @param {any} line
         * @param {any} i */ (line, i) => (border.test(line.trim()) ? i : -1),
      )
      .filter(/** @param {any} i */ (i) => i >= 0),
    lower = borders.at(-1),
    upper = borders.at(-2);
  if (
    upper === undefined ||
    lower - upper > 18 ||
    !/^\s*❯(?:[ \u00a0]|$)/.test(lines[upper + 1] || '') ||
    lines
      .slice(upper + 2, lower)
      .some(/** @param {any} line */ (line) => /^\s*❯/.test(line)) ||
    lines
      .slice(lower + 1)
      .some(
        /** @param {any} line */ (line) =>
          line.trim() &&
          !/^\s*(?:\?|!|⏵|⏸|◯|○|●|✳|✻|Claude|Opus|Sonnet|Haiku|Fable|Model|Effort|--\s*INSERT)/.test(
            line,
          ),
      )
  )
    throw Error('Claude idle configuration view unavailable');
  if (
    requireEmpty &&
    lines
      .slice(upper + 1, lower)
      .join('\n')
      .replace(/^\s*❯[ \u00a0]?/, '')
      .trim()
  )
    throw Error('Claude empty composer unavailable');
  // Text-only evidence is used for a non-submitting shortcut, never for Send.
  return digest(lines.slice(upper + 1, lower));
}
module.exports = { levels, picker, nextModel, configurationView };

/** @param {any} c
 * @param {string} kind
 * @param {any} initial */
async function cycle(c, kind, initial) {
  if (!['model', 'effort'].includes(kind))
    throw Error('Unsupported Claude setting');
  const b = c.b,
    a = await c.selected(true, initial),
    key = actorKey(a),
    binding = c.bindings.get(key);
  if (c.picker || b.picker) throw Error('Close the Claude picker first');
  if (!binding?.confirmed || !a.model)
    throw Error('Wait for verified Claude settings');
  if (a.vimMode && a.vimMode !== 'INSERT')
    throw Error('Claude vim composer must be INSERT');
  const before =
    a.backend === 'herdr'
      ? configurationView(await c.view(a))
      : await c.readComposer(a, { allowEmpty: true });
  const fresh = await b.checked(a, true);
  c.assert(a, fresh);
  const operation = {
    actor: key,
    identity: a.nativeIdentity,
    id: crypto.randomUUID(),
    openedAt: c.now(),
    pending: true,
    automatic: true,
    composerHash: a.backend === 'herdr' ? before : null,
  };
  c.picker = operation;
  b.draft = null;
  const wait =
    /** @param {number} ms */
    (ms) =>
      c.cycleWait
        ? c.cycleWait(ms)
        : new Promise((resolve) => setTimeout(resolve, ms));
  const read = async () => {
    let error;
    for (let attempt = 0; attempt < 10; attempt++) {
      let view;
      try {
        view = await c.view(a);
      } catch (e) {
        if (
          /** @type {Error & {code?: string}} */ (e).message !==
          'Claude view changed'
        )
          throw e;
        await wait(60);
        continue;
      }
      try {
        return picker(view);
      } catch (e) {
        error = e;
        if (!/^\s*(Select|Choose) model\s*$/m.test(view.text))
          configurationView(view);
      }
      await wait(60);
    }
    throw error;
  };
  const guard =
    /** @param {any} p */
    async (p) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (c.picker !== operation) throw Error('Claude configuration changed');
        const current = await b.checked(a);
        c.assert(a, current);
        if (current.claudeUiPending) {
          await wait(60);
          continue;
        }
        if (!current.claudePickerVisible || current.claudeViewHash !== p.hash)
          throw Error('Claude picker changed; use its keyboard');
        return current;
      }
      throw Error('Claude view still updating');
    };
  const keys =
    /** @param {any} p
     * @param {any} list
     * @param {any} [goalEffort] */
    async (p, list, goalEffort = null) => {
      for (const batch of a.backend === 'herdr'
        ? Array.from({ length: Math.ceil(list.length / 4) }, (_, i) =>
            list.slice(i * 4, i * 4 + 4),
          )
        : [list]) {
        const current = await guard(p);
        /** @type {any} */ (operation).expectedViewHash = p.hash;
        await b.run([
          'send-key',
          '-s',
          current.session,
          '-b',
          current.block,
          ...batch,
        ]);
        const direction = batch[0],
          selected =
            p.selected.number +
            (direction === 'down'
              ? batch.length
              : direction === 'up'
                ? -batch.length
                : 0);
        let next;
        // API acknowledgement precedes terminal repaint. Wait for the intended
        // selection or effort update; never replay the key to make it appear.
        for (let attempt = 0; attempt < 10; attempt++) {
          next = await read();
          if (next.catalog !== p.catalog)
            throw Error('Claude model list changed');
          if (['up', 'down'].includes(direction)) {
            if (
              /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
                next.selected
              ).number === selected
            )
              break;
            if (
              /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
                next.selected
              ).number < Math.min(p.selected.number, selected) ||
              /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
                next.selected
              ).number > Math.max(p.selected.number, selected)
            )
              throw Error('Claude selected another model');
          } else if (
            goalEffort ? next.effort === goalEffort : next.effort !== p.effort
          )
            break;
          if (attempt === 9) break;
          await wait(50);
        }
        if (
          ['up', 'down'].includes(direction) &&
          /** @type {any} */ (next).selected.number !== selected
        )
          throw Error('Claude navigation not verified');
        if (goalEffort && /** @type {any} */ (next).effort !== goalEffort)
          throw Error('Claude effort wrap not verified');
        p = next;
        if (list.length > 1 && direction === 'left' && p.effort === 'low')
          break;
      }
      return p;
    };
  try {
    await b.run(['send-key', '-s', a.session, '-b', a.block, 'alt+p']);
    let p = await read();
    operation.pending = false;
    if (
      /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
        p.selected
      ).model !== a.model
    )
      throw Error('Claude current model differs from picker');
    let expectedModel = a.model,
      expectedEffort = p.effort;
    if (kind === 'model') {
      const next = nextModel(p, a.model);
      expectedModel = next.model;
      const distance =
        next.number -
        /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
          p.selected
        ).number;
      if (distance)
        p = await keys(
          p,
          Array.from({ length: Math.abs(distance) }, () =>
            distance > 0 ? 'down' : 'up',
          ),
        );
      if (
        /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
          p.selected
        ).number !== next.number ||
        /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
          p.selected
        ).model !== next.model
      )
        throw Error('Claude selected another model');
      // Keep the current effort when the next model offers it; native caps win.
      if (a.effort && p.effort && levels.includes(a.effort))
        for (let step = 0; step < 5 && p.effort !== a.effort; step++) {
          const /** @type {any} */ previous = p.effort,
            direction =
              levels.indexOf(/** @type {string} */ (p.effort)) <
              levels.indexOf(a.effort)
                ? 'right'
                : 'left';
          p = await keys(p, [direction]);
          if (p.effort === previous) break;
        }
      expectedEffort = p.effort;
    } else {
      if (!p.effort) throw Error('Claude model has no effort control');
      const previous = p.effort;
      if (previous !== 'max') p = await keys(p, ['right']);
      if (previous === 'max' || p.effort === previous) {
        p = await keys(
          p,
          Array.from({ length: 4 }, () => 'left'),
          'low',
        );
        if (p.effort !== 'low') throw Error('Claude effort wrap not verified');
      }
      if (
        /** @type {{ number: number; selected: boolean; label: string; name: string | null; model: string | null; isDefault: boolean; more: boolean; }} */ (
          p.selected
        ).model !== expectedModel ||
        !levels.includes(/** @type {string} */ (p.effort))
      )
        throw Error('Claude effort control changed');
      expectedEffort = p.effort;
    }
    const current = await guard(p);
    /** @type {any} */ (operation).expectedViewHash = p.hash;
    /** @type {any} */ (operation).applying = true;
    const appliedAt = c.now();
    // Only the visible session-only action is ever used; Enter saves defaults.
    await b.run(['send-key', '-s', current.session, '-b', current.block, 's']);
    let result;
    for (let attempt = 0; attempt < 20; attempt++) {
      const process = await c.inspect(a.pid),
        record = S.validate(await c.read(a.pid), a, process, c.now());
      const root = [
        process.startedAt,
        record.sessionId,
        record.generation,
        await c.bindingsDefault(record.configDirectory),
      ].join('|');
      if (root !== binding.root || record.turnId !== a.claudeTurnId)
        throw Error('Claude session changed during configuration');
      if (
        record.metadataAt >= appliedAt &&
        record.model === expectedModel &&
        (!expectedEffort || record.effort === expectedEffort)
      ) {
        result = record;
        break;
      }
      await wait(100);
    }
    if (!result) throw Error('Check Claude; setting change not verified');
    let after;
    for (let attempt = 0; attempt < 10; attempt++)
      try {
        after =
          a.backend === 'herdr'
            ? configurationView(await c.view(a))
            : await c.readComposer(a, { allowEmpty: true });
        break;
      } catch (error) {
        if (
          ![
            'Claude view changed',
            'Claude composer is not visible',
            'Claude composer is ambiguous',
            'Claude idle configuration view unavailable',
          ].includes(/** @type {Error & {code?: string}} */ (error).message)
        )
          throw error;
        await wait(60);
      }
    if (after === undefined) throw Error('Claude view still updating');
    if (a.backend === 'herdr') {
      if (after !== before)
        throw Error('Claude input changed; review its draft');
    } else if (
      (!before.empty || !after.empty) &&
      (before.hash !== after.hash ||
        before.cursor.row !== after.cursor.row ||
        before.cursor.column !== after.cursor.column)
    )
      throw Error('Claude draft changed; review it');
    c.picker = null;
    b.lastModel = {
      ...a,
      model: result.model,
      modelName: result.modelName,
      at: c.now(),
    };
    for (const live of b.agents || [])
      if (actorKey(live) === key && live.nativeIdentity === a.nativeIdentity)
        Object.assign(live, {
          model: result.model,
          modelName: result.modelName,
          effort: result.effort,
          metadataAt: result.metadataAt,
        });
    b.lastEffort = { ...a, effort: result.effort, at: c.now() };
  } catch (error) {
    if (c.picker === operation) {
      if (/** @type {any} */ (operation).applying || operation.pending)
        c.picker = null;
      else operation.automatic = false;
    }
    throw error;
  }
}
const S = require('./claude-state');
const actorKey =
  /** @param {any} a */
  (a) =>
    [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
module.exports.cycle = cycle;
