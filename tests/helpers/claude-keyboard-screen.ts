import { createHash } from 'node:crypto';
export class ClaudeKeyboardScreen {
  models = ['Prairie 3', 'Summit 8'];
  levels = ['low', 'medium', 'high'];
  model = 0;
  selected = 0;
  effort = 1;
  open = false;
  nativeEffort = false;
  hideBadge = false;
  command = false;
  slider = false;
  working = false;
  plan = false;
  send(key: string) {
    if (this.nativeEffort && key === '/effort') this.command = true;
    else if (this.command && key === 'enter') {
      this.command = false;
      this.slider = true;
    } else if (this.slider && key === 's') {
      this.slider = false;
      this.hideBadge = true;
    } else if (this.slider && key === 'right') this.effort++;
    else if (this.slider && key === 'left') this.effort--;
    else if (this.working && key === 'escape') this.working = false;
    else if (!this.open && key === 'alt+p') {
      this.open = true;
      this.selected = this.model;
    } else if (!this.open && key === 'shift+tab') this.plan = !this.plan;
    else if (this.open && key === 'right')
      this.effort = Math.min(this.levels.length - 1, this.effort + 1);
    else if (this.open && key === 'left')
      this.effort = Math.max(0, this.effort - 1);
    else if (this.open && key === 'down') this.selected++;
    else if (this.open && key === 'up') this.selected--;
    else if (this.open && key === 's') {
      this.model = this.selected;
      this.open = false;
    } else throw Error('Unexpected Claude fixture key');
  }
  view() {
    const border = '─'.repeat(20);
    const rows = this.models.map(
      (label, i) =>
        (this.selected === i ? '❯ ' : '  ') +
        (i + 1) +
        '. ' +
        label +
        (i === this.model ? ' ✔' : '') +
        ' · Native model',
    );
    const nativeLabel = this.levels[this.effort];
    const text = this.slider
      ? [
          'Effort',
          'Faster      Smarter',
          '─'.repeat([1, 7, 15][this.effort]) + '▲────',
          'low   medium  high',
          this.effort === 1
            ? 'The default effort for this model'
            : '~1.9x the estimated cost of medium (the default)',
          '←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel',
        ].join('\n')
      : this.command
        ? [
            '❯ /effort   Set effort level for model usage',
            border,
            '❯ /effort',
            border,
          ].join('\n')
        : this.open
          ? [
              'Select model',
              ...rows,
              this.levels[this.effort] + ' effort ←/→ to adjust',
              'Enter to set as default · s to use this session only · Esc to cancel',
            ].join('\n')
          : [
              ...(this.working
                ? ['✻ Working… (3s · ↓ 12 tokens)', '◐ indicator · /status']
                : this.nativeEffort && !this.hideBadge
                  ? ['◐ ' + nativeLabel + ' · /effort']
                  : []),
              border,
              '❯ ',
              border,
              this.working
                ? '⏵⏵ accept edits on (shift+tab to cycle) · ← for agents'
                : this.nativeEffort
                  ? '? for shortcuts'
                  : 'Claude ' +
                    this.models[this.model] +
                    ' · ' +
                    this.levels[this.effort],
              this.plan ? '⏸ plan mode on' : '',
            ].join('\n');
    return {
      text,
      cursor:
        this.open || this.slider
          ? null
          : {
              row:
                this.command || (this.nativeEffort && !this.hideBadge) ? 3 : 2,
              column: this.command ? 10 : 3,
            },
      hash: createHash('sha256').update(text).digest('hex'),
    };
  }
}
