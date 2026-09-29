import { qs, qsa } from '../dom';
import type { Snapshot, SnapMonster, PaneBuff } from './types';
import { DEBUFF_WEIGHT_IMGS } from '../tables';

function numWidth(sel: string, base: number): number {
  return ((qs(sel) as HTMLElement | null)?.offsetWidth ?? 0) / base * 100;
}

/** 血条宽度 → hpNow（与游戏 120px 满格一致），死怪 Infinity */
function monsterHp(base: number, bar: Element | null): number {
  if (!bar) return Infinity;
  if (bar.querySelector('img[src*="nbardead.png"]')) return Infinity;
  const img = bar.querySelector('img');
  const width = img ? parseFloat((img as HTMLElement).style.width || '0') : 0;
  return Math.floor((base * width) / 120) + 1;
}

function parseTurns(over: string): number {
  const m = over.match(/\(.*,.*, (.*?)\)$/);
  return m ? Number(m[1]) : NaN;
}

function parseBuffName(over: string): string {
  return over.match(/'(.*?)'/)?.[1] ?? '';
}

/**
 * 集火权重（原 countMonsterHP 公式）：血量比×10 ± 身上 debuff 权重，
 * 永远升序，死怪（Infinity）垫底。返回按权重排好的怪 id。
 * 例外：活着的 Yggdrasil 永远置顶（无视 reverse，死了就地掉回权重排序）。
 */
export function orderTargets(
  monsters: { id: string; name: string; hpNow: number; marks: string[] }[],
  weights: Record<string, number>,
  reverse: boolean,
): string[] {
  const alive = monsters.filter((m) => m.hpNow !== Infinity);
  const hps = alive.map((m) => m.hpNow);
  const lo = hps.length > 0 ? Math.min(...hps) : 1;
  const hi = hps.length > 0 ? Math.max(...hps) : 1;
  const first = monsters.filter((m) => m.hpNow !== Infinity && isPriorityTarget(m.name)).map((m) => m.id);
  const rest = [...monsters]
    .filter((m) => !first.includes(m.id))
    .map((m) => {
      let w = m.hpNow === Infinity
        ? Infinity
        : reverse
          ? (hi / Math.max(1, m.hpNow)) * 10
          : (m.hpNow / Math.max(1, lo)) * 10;
      for (const mark of m.marks) {
        for (const key of Object.keys(DEBUFF_WEIGHT_IMGS)) {
          if (mark === DEBUFF_WEIGHT_IMGS[key]) w += reverse ? -(weights[key] ?? 0) : (weights[key] ?? 0);
        }
      }
      return { id: m.id, weight: w };
    })
    .sort((a, b) => a.weight - b.weight)
    .map((x) => x.id);
  return [...first, ...rest];
}

/** 置顶集火的怪名（去首尾空格后大小写无关全等）。只要活着就先打它。 */
const PRIORITY_TARGET_NAME = 'yggdrasil';

function isPriorityTarget(name: string): boolean {
  return name.trim().toLowerCase() === PRIORITY_TARGET_NAME;
}

function readPaneBuffs(): PaneBuff[] {
  return qsa('#pane_effects>img').map((img) => {
    const src = img.getAttribute('src') ?? '';
    const over = img.getAttribute('onmouseover') ?? '';
    return {
      src,
      bid: img.getAttribute('id') ?? '',
      name: parseBuffName(over),
      turns: parseTurns(over),
      scroll: src.endsWith('_scroll.png'),
    };
  });
}

function readMonster(
  idx: number,
  bar: Element | null,
  box: Element | null,
  base: number,
): SnapMonster {
  const id = String(idx === 9 ? 0 : idx + 1);
  const hpNow = monsterHp(base, bar);
  const name = bar?.closest('div.btm1')?.querySelector('div.btm3 > div > div')?.textContent?.trim() ?? '';
  const imgs = box ? box.querySelectorAll('img') : [];
  const marks: string[] = [];
  for (const img of imgs) {
    const src = img.getAttribute('src') ?? '';
    for (const sub of Object.values(DEBUFF_WEIGHT_IMGS)) {
      if (src.includes(sub) && !marks.includes(sub)) marks.push(sub);
    }
  }
  const lastOver = imgs.length > 0 ? (imgs[imgs.length - 1].getAttribute('onmouseover') ?? '') : '';
  return {
    id,
    name,
    alive: hpNow !== Infinity,
    hpNow,
    maxHp: base,
    marks,
    markCount: imgs.length,
    lastTurns: parseTurns(lastOver),
    clickable: !!qs(`#mkey_${id}`)?.getAttribute('onclick'),
  };
}

