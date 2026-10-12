import { get } from 'svelte/store';
import { battle } from '../config/battle-state';
import { kvGet, kvSet, snapshotOptions } from '../config/store';
import { qsa } from '../platform/dom';
import { tt } from '../platform/i18n';
import { checkCondition } from './escape-cond';
import { setAlarm } from '../notify/notify';
import { sleep } from '../platform/http';
import { beginBattle, beginRound } from '../data/stats';
import {
  ROUND_TYPE_KEY,
  ROUND_NOW_KEY,
  ROUND_ALL_KEY,
  MONSTER_STATUS_KEY,
  MONSTER_BASE_KEY,
  ENCOUNTER_KEY,
  STAMINA_LOG_KEY,
} from '../platform/storage-keys';
import { patchBattle, goto, click, debugSurface } from './driver';
import { pauseChange } from './loop';

export function fixMonsterStatus(): void {
  const all = get(battle).monsterAll || qsa('div.btm1').length;
  const bossAll = get(battle).bossAll;
  const status = Array.from({ length: all }, (_, i) => (i < bossAll ? 100000 : 1000));
  patchBattle({ monsterStatus: status, monsterBase: [...status] });
  kvSet(MONSTER_STATUS_KEY, status);
  kvSet(MONSTER_BASE_KEY, status);
  goto();
}
/** 回合初始化：解析 roundType / roundNow / monsterStatus，原 newRound */
export async function newRound(): Promise<void> {
  patchBattle({ turn: 0, otos: { OFC: 0, FRD: 0, T3: 0, T2: 0, T1: 0 } });
  try {
    debugSurface().history = [];
  } catch {
    /* ignore */
  }
  if (location.hash !== '') {
    goto();
    return;
  }
  const monsterAll = qsa('div.btm1').length;
  const monsterDead = qsa('img[src*="nbardead"]').length;
  const bossAll = qsa('div.btm2[style^="background"]').length;
  const bossDead = qsa('div.btm1[style*="opacity"] div.btm2[style*="background"]').length;
  patchBattle({
    monsterAll,
    monsterAlive: monsterAll - monsterDead,
    bossAll,
    bossAlive: bossAll - bossDead,
  });

  const opt = snapshotOptions();
  if (opt.main.autoFlee && checkCondition(opt.main.fleeCondition)) {
    click('1001');
    await sleep(3000);
    goto();
    return;
  }

  const battleLog = qsa('#textlog>tbody>tr>td');
  const last = battleLog[battleLog.length - 1]?.textContent ?? '';
  try {
    if (snapshotOptions().main.debug) {
      const dbg = debugSurface();
      dbg.step = `newRound:n=${battleLog.length}:last=${last.slice(0, 60)}`;
      dbg.nr = `last=${last.slice(0, 60)}`;
    }
  } catch {
    /* ignore */
  }
  let roundType = (kvGet(ROUND_TYPE_KEY) as string | null) ?? '';
  if (!roundType) {
    if (!last.startsWith('Initializing')) roundType = '';
    else if (
      last.startsWith('Initializing arena challenge') &&
      Number(last.match(/\d+/)?.[0]) <= 35
    )
      roundType = 'ar';
    else if (last.startsWith('Initializing arena challenge')) roundType = 'rb';
    else if (last.startsWith('Initializing random encounter')) {
      roundType = 'ba';
      if (opt.main.encounter) {
        const enc = (kvGet(ENCOUNTER_KEY, true) as { lastTime: number; time: number } | null) ?? {
          lastTime: 0,
          time: 0,
        };
        enc.lastTime = Date.now();
        enc.time += 1;
        kvSet(ENCOUNTER_KEY, enc);
      }
    } else if (last.startsWith('Initializing Item World')) roundType = 'iw';
    else if (last.startsWith('Initializing Grindfest')) roundType = 'gr';
    else roundType = '';
    kvSet(ROUND_TYPE_KEY, roundType);
  }
  patchBattle({ roundType });

  if (/You lose \d+ Stamina/.test(battleLog[0]?.textContent ?? '')) {
    const log = (kvGet(STAMINA_LOG_KEY, true) as Record<string, number> | null) ?? {};
    const lost = Number(battleLog[0].textContent.match(/You lose (\d+) Stamina/)?.[1] ?? 0);
    log[new Date().toLocaleString()] = lost;
    kvSet(STAMINA_LOG_KEY, log);
    if (lost >= opt.main.staminaLose) {
      await setAlarm('Error');
      if (!confirm(tt('battle.confirmStamina'))) {
        pauseChange();
        return;
      }
    }
  }

  if (/Initializing/.test(last)) {
    const status: { order: number; id: number; hp: number }[] = [];
    let prevHp = 0;
    for (let i = battleLog.length - 2, id = 0; i > battleLog.length - 2 - monsterAll; i--, id++) {
      const m = battleLog[i]?.textContent.match(/HP=(\d+)$/);
      const hp = m ? Number(m[1]) : prevHp;
      prevHp = hp;
      status.push({ order: id, id: id === 9 ? 0 : id + 1, hp });
    }
    kvSet(
      MONSTER_STATUS_KEY,
      status.map((s) => s.hp),
    );
    kvSet(
      MONSTER_BASE_KEY,
      status.map((s) => s.hp),
    );
    patchBattle({
      monsterStatus: status.map((s) => s.hp),
      monsterBase: status.map((s) => s.hp),
    });
    const round = last.match(/\(Round (\d+) \/ (\d+)\)/);
    const [roundNow, roundAll] =
      roundType !== 'ba' && round ? [Number(round[1]), Number(round[2])] : [1, 1];
    kvSet(ROUND_NOW_KEY, String(roundNow));
    kvSet(ROUND_ALL_KEY, String(roundAll));
    patchBattle({ roundNow, roundAll });
    // 注意：每轮的拉取页日志都以新的 Initializing 行收尾，
    // 因此只有 Round 1 才是真正开局，其余是同局换轮
    if (roundNow === 1) {
      void beginBattle(roundType || '?', `${roundType || '?'} ${roundNow}/${roundAll}`);
    } else {
      void beginRound();
    }
  } else {
    void beginRound();
    patchBattle({
      roundNow: Number(kvGet(ROUND_NOW_KEY) ?? 1),
      roundAll: Number(kvGet(ROUND_ALL_KEY) ?? 1),
    });
  }
}
/** Stamina 台账读（newRound 记账，供 Usage 面板展示；与 ui-agent 约定签名） */
export function getStaminaLog(): Record<string, number> {
  try {
    return (kvGet(STAMINA_LOG_KEY, true) as Record<string, number> | null) ?? {};
  } catch {
    return {};
  }
}
/** 遭遇战计数读（newRound 记账，供 Usage 面板展示；与 ui-agent 约定签名） */
export function getEncounter(): { lastTime: number; time: number } {
  try {
    return (
      (kvGet(ENCOUNTER_KEY, true) as { lastTime: number; time: number } | null) ?? {
        lastTime: 0,
        time: 0,
      }
    );
  } catch {
    return { lastTime: 0, time: 0 };
  }
}
