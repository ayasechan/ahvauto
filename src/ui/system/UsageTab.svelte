<script lang="ts">
  import { options, kvGet } from '../../config/store';
  import { ENCOUNTER_KEY, STAMINA_LOG_KEY } from '../../platform/storage-keys';
  import { tr } from '../../platform/i18n';
  import type { I18nKey } from '../../platform/i18n';
  import { logger } from '../../platform/logger';
  import {
    getTotals,
    getBattles,
    getCurBattle,
    clearStats,
    battlesToCsv,
    dropsToCsv,
    groupedDrops,
    formatDrops,
    deriveTotals,
    filterBattlesByRange,
    normalizeUsageRange,
    logBarWidths,
    fmtCompact,
    isPhysicalElem,
    emptyTotals,
  } from '../../data/stats';
  import type { BattleRow, CurBattle, DropGroup, Totals } from '../../data/stats';
  import { DROP_QUALITY, normalizeQualityFilter } from '../../data/stats';
  import * as battleMod from '../../combat/round';

  const L = (k: I18nKey) => tr($options.lang, k);

  /** 掉落分组 → 词典 key（加组必须同步补这里，否则编译报错）。 */
  const DROP_GROUP_KEY = {
    equip: 'usage.dropsEquip',
    consumable: 'usage.dropsConsumable',
    material: 'usage.dropsMaterial',
    trophy: 'usage.dropsTrophy',
    relic: 'usage.dropsRelic',
    figure: 'usage.dropsFigure',
    monsteritem: 'usage.dropsMonster',
    other: 'usage.dropsOther',
  } as const satisfies Record<DropGroup, I18nKey>;
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

  const RESULT_KEY = {
    victory: 'battle.victory',
    defeat: 'battle.defeat',
    interrupted: 'battle.interrupted',
  } as const satisfies Record<string, I18nKey>;

  function resultLabel(r: string | undefined): string {
    const key = (RESULT_KEY as Record<string, I18nKey | undefined>)[r ?? ''] ?? null;
    return key ? tr($options.lang, key) : (r ?? '?');
  }

  const PAGE = 20;
  let stats = $state<Totals>(emptyTotals());
  let allRows = $state<BattleRow[]>([]);
  let filteredRows = $state<BattleRow[]>([]);
  let cur = $state<CurBattle | null>(null);
  let selected = $state<BattleRow | null>(null);
  let liveOpen = $state(false);
  /** 行选中判等（与 refresh 回找同口径：key + startedAt，避免对象引用失效） */
  function isSelected(b: BattleRow): boolean {
    return !!selected && selected.key === b.key && selected.startedAt === b.startedAt;
  }
  function toggleBattle(b: BattleRow): void {
    selected = isSelected(b) ? null : b;
  }
  let visibleCount = $state(PAGE);
  let staminaLog = $state<Array<[string, number]>>([]);
  let encounter = $state<{ time: number; lastTime: number } | null>(null);

  // 大数字千分位全量（hover/tooltip 用）；展示用 short() 紧凑 k/M
  function fmt(n: number | undefined | null): string {
    return (n ?? 0).toLocaleString('en-US');
  }
  function short(n: number | undefined | null): string {
    return fmtCompact(n);
  }
  function top(rec: Record<string, number>, n = 5): Array<[string, number]> {
    return Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }
  // chips：TopN＋展开，其余进 <details>
  function chipSplit(
    rec: Record<string, number> | undefined | null,
    n = 5,
  ): { head: Array<[string, number]>; rest: Array<[string, number]> } {
    const all = Object.entries(rec ?? {}).sort((a, b) => b[1] - a[1]);
    return { head: all.slice(0, n), rest: all.slice(n) };
  }
  // 承伤元素按组别分开展示（piercing/crushing/slashing→物理，其余→魔法）
  function topTakenBy(phys: boolean, n = 5): Array<[string, number]> {
    return Object.entries(stats.takenByType ?? {})
      .filter(([k]) => isPhysicalElem(k) === phys)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  const shown = $derived(filteredRows.slice(0, visibleCount));
  const darkTop = $derived(top(stats.damageByType, 1)[0]);
  const restDmg = $derived(
    logBarWidths(
      Object.entries(stats.damageByType ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(1),
      100,
    ),
  );
  const castsSplit = $derived(chipSplit(stats.casts));
  const itemsSplit = $derived(chipSplit(stats.itemsUsed));

  const PIE_COLORS = ['#2563eb', '#7c6cff', '#0ea5e9', '#10b981', '#f59e0b'];
  interface PieSeg {
    key: string;
    value: number;
    pct: number;
    off: number;
    color: string;
  }
  /** 饼图分段（top5＋其余聚合为 Other；标准配方：pathLength=100，dasharray "pct 100-pct"
   *  周期恒 100，dashoffset=25-acc 从 12 点起笔；hover 全量由 <title> 承担） */
  function pieSlices(rec: Record<string, number> | undefined | null): PieSeg[] {
    const all = Object.entries(rec ?? {}).sort((a, b) => b[1] - a[1]);
    const total = all.reduce((a, [, v]) => a + v, 0);
    if (total <= 0) return [];
    const head = all.slice(0, 5);
    const rest = all.slice(5).reduce((a, [, v]) => a + v, 0);
    const rows: Array<[string, number]> = rest > 0 ? [...head, ['Other', rest]] : head;
    let acc = 0;
    return rows.map(([key, value], i) => {
      const pct = (value / total) * 100;
      const seg = { key, value, pct, off: acc, color: PIE_COLORS[i % PIE_COLORS.length] };
      acc += pct;
      return seg;
    });
  }
  const physPie = $derived(pieSlices(Object.fromEntries(topTakenBy(true, 20))));
  const magPie = $derived(pieSlices(Object.fromEntries(topTakenBy(false, 20))));
  interface PiePanel {
    title: string;
    total: number;
    segs: PieSeg[];
  }
  const takenPies = $derived<PiePanel[]>([
    { title: tr($options.lang, 'usage.takenPhys'), total: stats.takenPhys, segs: physPie },
    { title: tr($options.lang, 'usage.takenMag'), total: stats.takenMag, segs: magPie },
  ]);

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

  /** 时间窗应用：汇总＋列表同一切窗（含进行中局），见 docs/UI.md。 */
  function applyRange() {
    const range = normalizeUsageRange($options.usageTimeRange);
    filteredRows = filterBattlesByRange(allRows, range);
    stats = deriveTotals([...filteredRows].reverse(), cur);
  }

  async function refresh() {
    try {
      // 单次快照：一次读全表＋当前局，本地求和，避免总数与列表来自不同快照
      const t0 = performance.now();
      const [rows, c] = await Promise.all([getBattles(), getCurBattle()]);
      const t1 = performance.now();
      // 老文本筛选值已退役：归一化到预设域；时间窗切汇总＋列表，品质档只过滤汇总与掉落CSV。
      $options.dropQuality = normalizeQualityFilter($options.dropQuality ?? '');
      $options.usageTimeRange = normalizeUsageRange($options.usageTimeRange);
      allRows = [...rows].reverse();
      cur = c;
      applyRange();
      const t2 = performance.now();
      logger.info('stats totals', {
        rows: rows.length + (c ? 1 : 0),
        turns: stats.turns,
        readMs: Math.round((t1 - t0) * 10) / 10,
        deriveMs: Math.round((t2 - t1) * 10) / 10,
      });
      staminaLog = readStamina();
      encounter = readEncounter();
      const sel = selected;
      if (sel)
        selected =
          filteredRows.find((b) => b.key === sel.key && b.startedAt === sel.startedAt) ?? null;
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
    const blob = new Blob([battlesToCsv([...filteredRows].reverse())], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahvauto-battles-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function exportDropsCsv() {
    const blob = new Blob([dropsToCsv(await getTotals(), $options.dropQuality ?? '')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahvauto-drops-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  void refresh();
</script>

<div>
  <div class="row toolbar">
    <button type="button" class="primary" onclick={refresh}>{L('ui.refresh')}</button>
    <button type="button" onclick={exportCsv}>{L('usage.csv')}</button>
    <button type="button" onclick={exportDropsCsv}>{L('usage.dropsCsv')}</button>
    <button type="button" class="danger" onclick={clear}>{L('ui.clear')}</button>
    <label class="filter"
      >{L('usage.timeRange')}
      <select
        bind:value={$options.usageTimeRange}
        onchange={() => {
          visibleCount = PAGE;
          void refresh();
        }}
      >
        <option value="1d">{L('usage.range1d')}</option>
        <option value="7d">{L('usage.range7d')}</option>
        <option value="all">{L('usage.rangeAll')}</option>
      </select>
    </label>
    <label class="filter"
      >{L('usage.filter')}
      <select bind:value={$options.dropQuality} onchange={refresh}>
        <option value="">{L('usage.filterAll')}</option>
        {#each DROP_QUALITY as g, i}
          <option value={String(i)}>{g}+</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-t">Rounds</div>
      <div class="kpi-v" title={fmt(stats.turns)}>{short(stats.turns)}</div>
      <div class="kpi-s">{L('usage.showing')}{fmt(stats.battles)}{L('usage.battlesUnit')}</div>
    </div>
    <div class="kpi">
      <div class="kpi-t">{L('usage.damage')}</div>
      <div class="kpi-v" title={fmt(stats.damage)}>{short(stats.damage)}</div>
      <div class="kpi-s">crit {fmt(stats.crits)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-t">{L('usage.hurt')}</div>
      <div class="kpi-v" title={fmt(stats.taken)}>{short(stats.taken)}</div>
      <div class="kpi-s">evade {fmt(stats.evades)} / miss {fmt(stats.misses)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-t">EXP / Credit</div>
      <div class="kpi-v" title={`${fmt(stats.exp)} / ${fmt(stats.credit)}`}>
        {short(stats.exp)} / {short(stats.credit)}
      </div>
      <div class="kpi-s">{L('usage.drops')} {fmt(stats.dropsCount)}</div>
    </div>
  </div>

  <div class="row">
    <b>{L('usage.damage')} · {L('usage.darkFault')}</b>
    {#if darkTop}
      <div class="bar-row">
        <span class="bar-label" title={fmt(darkTop[1])}>{darkTop[0]} {short(darkTop[1])}</span>
        <div class="bar-track">
          <div
            class="bar-fill"
            style={`width:${stats.damage > 0 ? Math.round((darkTop[1] / stats.damage) * 1000) / 10 : 0}%`}
          ></div>
        </div>
        <span class="muted"
          >{stats.damage > 0 ? Math.round((darkTop[1] / stats.damage) * 1000) / 10 : 0}%</span
        >
      </div>
    {/if}
    <div class="bar-title" title={L('usage.logTip')}>
      {L('usage.restDmg')}（{L('usage.logScale')}）
    </div>
    {#each restDmg as r}
      <div class="bar-row">
        <span class="bar-label" title={fmt(r.value)}>{r.key} {short(r.value)}</span>
        <div class="bar-track"><div class="bar-fill soft" style={`width:${r.width}%`}></div></div>
      </div>
    {/each}
    <div class="pies">
      {#each takenPies as p}
        <div class="pie">
          <div class="bar-title" title={fmt(p.total)}>{p.title} {short(p.total)}</div>
          {#if p.segs.length > 0}
            <div class="pie-body">
              <svg viewBox="0 0 42 42" role="img" aria-label={p.title}>
                <circle cx="21" cy="21" r="15.9155" fill="none" stroke-width="6" stroke="#f1f5f9" />
                {#each p.segs as s}
                  <circle
                    cx="21"
                    cy="21"
                    r="15.9155"
                    fill="none"
                    stroke-width="6"
                    stroke={s.color}
                    pathLength="100"
                    stroke-dasharray={`${s.pct} ${Math.max(100 - s.pct, 0.1)}`}
                    stroke-dashoffset={25 - s.off}
                  >
                    <title>{s.key} {fmt(s.value)}</title>
                  </circle>
                {/each}
              </svg>
              <div class="pie-legend">
                {#each p.segs as s}
                  <div class="pie-row" title={fmt(s.value)}>
                    <span class="dot" style={`background:${s.color}`}></span>{s.key}
                    {short(s.value)}
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="muted">{L('usage.noRecord')}</div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="muted">
      {L('usage.restore')} HP {fmt(stats.healedHp)} / MP {fmt(stats.restoredMp)} / SP {fmt(
        stats.restoredSp,
      )} · {L('usage.absorbed')}
      {fmt(stats.absorbed)}
    </div>
  </div>

  <div class="row">
    <b>{L('usage.drops')} / {L('usage.detail.casts')}</b>
    {#each groupedDrops(stats, $options.dropQuality ?? '') as g}
      {@const sp = chipSplit(Object.fromEntries(g.entries))}
      {#if sp.head.length > 0}
        <div class="chip-group">
          <span class="muted">{L(DROP_GROUP_KEY[g.group])}</span>
          {#each sp.head as [k, v]}<span class="chip">{k}×{fmt(v)}</span>{/each}
          {#if sp.rest.length > 0}
            <details>
              <summary>+</summary>{#each sp.rest as [k, v]}<span class="chip">{k}×{fmt(v)}</span
                >{/each}
            </details>
          {/if}
        </div>
      {/if}
    {/each}
    {#if castsSplit.head.length > 0}
      <div class="chip-group">
        <span class="muted">{L('usage.detail.casts')}</span>
        {#each castsSplit.head as [k, v]}<span class="chip">{k}×{fmt(v)}</span>{/each}
        {#if castsSplit.rest.length > 0}
          <details>
            <summary>+</summary>{#each castsSplit.rest as [k, v]}<span class="chip"
                >{k}×{fmt(v)}</span
              >{/each}
          </details>
        {/if}
      </div>
    {/if}
    {#if itemsSplit.head.length > 0}
      <div class="chip-group">
        <span class="muted">{L('usage.detail.items')}</span>
        {#each itemsSplit.head as [k, v]}<span class="chip">{k}×{fmt(v)}</span>{/each}
        {#if itemsSplit.rest.length > 0}
          <details>
            <summary>+</summary>{#each itemsSplit.rest as [k, v]}<span class="chip"
                >{k}×{fmt(v)}</span
              >{/each}
          </details>
        {/if}
      </div>
    {/if}
  </div>

  <div class="row">
    <div class="title-row">
      <b>{L('usage.single')}</b>
      <span class="muted"
        >{L('usage.showing')}{fmt(filteredRows.length)}{L('usage.battlesUnit')} · {L(
          'usage.singleHint',
        )}</span
      >
    </div>
    {#if cur}
      <button
        type="button"
        class="live-banner"
        title={`${fmt(cur.turns)} turns / ${fmt(cur.damage)} dmg / ${fmt(cur.kills)} kills`}
        onclick={() => (liveOpen = !liveOpen)}
      >
        <span aria-hidden="true">●</span>
        {L('usage.live')} · {short(cur.turns)} turns / {short(cur.damage)} dmg / {short(cur.kills)} kills
        /
        {fmt(cur.drops.length)} drops · {L('usage.liveDetail')} →
      </button>
    {/if}
    {#if liveOpen && cur}
      {@const c = cur}
      <div class="detail">
        <b>{L('usage.live')}</b>
        <button type="button" onclick={() => (liveOpen = false)}>✕</button>
        <div class="muted">
          {fmt(c.turns)} turns / {fmt(c.damage)} dmg / {fmt(c.taken)} taken / {fmt(c.kills)} kills
        </div>
        <div class="muted">{c.drops.length > 0 ? formatDrops(c.drops) : '—'}</div>
      </div>
    {/if}
    {#snippet battleDetail(b: BattleRow)}
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
    {/snippet}
    {#if filteredRows.length === 0}
      <div class="muted">{L('usage.emptyBattles')}</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>{L('usage.table.time')}</th><th>{L('usage.table.type')}</th><th>DMG</th><th
                >Taken</th
              ><th>{L('usage.table.result')}</th></tr
            ></thead
          >
          <tbody>
            {#each shown as b}
              <tr class="clickable" class:active={isSelected(b)} onclick={() => toggleBattle(b)}>
                <td>{b.key}</td><td>{typeLabel(b.type)}</td><td class="num" title={fmt(b.damage)}
                  >{short(b.damage)}</td
                ><td class="num" title={fmt(b.taken)}>{short(b.taken)}</td><td
                  ><span class="pill">{resultLabel(b.result)}</span></td
                >
              </tr>
              {#if isSelected(b)}
                <tr class="detail-row"><td colspan="5">{@render battleDetail(b)}</td></tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      {#if visibleCount < filteredRows.length}
        <button type="button" onclick={() => (visibleCount += PAGE)}>
          {L('usage.loadMore')}（{L('usage.leftOver')}
          {fmt(filteredRows.length - visibleCount)}
          {L('usage.battlesUnit')}）
        </button>
      {/if}
    {/if}
  </div>
  <div class="row">
    <b>{L('usage.ledger')}</b>
    <table>
      <tbody>
        <tr
          ><td>{L('usage.staminaLost')}</td><td
            >{staminaLog.length > 0
              ? staminaLog.map(([k, v]) => `${k} -${v}`).join('; ')
              : L('usage.noRecord')}</td
          ></tr
        >
        <tr
          ><td>{L('usage.encounters')}</td><td
            >{encounter
              ? `${encounter.time} ${L('usage.times')} / ${L('usage.lastTime')} ${encounter.lastTime ? new Date(encounter.lastTime).toLocaleString() : L('usage.noRecord')}`
              : L('usage.noRecord')}</td
          ></tr
        >
      </tbody>
    </table>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  button.primary {
    background: var(--hv-primary);
    border-color: var(--hv-primary);
    color: #fff;
    font-weight: 700;
  }
  button.danger {
    color: #dc2626;
    border-color: #fecaca;
  }
  .filter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    font-size: 12px;
    color: var(--hv-t2);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 0 0 12px;
  }
  .kpi {
    background: var(--hv-card);
    border: 1px solid var(--hv-line);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .kpi-t {
    font-size: 11px;
    font-weight: 700;
    color: var(--hv-t3);
  }
  .kpi-v {
    font-size: 18px;
    font-weight: 800;
  }
  .kpi-s {
    font-size: 11px;
    color: var(--hv-t2);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td,
  th {
    border-bottom: 1px solid var(--hv-line);
    padding: 6px 8px;
    text-align: left;
  }
  th {
    background: var(--hv-input);
    position: sticky;
    top: 0;
  }
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tbody tr:nth-child(even) td {
    background: #f8fafc;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
  }
  .bar-label {
    min-width: 140px;
    font-size: 12px;
  }
  .bar-track {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: var(--hv-input);
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--hv-primary);
  }
  .bar-fill.soft {
    background: #7c6cff;
  }
  .bar-title {
    font-size: 12px;
    color: var(--hv-t2);
    margin-top: 8px;
  }
  .muted {
    font-size: 12px;
    color: var(--hv-t3);
  }
  .pies {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 8px 0;
  }
  .pie-body {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 4px 0;
  }
  .pie-body svg {
    width: 84px;
    height: 84px;
    flex: none;
  }
  .pie-legend {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  .pie-row {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex: none;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin: 6px 0;
  }
  .chip {
    border-radius: 999px;
    border: 1px solid #bfdbfe;
    background: #eef2ff;
    color: var(--hv-primary);
    padding: 2px 10px;
    font-size: 12px;
  }
  details summary {
    cursor: pointer;
    color: var(--hv-t2);
  }
  .table-wrap {
    overflow-x: auto;
  }
  .pill {
    border-radius: 999px;
    background: #dcfce7;
    color: #15803d;
    padding: 1px 10px;
    font-size: 12px;
    font-weight: 700;
  }
  .live-banner {
    display: block;
    width: 100%;
    text-align: left;
    border-radius: 8px;
    border: 1px solid #86efac;
    background: #dcfce7;
    color: #15803d;
    font-weight: 700;
    margin: 8px 0;
  }
  .live-banner:hover {
    background: #bbf7d0;
    border-color: var(--hv-primary);
    color: var(--hv-primary);
  }
  tr.clickable {
    cursor: pointer;
  }
  tr.clickable:hover td {
    background: #eef2ff;
  }
  tr.clickable.active td {
    background: #eef2ff;
    font-weight: 700;
  }
  tr.detail-row td {
    background: transparent;
    padding: 0 0 8px;
  }
  tr.detail-row .detail {
    margin: 0 0 8px;
  }
  .detail {
    border: 1px solid var(--hv-line);
    border-radius: 10px;
    margin: 8px 0;
    padding: 8px;
    background: var(--hv-card);
  }
</style>