/** 从 DOM 一次性读出纯快照（唯一碰 DOM 的地方，无写）。base 为满血表。 */
export function readSnapshot(base: number[]): Snapshot {
  let hp = 100;
  let mp = 100;
  let sp = 100;
  let oc = 0;
  if (qs('#vbh')) {
    hp = numWidth('#vbh>div>img', 500);
    mp = numWidth('#vbm>div>img', 210);
    sp = numWidth('#vbs>div>img', 210);
    const dots = qsa('#vcp>div>div').length - qsa('#vcp>div>div#vcr').length;
    oc = dots > 0 ? dots * 25 : 0;
  } else {
    hp = numWidth('#dvbh>div>img', 418);
    mp = numWidth('#dvbm>div>img', 418);
    sp = numWidth('#dvbs>div>img', 418);
    oc = Number(qs('#dvrc')?.textContent ?? 0);
  }

  const bars = qsa('div.btm4>div.btm5:nth-child(1)');
  const boxes = qsa('div.btm6');
  const monsters: SnapMonster[] = bars.map((bar, idx) =>
    readMonster(idx, bar, boxes[idx] ?? null, base[idx] ?? 0),
  );

  const skills: Record<string, boolean> = {};
  const skillNames: Record<string, string> = {};
  for (const node of document.querySelectorAll('[id]')) {
    const element = node as HTMLElement;
    if (/^\d+$/.test(element.id) && element.id.length >= 3) {
      skills[element.id] = element.style.opacity !== '0.5';
      const nm = (element.getAttribute('onmouseover') ?? '').match(/set_infopane_spell\('(.*?)'/)?.[1];
      if (nm) skillNames[element.id] = nm;
    }
  }
  for (const node of qsa('.bti3>div[onmouseover]')) {
    const m = (node.getAttribute('onmouseover') ?? '').match(/(\d{4,6})/);
    if (m) {
      skills[m[1]] = true;
      const label = (node.textContent ?? '').trim().split('\n')[0].trim();
      if (label) skillNames[m[1]] = label;
    }
  }

  const buffs = readPaneBuffs();
  const bossAll = qsa('div.btm2[style^="background"]').length;
  const bossDead = qsa('div.btm1[style*="opacity"] div.btm2[style*="background"]').length;

  return {
    hp,
    mp,
    sp,
    oc,
    turn: 0,
    roundNow: 0,
    roundAll: 0,
    roundType: '',
    attackStatus: -1,
    monsters,
    monsterAlive: monsters.filter((m) => m.alive).length,
    bossAll,
    bossAlive: bossAll - bossDead,
    buffs,
    skills,
    skillNames,
    gem: qs('#ikey_p')?.textContent ?? null,
    spiritOn: !!qs('#ckey_spirit[src*="spirit_a"]'),
    channeling: buffs.some((b) => b.src.includes('channeling')),
    etherTapX2: buffs.some((b) => b.name.includes('Ether Tap (x2)')),
    etherTapExpiring: buffs.some((b) => b.src.includes('wpn_et') && b.bid.includes('effect_expire')),
    fightingStyle: '1',
  };
}

/** 首个可点活怪 id，无则 null（纯） */
export function firstClickable(monsters: SnapMonster[]): string | null {
  return monsters.find((m) => m.alive && m.clickable)?.id ?? null;
}

/** 首选 id 可点则用，否则顺延活怪（纯） */
export function resolveTarget(monsters: SnapMonster[], preferred: string | undefined): string | null {
  if (preferred && monsters.some((m) => m.id === preferred && m.alive && m.clickable)) return preferred;
  return firstClickable(monsters);
}
