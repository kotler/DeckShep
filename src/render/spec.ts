/** What one key shows. A pure value: equal specs always draw equal images. */
export type AgentFaceState =
  | 'ready'
  | 'working'
  | 'background'
  | 'question'
  | 'approval'
  | 'done'
  | 'error'
  | 'unknown'
  | 'closed'
  | 'empty'
  | 'offline';

export interface KeySpec {
  /** Lucide glyph id, 'codex' | 'claude-code', 'blank' or 'empty'. */
  icon: string;
  /** At most three caption lines. */
  lines: string[];
  /** #rrggbb surface/state colour. */
  color: string;
  /** 0..0.22 highlight over the surface. */
  pulse: number;
  badge: '' | 'selected';
  /** #rrggbb rail/icon tint. */
  accent: string;
  /** config.appearance.style ('signal' by default). */
  style: string;
  textOnly: boolean;
  agent: boolean;
  /** Wave 2: agent keys show a shape-coded state glyph. */
  state?: AgentFaceState;
  /** Wave 2: unavailable control, drawn with dimmed text and rail. */
  dim?: boolean;
  /** Wave 2: key has a long-press action and shows a corner tick. */
  hold?: boolean;
}
