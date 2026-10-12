import { writable } from 'svelte/store';
import type { BattleState } from './battle-types';

export const battle = writable<BattleState>({
  turn: 0,
  hp: 100,
  mp: 100,
  sp: 100,
  oc: 0,
  monsterAll: 0,
  monsterAlive: 0,
  bossAll: 0,
  bossAlive: 0,
  monsterStatus: [],
  monsterBase: [],
  otos: { OFC: 0, FRD: 0, T3: 0, T2: 0, T1: 0 },
  roundType: '',
  roundNow: 0,
  roundAll: 0,
  attackStatus: -1,
  runSpeed: 1,
  timeNow: Date.now(),
});
