import { sameNavigationTarget } from '../domain/navigation';
import type { AgentSnapshot } from '../domain/types';
import { rexSettingsAction } from './rex-keyboard-settings';

type Settings = NonNullable<AgentSnapshot['rexSettings']>;
interface Focus {
  source: object;
  visibility: number;
  agent: AgentSnapshot;
}
interface Options {
  currentFocus(): Focus | undefined;
  read(source: object, agent: AgentSnapshot): Promise<Settings>;
  published(agent: AgentSnapshot, values: Settings): void;
  clock(): number;
}
interface Hint {
  process: string;
  label: string;
}
interface Observation extends Focus {
  entry: AgentSnapshot;
  values: Settings;
  readAt: number;
  lastPermissions?: Hint;
  lastEffort?: Hint;
  pending?: { promise: Promise<void>; retire(): void };
}

function eligible(agent: AgentSnapshot) {
  if (!agent.rexSettings || !['codex', 'claude-code'].includes(agent.app))
    return false;
  return (
    ['idle', 'done', 'error', 'working'].includes(agent.state) ||
    (agent.app === 'claude-code' && agent.state === 'unknown' && !agent.chatId)
  );
}

function matches(record: Observation, focus: Focus) {
  const start = record.agent,
    live = focus.agent;
  return (
    record.source === focus.source &&
    record.visibility === focus.visibility &&
    sameNavigationTarget(start, live) &&
    start.cwd === live.cwd &&
    start.state === live.state &&
    (start.app !== 'codex' ||
      (start.chatId === live.chatId &&
        (start.state !== 'working' || start.statusAt === live.statusAt)))
  );
}

function retainCaptions(record: Observation, values: Settings, now: number) {
  const { process } = values;
  if (record.lastPermissions?.process !== process)
    record.lastPermissions = undefined;
  if (record.lastEffort?.process !== process) record.lastEffort = undefined;
  if (values.viewHash && process && record.agent.app === 'codex') {
    if (values.permissions)
      record.lastPermissions = { process, label: values.permissions };
    else if (record.lastPermissions)
      values.permissions = record.lastPermissions.label + '?';
  }
  // Only captions survive a torn read of the same process. A press requires
  // its own fresh view evidence (ADR 0002).
  if (values.viewHash) record.readAt = now;
  else if (
    process &&
    process === record.values.process &&
    now - record.readAt < 4500
  ) {
    values.model = record.values.model;
    values.effort = record.values.effort;
    values.permissions = record.values.permissions;
    values.plan = record.values.plan;
    values.permissionsHidden = record.values.permissionsHidden;
  }
  if (record.agent.app === 'claude-code' && process) {
    if (values.viewHash && values.effort && values.effortHidden === false)
      record.lastEffort = { process, label: values.effort };
    if (values.effortHidden && record.lastEffort)
      values.effort = record.lastEffort.label + '?';
  }
}

export class RexSettingsObservations {
  #record?: Observation;

  constructor(private readonly options: Options) {}

  clear() {
    const record = this.#record;
    if (!record) return;
    this.#record = undefined;
    if (record.entry.rexSettings === record.values)
      record.entry.rexSettings = {};
    record.pending?.retire();
  }

  observe(focus: Focus | undefined): Promise<void> {
    if (!focus || !eligible(focus.agent)) {
      this.clear();
      return Promise.resolve();
    }
    if (!this.#record || !matches(this.#record, focus)) {
      this.clear();
      // Roster entries can change in place while a native read is pending.
      this.#record = {
        ...focus,
        agent: { ...focus.agent },
        entry: focus.agent,
        values: {},
        readAt: 0,
      };
    }
    const record = this.#record;
    record.entry = focus.agent;
    focus.agent.rexSettings = record.values;
    if (record.pending) return record.pending.promise;

    let retire!: () => void;
    const retired = new Promise<void>((resolve) => {
      retire = resolve;
    });
    const promise = Promise.race([
      retired,
      this.#read(record, { ...focus.agent }),
    ]);
    record.pending = { promise, retire };
    return promise;
  }

  async #read(record: Observation, agent: AgentSnapshot) {
    try {
      const values = await this.options.read(record.source, agent);
      if (this.#record !== record) return;
      const focus = this.options.currentFocus();
      if (!focus || !eligible(focus.agent) || !matches(record, focus)) {
        this.clear();
        return;
      }
      retainCaptions(record, values, this.options.clock());
      record.values = values;
      record.entry = focus.agent;
      this.options.published(focus.agent, values);
    } finally {
      record.pending = undefined;
    }
  }

  pickerConfirmed(
    target: AgentSnapshot | undefined,
    action: string,
    result?: { label?: string; appliedEffort?: string },
  ): boolean {
    const record = this.#record;
    if (
      !record ||
      !target ||
      !rexSettingsAction(action) ||
      !sameNavigationTarget(record.agent, target) ||
      (target.app === 'codex' && record.agent.chatId !== target.chatId)
    )
      return false;

    const process = record.values.process;
    if (process && process === target.rexSettings?.process) {
      if (target.app === 'codex' && action === 'permissions' && result?.label)
        record.lastPermissions = { process, label: result.label };
      if (target.app === 'claude-code') {
        if (action === 'effort' && result?.label)
          record.lastEffort = { process, label: result.label };
        if (action === 'model')
          record.lastEffort = result?.appliedEffort
            ? { process, label: result.appliedEffort }
            : undefined;
      }
    }
    this.clear();
    this.#record = { ...record, pending: undefined, values: {}, readAt: 0 };
    // Stop exposing the pre-picker digest before rediscovery can repaint.
    const focus = this.options.currentFocus();
    if (focus && matches(record, focus)) {
      this.#record.entry = focus.agent;
      focus.agent.rexSettings = this.#record.values;
    }
    return true;
  }
}
