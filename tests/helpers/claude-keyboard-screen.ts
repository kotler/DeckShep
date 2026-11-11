import { createHash } from 'node:crypto';
export class ClaudeKeyboardScreen {
  models = ['Prairie 3', 'Summit 8'];
  levels = ['low', 'medium', 'high'];
  model = 0;
  selected = 0;
  effort = 1;
  open = false;
  plan = false;
  send(key: string) {
    if (!this.open && key === 'alt+p') {
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
    const text = this.open
      ? [
          'Select model',
          ...rows,
          this.levels[this.effort] + ' effort ←/→ to adjust',
          'Enter to set as default · s to use this session only · Esc to cancel',
        ].join('\n')
      : [
          border,
          '❯ ',
          border,
          'Claude ' +
            this.models[this.model] +
            ' · ' +
            this.levels[this.effort],
          this.plan ? '⏸ plan mode on' : '',
        ].join('\n');
    return {
      text,
      cursor: this.open ? null : { row: 2, column: 3 },
      hash: createHash('sha256').update(text).digest('hex'),
    };
  }
}
