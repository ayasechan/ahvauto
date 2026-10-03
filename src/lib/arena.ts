// 竞技场选项（frozen 对照表，来源 `docs/ARENA.md` CDP 实测 2026-10-02＋10-04）
// id 即开战 initid；gr 表 Grindfest（队列 token，非战斗 id）。
// RB250（112）10-02 快照时置灰，10-04 复测可点（init_battle(112,10)），收录。

export interface ArenaChoice {
  id: string;
  name: string;
  minLevel: number;
  kind: 'ar' | 'rb';
  rounds: number;
}

export const ARENA_AR: ArenaChoice[] = [
  { id: '17', name: 'Endgame', minLevel: 100, kind: 'ar', rounds: 35 },
  { id: '19', name: 'Longest Journey', minLevel: 110, kind: 'ar', rounds: 40 },
  { id: '20', name: 'Dreamfall', minLevel: 120, kind: 'ar', rounds: 45 },
  { id: '21', name: 'Exile', minLevel: 130, kind: 'ar', rounds: 50 },
  { id: '23', name: 'Sealed Power', minLevel: 140, kind: 'ar', rounds: 55 },
  { id: '24', name: 'New Wings', minLevel: 150, kind: 'ar', rounds: 60 },
  { id: '26', name: 'To Kill a God', minLevel: 165, kind: 'ar', rounds: 65 },
  { id: '27', name: 'Eve of Death', minLevel: 180, kind: 'ar', rounds: 70 },
  { id: '28', name: 'The Trio and the Tree', minLevel: 200, kind: 'ar', rounds: 75 },
  { id: '29', name: 'End of Days', minLevel: 225, kind: 'ar', rounds: 80 },
  { id: '32', name: 'Eternal Darkness', minLevel: 250, kind: 'ar', rounds: 85 },
  { id: '33', name: 'A Dance with Dragons', minLevel: 300, kind: 'ar', rounds: 90 },
  { id: '34', name: 'Post-Game Content', minLevel: 400, kind: 'ar', rounds: 95 },
  { id: '35', name: 'Secret Pony Level', minLevel: 500, kind: 'ar', rounds: 100 },
];

export const ARENA_RB: ArenaChoice[] = [
  { id: '105', name: 'Konata', minLevel: 50, kind: 'rb', rounds: 1 },
  { id: '106', name: 'Mikuru Asahina', minLevel: 75, kind: 'rb', rounds: 1 },
  { id: '107', name: 'Ryouko Asakura', minLevel: 75, kind: 'rb', rounds: 1 },
  { id: '108', name: 'Yuki Nagato', minLevel: 75, kind: 'rb', rounds: 1 },
  { id: '109', name: 'Real Life', minLevel: 100, kind: 'rb', rounds: 1 },
  { id: '110', name: 'Invisible Pink Unicorn', minLevel: 150, kind: 'rb', rounds: 1 },
  { id: '111', name: 'Flying Spaghetti Monster', minLevel: 200, kind: 'rb', rounds: 1 },
  { id: '112', name: 'Triple Trio and the Tree', minLevel: 250, kind: 'rb', rounds: 1 },
];

const LABEL = new Map<string, string>([
  ...ARENA_AR.map((c) => [c.id, `Lv.${c.minLevel} ${c.name}`] as [string, string]),
  ...ARENA_RB.map((c) => [c.id, `RB${c.minLevel} ${c.name}`] as [string, string]),
]);

export const GRIND_TOKEN = 'gr';

export function arenaLabel(id: string): string {
  if (id === GRIND_TOKEN) return 'Grindfest';
  return LABEL.get(id) ?? id;
}

/** 队列解析：逗号分隔去空，未知 token 原样保留（不丢数据）。 */
export function parseArenaValue(v: string): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeArenaQueue(q: string[]): string {
  return q.join(',');
}
