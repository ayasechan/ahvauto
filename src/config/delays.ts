import { SPELL_DELAY_KEY, NO_SPELL_DELAY_KEY } from '../platform/storage-keys';

/** 发包延迟桥（sessionStorage）：combat/api-hook 经此读写。 */
export function publishSpellDelays(spellDelay: number, noSpellDelay: number): void {
  try {
    sessionStorage[SPELL_DELAY_KEY] = String(spellDelay);
    sessionStorage[NO_SPELL_DELAY_KEY] = String(noSpellDelay);
  } catch {
    /* session 不可用时忽略（页世界钩子侧回落默认值） */
  }
}

export function readSpellDelays(): { spellDelay: number; noSpellDelay: number } {
  const num = (v: string | null, fb: number): number => {
    const n = Number(v ?? fb);
    return Number.isFinite(n) ? n : fb;
  };
  try {
    return {
      spellDelay: num(sessionStorage.getItem(SPELL_DELAY_KEY), 200),
      noSpellDelay: num(sessionStorage.getItem(NO_SPELL_DELAY_KEY), 30),
    };
  } catch {
    return { spellDelay: 200, noSpellDelay: 30 };
  }
}
