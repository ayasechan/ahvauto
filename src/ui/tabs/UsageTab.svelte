<script lang="ts">
  import { options, kvGet } from '../../lib/store';
  import { ENCOUNTER_KEY, STAMINA_LOG_KEY } from '../../lib/storage-keys';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import {
    getTotals,
    getBattles,
    getCurBattle,
    clearStats,
    battlesToCsv,
    isPhysicalElem,
  } from '../../lib/stats';
  import type { BattleRow, CurBattle } from '../../lib/stats';
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
  let stats = $state(getTotals());
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

  function refresh() {
    stats = getTotals();
    battles = [...getBattles()].reverse();
    cur = getCurBattle();
    staminaLog = readStamina();
    encounter = readEncounter();
    const sel = selected;
    if (sel)
      selected =
        getBattles().find((b) => b.key === sel.key && b.startedAt === sel.startedAt) ?? null;
  }
  function clear() {
    clearStats();
    refresh();
  }
  function exportCsv() {
    const blob = new Blob([battlesToCsv(getBattles())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahvauto-battles-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  refresh();

  // 大数字千分位（1713850677 → 1,713,850,677）
  const fmt = (n: number | undefined | null): string => (n ?? 0).toLocaleString('en-US');
  const top = (rec: Record<string, number>, n = 5) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
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
    <button type="button" onclick={clear}>{L('ui.clear')}</button>
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
          >{top(stats.proficiency)
            .map(([k, v]) => `${k} ${fmt(v)}`)
            .join(', ')}</td
        ></tr
      >
      <tr><td>EXP / Credit</td><td>{fmt(stats.exp)} / {fmt(stats.credit)}</td></tr>
      <tr
        ><td>Casts</td><td
          >{top(stats.casts)
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ')}</td
        ></tr
      >
      <tr
        ><td>Items</td><td
          >{top(stats.itemsUsed)
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ')}</td
        ></tr
      >
      <tr><td>{L('usage.cost')}</td><td>{fmt(stats.mpCost)} / {fmt(stats.ocCost)}</td></tr>
      <tr
        ><td>{L('usage.restoreSrc')}</td><td
          >{top(stats.restoreBySource ?? {})
            .map(([k, v]) => `${k} ${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
      <tr><td>Monsters / Bosses</td><td>{fmt(stats.monsters)} / {fmt(stats.bosses)}</td></tr>
      <tr
        ><td>{L('usage.modes')}</td><td
          >{top(stats.modes ?? {})
            .map(([k, v]) => `${k}×${fmt(v)}`)
            .join(', ') || '—'}</td
        ></tr
      >
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
        {L('usage.live')}：{fmt(cur.turns)} turns / {fmt(cur.damage)} dmg / {fmt(cur.kills)} kills
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
                >{b.drops.length > 0 ? b.drops.join('; ') : '—'}</td
              ></tr
            >
            <tr
              ><td>{L('usage.modes')}</td><td
                >{b.modes
                  ? Object.entries(b.modes)
                      .map(([k, v]) => `${k}×${v}`)
                      .join(', ') || '—'
                  : '—'}</td
              ></tr
            >
            {#if b.detail}
              {@const d = b.detail}
              <tr
                ><td>{L('usage.dist.damage')}</td><td
                  >{Object.entries(d.damageByType)
                    .sort((a, b2) => b2[1] - a[1])
                    .slice(0, 5)
                    .map(([k, v]) => `${k} ${fmt(v)}`)
                    .join(', ') || '—'}</td
                ></tr
              >
              <tr
                ><td>{L('usage.dist.taken')}</td><td
                  >{Object.entries(d.takenByType)
                    .sort((a, b2) => b2[1] - a[1])
                    .slice(0, 5)
                    .map(([k, v]) => `${k} ${fmt(v)}`)
                    .join(', ') || '—'}</td
                ></tr
              >
              <tr
                ><td>{L('usage.dist.casts')}</td><td
                  >{Object.entries({ ...d.casts, ...d.itemsUsed })
                    .sort((a, b2) => b2[1] - a[1])
                    .slice(0, 5)
                    .map(([k, v]) => `${k}×${fmt(v)}`)
                    .join(', ') || '—'}</td
                ></tr
              >
            {/if}
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
          ><th>Monster</th><th>Boss</th><th>EXP</th></tr
        ></thead
      >
      <tbody>
        {#each battles as b}
          <tr class="clickable" onclick={() => (selected = b)}>
            <td>{b.key}</td><td>{typeLabel(b.type)}</td><td>{b.code || '—'}</td><td
              >{resultLabel(b.result)}</td
            ><td>{fmt(b.turns)}</td><td>{fmt(b.damage)}</td><td>{fmt(b.taken)}</td><td
              >{fmt(b.kills)}</td
            ><td>{fmt(b.monsters)}</td><td>{fmt(b.bosses)}</td><td>{fmt(b.exp)}</td>
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
