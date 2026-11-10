type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const crypto = require('node:crypto');
const digest: (value: any) => string = (value: any) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const levels: string[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const modelName: (text: string) => RegExpExecArray | null = (text: string) =>
  /\b(Opus|Sonnet|Fable|Haiku)\s+(\d+\.\d+(?:\.\d+)?)(?=\s|$)/.exec(text);
function picker(view: {
  text: string;
  hash: string;
  cursor?: {
    row: number;
    column: number;
  } | null;
}) {
  const lines: string[] = view.text.split('\n'),
    start: number = lines.findLastIndex((line: any) =>
      /^\s*(Select|Choose) model\s*$/.test(line),
    ),
    end: number = lines.findLastIndex((line: any) =>
      /Enter to set as default.*\bs to use this session only\b.*\bEsc to (cancel|exit)\b/.test(
        line,
      ),
    );
  if (
    start < 0 ||
    end <= start ||
    lines
      .slice(end + 1)
      .some((line: any) => line.trim() && !/^[─━\s]+$/.test(line))
  )
    throw Error('Claude model picker changed');
  const rows: any[] = [];
  for (const line of lines.slice(start + 1, end)) {
    if (/\beffort\b.*←\s*\/\s*→/.test(line)) break;
    const m: RegExpExecArray | null =
      /^\s*([❯›>])?\s*(\d+)[.)]\s+(.+?)\s*$/.exec(line);
    if (m) {
      const name: RegExpExecArray | null = modelName(m[3]),
        isDefault: boolean = /^Default\b/.test(m[3]),
        more: boolean = /^More models\b/.test(m[3]);
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
      (
        rows.at(-1) as {
          number: number;
          selected: boolean;
          label: string;
          name: string | null;
          model: string | null;
          isDefault: boolean;
          more: boolean;
        }
      ).label += ' ' + line.trim();
  }
  if (
    rows.length < 2 ||
    rows.length > 20 ||
    rows.some(
      (
        row: {
          number: number;
          selected: boolean;
          label: string;
          name: string | null;
          model: string | null;
          isDefault: boolean;
          more: boolean;
        },
        i: number,
      ) => row.number !== i + 1,
    ) ||
    rows.filter(
      (row: {
        number: number;
        selected: boolean;
        label: string;
        name: string | null;
        model: string | null;
        isDefault: boolean;
        more: boolean;
      }) => row.selected,
    ).length !== 1
  )
    throw Error('Incomplete Claude model list');
  const effortLines: string[] = lines
    .slice(start + 1, end)
    .filter((line: any) => /\beffort\b.*←\s*\/\s*→/.test(line));
  if (effortLines.length > 1) throw Error('Ambiguous Claude effort control');
  const effort: string | null | undefined = effortLines.length
    ? /\b(extra high|xhigh|low|medium|high|max)\s+effort\b/i
        .exec(effortLines[0])?.[1]
        ?.toLowerCase()
        .replace('extra high', 'xhigh')
    : null;
  if (effortLines.length && !effort)
    throw Error('Unrecognized Claude effort level');
  const available: {
    number: number;
    selected: boolean;
    label: string;
    name: string | null;
    model: string | null;
    isDefault: boolean;
    more: boolean;
  }[] = rows.filter(
    (row: {
      number: number;
      selected: boolean;
      label: string;
      name: string | null;
      model: string | null;
      isDefault: boolean;
      more: boolean;
    }) =>
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
    selected: rows.find(
      (row: {
        number: number;
        selected: boolean;
        label: string;
        name: string | null;
        model: string | null;
        isDefault: boolean;
        more: boolean;
      }) => row.selected,
    ),
    effort,
    hash: view.hash,
    catalog: digest(
      rows.map(
        (row: {
          number: number;
          selected: boolean;
          label: string;
          name: string | null;
          model: string | null;
          isDefault: boolean;
          more: boolean;
        }) => [
          row.number,
          row.label.replace(/[✔✓]/g, '').trim(),
          row.model,
          row.isDefault,
          row.more,
        ],
      ),
    ),
  };
}
function nextModel(p: any, current: any) {
  if (p.available.length < 2) throw Error('Only one Claude model is available');
  const index: any = p.available.findIndex((row: any) => row.model === current);
  if (index < 0)
    throw Error('Current Claude model is outside the visible cycle');
  return p.available[(index + 1) % p.available.length];
}
function configurationView(
  view: {
    text: string;
    hash: string;
    cursor?: {
      row: number;
      column: number;
    } | null;
  },
  { requireEmpty = false }: Record<string, any> | undefined = {},
) {
  const lines: string[] = view.text.split('\n'),
    border: RegExp = /^[─━]{12,}(?:[ \u00a0]+[^\r\n]*[ \u00a0]+[─━]+)?\s*$/;
  const borders: any[] = lines
      .map((line: any, i: any) => (border.test(line.trim()) ? i : -1))
      .filter((i: any) => i >= 0),
    lower: any = borders.at(-1),
    upper: any = borders.at(-2);
  if (
    upper === undefined ||
    lower - upper > 18 ||
    !/^\s*❯(?:[ \u00a0]|$)/.test(lines[upper + 1] || '') ||
    lines.slice(upper + 2, lower).some((line: any) => /^\s*❯/.test(line)) ||
    lines
      .slice(lower + 1)
      .some(
        (line: any) =>
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
  return digest(lines.slice(upper + 1, lower));
}
module.exports = { levels, picker, nextModel, configurationView };
async function cycle(c: any, kind: string, initial: any) {
  if (!['model', 'effort'].includes(kind))
    throw Error('Unsupported Claude setting');
  const b: any = c.b,
    a: any = await c.selected(true, initial),
    key: string = actorKey(a),
    binding: any = c.bindings.get(key);
  if (c.picker || b.picker) throw Error('Close the Claude picker first');
  // Hooks-only installs have no status-line model; the native picker read
  // below is the current setting. Legacy installs still cross-check both.
  const hooksOnly: boolean = a.claudeHooksOnly === true;
  if (!binding?.confirmed || (!a.model && !hooksOnly))
    throw Error('Wait for verified Claude settings');
  if (a.vimMode && a.vimMode !== 'INSERT')
    throw Error('Claude vim composer must be INSERT');
  const before: any =
    a.backend === 'herdr'
      ? configurationView(await c.view(a))
      : await c.readComposer(a, { allowEmpty: true });
  const fresh: any = await b.checked(a, true);
  c.assert(a, fresh);
  const operation: {
    actor: string;
    identity: any;
    id: string;
    openedAt: any;
    pending: boolean;
    automatic: boolean;
    composerHash: any;
  } = {
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
  const wait: (ms: number) => any = (ms: number) =>
    c.cycleWait
      ? c.cycleWait(ms)
      : new Promise((resolve: (value: any) => void) => setTimeout(resolve, ms));
  const read: () => Promise<{
    rows: {
      number: number;
      selected: boolean;
      label: string;
      name: string | null;
      model: string | null;
      isDefault: boolean;
      more: boolean;
    }[];
    available: {
      number: number;
      selected: boolean;
      label: string;
      name: string | null;
      model: string | null;
      isDefault: boolean;
      more: boolean;
    }[];
    selected:
      | {
          number: number;
          selected: boolean;
          label: string;
          name: string | null;
          model: string | null;
          isDefault: boolean;
          more: boolean;
        }
      | undefined;
    effort: string | null | undefined;
    hash: string;
    catalog: string;
  }> = async () => {
    let error: any;
    for (let attempt: number = 0; attempt < 10; attempt++) {
      let view: any;
      try {
        view = await c.view(a);
      } catch (e: unknown) {
        if (
          (
            e as Error & {
              code?: string;
            }
          ).message !== 'Claude view changed'
        )
          throw e;
        await wait(60);
        continue;
      }
      try {
        return picker(view);
      } catch (e: unknown) {
        error = e;
        if (!/^\s*(Select|Choose) model\s*$/m.test(view.text))
          configurationView(view);
      }
      await wait(60);
    }
    throw error;
  };
  const guard: (p: any) => Promise<any> = async (p: any) => {
    for (let attempt: number = 0; attempt < 5; attempt++) {
      if (c.picker !== operation) throw Error('Claude configuration changed');
      const current: any = await b.checked(a);
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
  const keys: (p: any, list: any, goalEffort?: any) => Promise<any> = async (
    p: any,
    list: any,
    goalEffort: any = null,
  ) => {
    for (const batch of a.backend === 'herdr'
      ? Array.from(
          { length: Math.ceil(list.length / 4) },
          (_: any, i: number) => list.slice(i * 4, i * 4 + 4),
        )
      : [list]) {
      const current: any = await guard(p);
      (operation as any).expectedViewHash = p.hash;
      await b.run([
        'send-key',
        '-s',
        current.session,
        '-b',
        current.block,
        ...batch,
      ]);
      const direction: any = batch[0],
        selected: any =
          p.selected.number +
          (direction === 'down'
            ? batch.length
            : direction === 'up'
              ? -batch.length
              : 0);
      let next: any;
      for (let attempt: number = 0; attempt < 10; attempt++) {
        next = await read();
        if (next.catalog !== p.catalog)
          throw Error('Claude model list changed');
        if (['up', 'down'].includes(direction)) {
          if (
            (
              next.selected as {
                number: number;
                selected: boolean;
                label: string;
                name: string | null;
                model: string | null;
                isDefault: boolean;
                more: boolean;
              }
            ).number === selected
          )
            break;
          if (
            (
              next.selected as {
                number: number;
                selected: boolean;
                label: string;
                name: string | null;
                model: string | null;
                isDefault: boolean;
                more: boolean;
              }
            ).number < Math.min(p.selected.number, selected) ||
            (
              next.selected as {
                number: number;
                selected: boolean;
                label: string;
                name: string | null;
                model: string | null;
                isDefault: boolean;
                more: boolean;
              }
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
        (next as any).selected.number !== selected
      )
        throw Error('Claude navigation not verified');
      if (goalEffort && (next as any).effort !== goalEffort)
        throw Error('Claude effort wrap not verified');
      p = next;
      if (list.length > 1 && direction === 'left' && p.effort === 'low') break;
    }
    return p;
  };
  try {
    await b.run(['send-key', '-s', a.session, '-b', a.block, 'alt+p']);
    let p: {
      rows: {
        number: number;
        selected: boolean;
        label: string;
        name: string | null;
        model: string | null;
        isDefault: boolean;
        more: boolean;
      }[];
      available: {
        number: number;
        selected: boolean;
        label: string;
        name: string | null;
        model: string | null;
        isDefault: boolean;
        more: boolean;
      }[];
      selected:
        | {
            number: number;
            selected: boolean;
            label: string;
            name: string | null;
            model: string | null;
            isDefault: boolean;
            more: boolean;
          }
        | undefined;
      effort: string | null | undefined;
      hash: string;
      catalog: string;
    } = await read();
    operation.pending = false;
    if (
      (
        p.selected as {
          number: number;
          selected: boolean;
          label: string;
          name: string | null;
          model: string | null;
          isDefault: boolean;
          more: boolean;
        }
      ).model !== a.model &&
      !hooksOnly
    )
      throw Error('Claude current model differs from picker');
    const currentModel: any = hooksOnly ? (p.selected as any).model : a.model,
      currentEffort: any = hooksOnly ? p.effort : a.effort;
    if (!currentModel) throw Error('Wait for verified Claude settings');
    let expectedModel: any = currentModel,
      expectedEffort: string | null | undefined = p.effort;
    if (kind === 'model') {
      const next: any = nextModel(p, currentModel);
      expectedModel = next.model;
      const distance: number =
        next.number -
        (
          p.selected as {
            number: number;
            selected: boolean;
            label: string;
            name: string | null;
            model: string | null;
            isDefault: boolean;
            more: boolean;
          }
        ).number;
      if (distance)
        p = await keys(
          p,
          Array.from({ length: Math.abs(distance) }, () =>
            distance > 0 ? 'down' : 'up',
          ),
        );
      if (
        (
          p.selected as {
            number: number;
            selected: boolean;
            label: string;
            name: string | null;
            model: string | null;
            isDefault: boolean;
            more: boolean;
          }
        ).number !== next.number ||
        (
          p.selected as {
            number: number;
            selected: boolean;
            label: string;
            name: string | null;
            model: string | null;
            isDefault: boolean;
            more: boolean;
          }
        ).model !== next.model
      )
        throw Error('Claude selected another model');
      if (currentEffort && p.effort && levels.includes(currentEffort))
        for (
          let step: number = 0;
          step < 5 && p.effort !== currentEffort;
          step++
        ) {
          const previous: any = p.effort,
            direction: 'right' | 'left' =
              levels.indexOf(p.effort as string) < levels.indexOf(currentEffort)
                ? 'right'
                : 'left';
          p = await keys(p, [direction]);
          if (p.effort === previous) break;
        }
      expectedEffort = p.effort;
    } else {
      if (!p.effort) throw Error('Claude model has no effort control');
      const previous: string = p.effort;
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
        (
          p.selected as {
            number: number;
            selected: boolean;
            label: string;
            name: string | null;
            model: string | null;
            isDefault: boolean;
            more: boolean;
          }
        ).model !== expectedModel ||
        !levels.includes(p.effort as string)
      )
        throw Error('Claude effort control changed');
      expectedEffort = p.effort;
    }
    const current: any = await guard(p);
    (operation as any).expectedViewHash = p.hash;
    (operation as any).applying = true;
    const appliedAt: any = c.now();
    await b.run(['send-key', '-s', current.session, '-b', current.block, 's']);
    let result: any;
    if (hooksOnly) {
      // No status line confirms the apply. Require the same root session and
      // turn, then the closed picker and unchanged draft checked below. The
      // caption comes from the picker state verified before pressing s.
      const process: any = await c.inspect(a.pid),
        record: any = S.validate(await c.read(a.pid), a, process, c.now());
      const root: string = [
        process.startedAt,
        record.sessionId,
        record.generation,
        await c.bindingsDefault(record.configDirectory),
      ].join('|');
      if (root !== binding.root || record.turnId !== a.claudeTurnId)
        throw Error('Claude session changed during configuration');
      result = {
        model: expectedModel,
        modelName: (p.selected as any).name,
        effort: expectedEffort,
        metadataAt: appliedAt,
      };
    }
    for (let attempt: number = 0; !result && attempt < 20; attempt++) {
      const process: any = await c.inspect(a.pid),
        record: any = S.validate(await c.read(a.pid), a, process, c.now());
      const root: string = [
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
    let after: any;
    for (let attempt: number = 0; attempt < 10; attempt++)
      try {
        after =
          a.backend === 'herdr'
            ? configurationView(await c.view(a))
            : await c.readComposer(a, { allowEmpty: true });
        break;
      } catch (error: unknown) {
        if (
          ![
            'Claude view changed',
            'Claude composer is not visible',
            'Claude composer is ambiguous',
            'Claude idle configuration view unavailable',
          ].includes(
            (
              error as Error & {
                code?: string;
              }
            ).message,
          )
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
  } catch (error: unknown) {
    if (c.picker === operation) {
      if ((operation as any).applying || operation.pending) c.picker = null;
      else operation.automatic = false;
    }
    throw error;
  }
}
const S = require('./state');
const actorKey: (a: any) => string = (a: any) =>
  [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
module.exports.cycle = cycle;

export {};
