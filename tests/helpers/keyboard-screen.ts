/** Owned screen model for the browser deck and keyboard protocol tests. */
import { createHash } from 'node:crypto';
export class KeyboardScreen {
  model = 0;
  effort = 1;
  permissions = 0;
  plan = false;
  surface = 'idle';
  command = '';
  selected = 0;
  candidate = 0;
  draft = '';
  hideFooter = false;
  showShortcutRow = false;
  models = ['GPT-6-Sol', 'GPT-6-Astra'];
  levels = ['Low', 'High', 'Extra high'];
  profiles = ['Ask for approval', 'Approve for me', 'Full Access', 'Read Only'];
  trace: string[] = [];
  view() {
    const footer = this.hideFooter
      ? '? for shortcuts'
      : this.models[this.model] +
        ' ' +
        this.levels[this.effort].toLowerCase() +
        (this.plan ? '     Plan mode (⇧tab to cycle)' : '');
    const hint =
      this.command || this.draft ? '' : '← for agents · ? for shortcuts';
    let text =
      '› ' +
      (this.command || this.draft || 'Ask Codex to do anything') +
      '\n\n  ' +
      footer +
      (this.showShortcutRow && !this.hideFooter
        ? ' · fixture · Fixture chat\n  ' +
          hint +
          '             ⚠ 1 warning · f2 to view'
        : '');
    if (this.surface === 'working')
      text =
        '• Working (1m 02s • esc to interrupt)\n\n› Ask Codex to do anything\n\n  tab to queue message';
    if (this.surface === 'confirm')
      text =
        '  Enable full access?\n  › 1. Yes, continue anyway  Apply full access for this session\n    2. Cancel  Go back without enabling full access\n\n  enter select · esc back';
    if (['models', 'levels', 'profiles', 'quick'].includes(this.surface)) {
      const [title, items, current] =
        this.surface === 'models'
          ? (['Select Model and Effort', this.models, this.model] as const)
          : this.surface === 'levels'
            ? ([
                'Select Reasoning Level for ' + this.models[this.candidate],
                this.levels,
                this.candidate === this.model ? this.effort : -1,
              ] as const)
            : this.surface === 'profiles'
              ? ([
                  'Update Model Permissions',
                  this.profiles,
                  this.permissions,
                ] as const)
              : (['Select Model', ['Auto', 'All models'], 1] as const);
      text =
        '  ' +
        title +
        '\n\n' +
        items
          .map(
            (label, i) =>
              (this.selected === i ? '› ' : '  ') +
              (i + 1) +
              '. ' +
              label +
              (i === current ? ' (current)' : '') +
              '  Native description',
          )
          .join('\n') +
        '\n\n  ' +
        (this.surface === 'levels'
          ? 'enter default · s session · esc back'
          : 'enter select · esc back');
    }
    return {
      text,
      cursor:
        this.surface === 'working'
          ? { row: 3, column: 3 }
          : this.surface === 'idle'
            ? { row: 1, column: 3 + this.command.length }
            : null,
      hash: createHash('sha256').update(text).digest('hex'),
    };
  }
  send(key: string) {
    this.trace.push(key);
    if (this.surface === 'working' && key === 'escape') {
      this.surface = 'idle';
      return;
    }
    if (this.surface === 'confirm' && key === 'escape') {
      this.surface = 'profiles';
      this.selected = 2;
      return;
    }
    if (this.surface === 'idle') {
      if (['/model', '/permissions', '/plan'].includes(key)) {
        this.command = key;
        return;
      }
      if (key === 'shift+tab') {
        this.plan = !this.plan;
        return;
      }
      if (key === 'enter' && this.command) {
        if (this.command === '/plan') this.plan = true;
        if (this.command === '/permissions') {
          this.surface = 'profiles';
          this.selected = this.permissions;
        }
        if (this.command === '/model') {
          this.surface = 'quick';
          this.selected = 1;
        }
        this.command = '';
        return;
      }
    }
    if (key === 'down' || key === 'up') {
      const size =
        this.surface === 'levels'
          ? this.levels.length
          : this.surface === 'profiles'
            ? this.profiles.length
            : this.models.length;
      this.selected = (size + this.selected + (key === 'down' ? 1 : -1)) % size;
      return;
    }
    if (this.surface === 'quick' && this.selected === 1 && key === 'enter') {
      this.surface = 'models';
      this.selected = this.model;
      return;
    }
    if (this.surface === 'models' && key === 'enter') {
      this.surface = 'levels';
      this.candidate = this.selected;
      this.selected = this.effort;
      return;
    }
    if (this.surface === 'levels' && key === 'escape') {
      this.surface = 'models';
      this.selected = this.model;
      return;
    }
    if (this.surface === 'levels' && key === 's') {
      this.model = this.candidate;
      this.effort = this.selected;
      this.surface = 'idle';
      return;
    }
    if (this.surface === 'profiles' && key === 'enter') {
      this.surface = this.selected === 2 ? 'confirm' : 'idle';
      if (this.surface === 'idle') this.permissions = this.selected;
      return;
    }
    throw Error('Unexpected fixture key');
  }
}
