<script lang="ts">
  import { options, kvGet } from '../../lib/store';
  import { ENCOUNTER_KEY, STAMINA_LOG_KEY } from '../../lib/storage-keys';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import { logger } from '../../lib/logger';
  import {
    getTotals,
    getBattles,
    getCurBattle,
    clearStats,
    battlesToCsv,
    dropsToCsv,
    topDrops,
    formatDrops,
    deriveTotals,
    isPhysicalElem,
    emptyTotals,
  } from '../../lib/stats';
  import type { BattleRow, CurBattle, Totals } from '../../lib/stats';
  import * as battleMod from '../../lib/battle';

  const L = (k: I18nKey) => tr($options.lang, k);

  /** 战斗类型 → 词典 key（加类型必须同步补这里，否则编译报错）。 */
  const TYPE_KEY = {
    ar: 'battle.ar',
    rb: 'battle.rb',
    gr: 'battle.gr',
    iw: 'battle.iw',
    ba: 'battle.ba',
  } as const satisfies Record<string, I18nKey>;

  function typeLabel(t: string | undefined): string {
    const key = (TYPE_KEY as Record<string, I18nKey | undefined>)[t ?? ''] ?? 'battle.unknown';
    return tr($options.lang, key);
  }

  function resultLabel(r: string | undefined): string {
    const key =
      r === 'victory'
        ? 'battle.victory'
        : r === 'defeat'
          ? 'battle.defeat'
          : r === 'interrupted'
            ? 'battle.interrupted'
            : null;
    return key ? tr($options.lang, key) : (r ?? '?');
  }
  let stats = $state<Totals>(emptyTotals());
  let battles = $state<BattleRow[]>([]);
  let cur = $state<CurBattle | null>(null);
  let selected = $state<BattleRow | null>(null);
  let staminaLog = $state<Array<[string, number]>>([]);
  let encounter = $state<{ time: number; lastTime: number } | null>(null);

  // Stamina/遭遇战台账：优先 capture-agent 约定的 helper（getStaminaLog/getEncounter），
  // 不存在或异常时回落 kv 直读，全程防御、绝不 crash
  const bmod = battleMod as unknown as Record<string, unknown>;
  function callHelper(name: string): unknown {
    try {
      const fn = bmod[name];
      if (typeof fn === 'function') return (fn as () => unknown)();
    } catch {
      /* helper 异常时回落 kv 直读 */
    }
    return undefined;
  }
  function readStamina(): Array<[string, number]> {
    const via = callHelper('getStaminaLog');
    if (via && typeof via === 'object') {
      try {
        return Object.entries(via as Record<string, number>).slice(-5);
      } catch {
        /* fallthrough */
      }
    }
    try {
      const raw = kvGet(STAMINA_LOG_KEY, true) as Record<string, number> | null;
      if (raw && typeof raw === 'object') return Object.entries(raw).slice(-5);
    } catch {
      /* kv 缺失/损坏时返回空 */
    }
    return [];
  }
  function readEncounter(): { time: number; lastTime: number } | null {
    const via = callHelper('getEncounter');
    if (via && typeof via === 'object') {
      const v = via as Record<string, unknown>;
      if (typeof v['time'] === 'number')
        return {
          time: v['time'] as number,
          lastTime: typeof v['lastTime'] === 'number' ? (v['lastTime'] as number) : 0,
        };
    }
    try {
      const raw = kvGet(ENCOUNTER_KEY, true) as { time: number; lastTime: number } | null;
      if (raw && typeof raw.time === 'number')
        return { time: raw.time, lastTime: raw.lastTime ?? 0 };
    } catch {
      /* kv 缺失/损坏时返回空 */
    }
    return null;
  }

  async function refresh() {
    try {
      // 单次快照：一次读全表＋当前局，本地求和，避免总数与列表来自不同快照
      const t0 = performance.now();
      const [rows, c] = await Promise.all([getBattles(), getCurBattle()]);
      const t1 = performance.now();
      stats = deriveTotals(rows, c);
      const t2 = performance.now();
      logger.info('stats totals', {
        rows: rows.length + (c ? 1 : 0),
        turns: stats.turns,
        readMs: Math.round((t1 - t0) * 10) / 10,
        deriveMs: Math.round((t2 - t1) * 10) / 10,
      });
      const all = [...rows].reverse();
      // 原 Drop 页过滤并入：数字档位记录侧已过滤，此处只对文本做子串过滤
      const q = ($options.dropQuality ?? '').trim();
      battles =
        q !== '' && !/^\d+$/.test(q)
          ? all.filter((b) => b.drops.some((d) => d.toLowerCase().includes(q.toLowerCase())))
          : all;
      cur = c;
      staminaLog = readStamina();
      encounter = readEncounter();
      const sel = selected;
      if (sel)
        selected = battles.find((b) => b.key === sel.key && b.startedAt === sel.startedAt) ?? null;
    } catch {
      /* 面板读失败保持旧值 */
    }
  }
  async function clear() {
    try {
      await clearStats();
    } catch {
      /* ignore */
    }
    await refresh();
  }
  async function exportCsv() {
    const blob = new Blob([battlesToCsv(await getBattles())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahvauto-battles-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function exportDropsCsv() {
    const blob = new Blob([dropsToCsv(await getTotals())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahvauto-drops-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  void refresh();

  // 大数字千分位（1713850677 → 1,713,850,677）
  const fmt = (n: number | undefined | null): string => (n ?? 0).toLocaleString('en-US');
  const top = (rec: Record<string, number>, n = 5) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  // 用了哪些：施法/物品/来源按名全列（不截 top），按次数降序
  const allList = (rec: Record<string, number> | undefined | null): Array<[string, number]> =>
    Object.entries(rec ?? {}).sort((a, b) => b[1] - a[1]);
  // 承伤元素按组别分开展示（piercing/crushing/slashing→物理，其余→魔法）
  const topTakenBy = (phys: boolean, n = 5) =>
    Object.entries(stats.takenByType ?? {})
      .filter(([k]) => isPhysicalElem(k) === phys)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
</script>

<div>
  <div class="row">
    <button type="button" onclick={refresh}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportCsv}>{L('usage.csv')}</button>
    <button type="button" onclick={exportDropsCsv}>{L('usage.dropsCsv')}</button>
    <button type="button" onclick={clear}>{L('ui.clear')}</button>
  </div>
  <div class="row">
    {L('usage.filter')} <input bind:value={$options.dropQuality} placeholder="Epic" />
    <span class="hint">{L('usage.filterHint')}</span>
    <button type="button" onclick={refresh}>{L('ui.refresh')}</button>
  </div>
  <table>
    <tbody>
      <tr><td>Rounds</td><td>{fmt(stats.turns)}</td></tr>
      <tr><td>Battles</td><td>{fmt(stats.battles)}</td></tr>
      <tr><td>{L('usage.damage')}</td><td>{fmt(stats.damage)}（crit {fmt(stats.crits)}）</td></tr>
      {#each top(stats.damageByType) as [k, v]}
        <tr><td class="sub">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr
        ><td>{L('usage.hurt')}</td><td
          >{fmt(stats.taken)}（evade {fmt(stats.evades)} / miss {fmt(stats.misses)}）</td
        ></tr
      >
      <tr><td class="sub">{L('usage.takenPhys')}</td><td>{fmt(stats.takenPhys)}</td></tr>
      {#each topTakenBy(true) as [k, v]}
        <tr><td class="sub sub2">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr><td class="sub">{L('usage.takenMag')}</td><td>{fmt(stats.takenMag)}</td></tr>
      {#each topTakenBy(false) as [k, v]}
        <tr><td class="sub sub2">{k}</td><td>{fmt(v)}</td></tr>
      {/each}
      <tr
        ><td>{L('usage.restore')}</td><td
          >HP {fmt(stats.healedHp)} / MP {fmt(stats.restoredMp)} / SP {fmt(stats.restoredSp)}</td
        ></tr
      >
      <tr><td>{L('usage.absorbed')}</td><td>{fmt(stats.absorbed)}</td></tr>
      <tr><td>Focus</td><td>{fmt(stats.focus)}</td></tr>
      <tr
        ><td>{L('usage.proficiency')}</td><td
          >{allList(stats.proficiency)
            .map(([k, v]) => `${k} ${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr><td>EXP / Credit</td><td>{fmt(stats.exp)} / {fmt(stats.credit)}</td></tr>
      <tr
        ><td>{L('usage.drops')}</td><td
          >{topDrops(stats, 10)
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr
        ><td>Casts</td><td
          >{allList(stats.casts)
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr
        ><td>Items</td><td
          >{allList(stats.itemsUsed)
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr><td>{L('usage.cost')}</td><td>{fmt(stats.mpCost)} / {fmt(stats.ocCost)}</td></tr>
      <tr
        ><td>{L('usage.restoreSrc')}</td><td
          >{allList(stats.restoreBySource)
            .map(([k, v]) => `${k} ${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr><td>Monsters / Bosses</td><td>{fmt(stats.monsters)} / {fmt(stats.bosses)}</td></tr>
      <tr
        ><td>{L('usage.startedAt')}</td><td
          >{stats.startedAt ? new Date(stats.startedAt).toLocaleString() : '—'}</td
        ></tr
      >
    </tbody>
  </table>
  <div class="row">
    <b>{L('usage.single')}</b>（{L('usage.singleHint')}）
    {#if cur}
      <div class="live">
        {L('usage.live')}：{fmt(cur.turns)} turns / {fmt(cur.damage)} dmg / {fmt(cur.kills)} kills /
        {fmt(cur.drops.length)} drops
      </div>
    {/if}
    {#if selected}
      {@const b = selected}
      <div class="detail">
        <b>{b.key}</b>
        <button type="button" onclick={() => (selected = null)}>✕</button>
        <table>
          <tbody>
            <tr
              ><td>{L('usage.detail.start')}</td><td>{new Date(b.startedAt).toLocaleString()}</td
              ></tr
            >
            <tr
              ><td>{L('usage.detail.end')}</td><td
                >{b.endedAt ? new Date(b.endedAt).toLocaleString() : '—'}</td
              ></tr
            >
            <tr><td>{L('usage.detail.type')}</td><td>{typeLabel(b.type)}</td></tr>
            <tr><td>{L('usage.detail.code')}</td><td>{b.code || '—'}</td></tr>
            <tr><td>{L('usage.detail.result')}</td><td>{resultLabel(b.result)}</td></tr>
            <tr><td>{L('usage.detail.rounds')}</td><td>{fmt(b.rounds)}</td></tr>
            <tr><td>Turns</td><td>{fmt(b.turns)}</td></tr>
            <tr><td>{L('usage.detail.damage')}</td><td>{fmt(b.damage)}</td></tr>
            <tr><td>{L('usage.detail.taken')}</td><td>{fmt(b.taken)}</td></tr>
            <tr><td>{L('usage.detail.kills')}</td><td>{fmt(b.kills)}</td></tr>
            <tr><td>Monster</td><td>{fmt(b.monsters)}</td></tr>
            <tr><td>Boss</td><td>{fmt(b.bosses)}</td></tr>
            <tr><td>EXP</td><td>{fmt(b.exp)}</td></tr>
            <tr><td>Credit</td><td>{fmt(b.credit)}</td></tr>
            <tr
              ><td>{L('usage.detail.drops')}</td><td
                >{b.drops.length > 0 ? formatDrops(b.drops) : '—'}</td
              ></tr
            >
            <tr
              ><td>{L('usage.dist.damage')}</td><td
                >{Object.entries(b.damageByType ?? {})
                  .sort((a, b2) => b2[1] - a[1])
                  .slice(0, 5)
                  .map(([k, v]) => `${k} ${fmt(v)}`)
                  .join(', ') || '—'}</td
              ></tr
            >
            <tr
              ><td>{L('usage.dist.taken')}</td><td
                >{Object.entries(b.takenByType ?? {})
                  .sort((a, b2) => b2[1] - a[1])
                  .slice(0, 5)
                  .map(([k, v]) => `${k} ${fmt(v)}`)
                  .join(', ') || '—'}</td
              ></tr
            >
            <tr
              ><td>{L('usage.detail.casts')}</td><td
                >{Object.entries(b.casts ?? {})
                  .sort((a, b2) => b2[1] - a[1])
                  .map(([k, v]) => `${k}×${fmt(v)}`)
                  .join(', ') || '—'}</td
              ></tr
            >
            <tr
              ><td>{L('usage.detail.items')}</td><td
                >{Object.entries(b.itemsUsed ?? {})
                  .sort((a, b2) => b2[1] - a[1])
                  .map(([k, v]) => `${k}×${fmt(v)}`)
                  .join(', ') || '—'}</td
              ></tr
            >
          </tbody>
        </table>
      </div>
    {/if}
    <table>
      <thead
        ><tr
          ><th>{L('usage.table.time')}</th><th>{L('usage.table.type')}</th><th
            >{L('usage.table.code')}</th
          ><th>{L('usage.table.result')}</th><th>Turns</th><th>DMG</th><th>Taken</th><th>Kills</th
          ><th>Monster</th><th>Boss</th><th>EXP</th><th>Credit</th></tr
        ></thead
      >
      <tbody>
        {#each battles as b}
          <tr class="clickable" onclick={() => (selected = b)}>
            <td>{b.key}</td><td>{typeLabel(b.type)}</td><td>{b.code || '—'}</td><td
              >{resultLabel(b.result)}</td
            ><td>{fmt(b.turns)}</td><td>{fmt(b.damage)}</td><td>{fmt(b.taken)}</td><td
              >{fmt(b.kills)}</td
            ><td>{fmt(b.monsters)}</td><td>{fmt(b.bosses)}</td><td>{fmt(b.exp)}</td><td
              >{fmt(b.credit)}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="row">
    <b>{L('usage.ledger')}</b>
    <table>
      <tbody>
        <tr
          ><td>{L('usage.staminaLost')}</td><td
            >{staminaLog.length > 0 ? staminaLog.map(([k, v]) => `${k} -${v}`).join('; ') : '—'}</td
          ></tr
        >
        <tr
          ><td>{L('usage.encounters')}</td><td
            >{encounter
              ? `${encounter.time} ${L('usage.times')} / ${L('usage.lastTime')} ${encounter.lastTime ? new Date(encounter.lastTime).toLocaleString() : '—'}`
              : '—'}</td
          ></tr
        >
      </tbody>
    </table>
  </div>
</div>

<style>
  .row {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin: 0 0 12px;
    padding: 12px;
  }
  table {
    border-collapse: collapse;
    margin: 0 auto;
  }
  td,
  th {
    border: 1px solid #000;
    padding: 2px 6px;
  }
  td.sub {
    padding-left: 16px;
    color: #555;
  }
  span.hint {
    color: #555;
  }
  td.sub2 {
    padding-left: 32px;
  }
  .live {
    color: green;
    font-weight: bold;
  }
  tr.clickable {
    cursor: pointer;
  }
  tr.clickable:hover td {
    background: #cfe8ff;
  }
  .detail {
    border: 2px solid #5c0d11;
    margin: 4px 0;
    padding: 4px;
    background: #fff;
  }
</style>
