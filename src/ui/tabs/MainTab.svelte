<script lang="ts">
  import { options, kvDel } from '../../lib/store';
  import { ARENA_KEY } from '../../lib/storage-keys';
  import {
    ARENA_AR,
    ARENA_RB,
    GRIND_TOKEN,
    arenaLabel,
    parseArenaValue,
    serializeArenaQueue,
  } from '../../lib/arena';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';

  const L = (k: I18nKey) => tr($options.lang, k);
  const queue = (): string[] => parseArenaValue($options.main.idleArenaValue);
  function setQueue(q: string[]): void {
    $options.main.idleArenaValue = serializeArenaQueue(q);
  }
  function toggle(id: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    const q = queue();
    setQueue(on ? [...q, id] : q.filter((x) => x !== id));
  }
  function move(i: number, d: -1 | 1) {
    const arr = queue();
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setQueue(arr);
  }
  function remove(i: number) {
    setQueue(queue().filter((_, j) => j !== i));
  }
</script>

<div>
  <div class="row">
    Gem: Health <input class="num" type="number" bind:value={$options.main.hp1} />% Mana
    <input class="num" type="number" bind:value={$options.main.mp1} />% Spirit
    <input class="num" type="number" bind:value={$options.main.sp1} />%
  </div>
  <div class="row hot">
    <b>*{L('main.attackMode')}:</b>
    <select bind:value={$options.main.attackStatus}>
      <option value={-1}></option>
      <option value={0}>{L('main.elem.phys')} / Physical</option>
      <option value={1}>{L('main.elem.fire')} / Fire</option>
      <option value={2}>{L('main.elem.cold')} / Cold</option>
      <option value={3}>{L('main.elem.elec')} / Elec</option>
      <option value={4}>{L('main.elem.wind')} / Wind</option>
      <option value={5}>{L('main.elem.divine')} / Divine</option>
      <option value={6}>{L('main.elem.forbidden')} / Forbidden</option>
    </select>
  </div>
  <div class="row">
    <b>{L('main.pause')}:</b>
    <label><input type="checkbox" bind:checked={$options.main.pauseButton} />{L('main.btn')}</label>
    <label
      ><input type="checkbox" bind:checked={$options.main.pauseHotkey} />{L('main.hotkey')}
      <input style="width:40px" bind:value={$options.main.pauseHotkeyStr} /></label
    >
  </div>
  <div class="row">
    <b>{L('main.warn')}:</b>
    <label><input type="checkbox" bind:checked={$options.main.alert} />{L('main.audio')}</label>
    <label
      ><input type="checkbox" bind:checked={$options.main.notification} />{L('main.desktop')}</label
    >
  </div>
  <div class="row">
    <b>{L('main.plugins')}:</b>
    <label
      ><input type="checkbox" bind:checked={$options.main.encounter} />{L('main.encounter')}</label
    >
  </div>
  <div class="row">
    <b>{L('main.mid')}</b><ConditionEditor bind:expr={$options.main.middleSkillCondition} />
  </div>
  <div class="row">
    <b>{L('main.high')}</b><ConditionEditor bind:expr={$options.main.highSkillCondition} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.turnOnSS} /><b>{L('main.sson')}</b></label
    >
    <ConditionEditor bind:expr={$options.main.turnOnSSCondition} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.turnOffSS} /><b>{L('main.ssoff')}</b
      ></label
    >
    <ConditionEditor bind:expr={$options.main.turnOffSSCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.defend} /><b>Defend</b></label>
    <ConditionEditor bind:expr={$options.main.defendCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.focus} /><b>Focus</b></label>
    <ConditionEditor bind:expr={$options.main.focusCondition} />
  </div>
  <div class="row">
    {L('main.idle')}:
    <label
      ><input type="checkbox" bind:checked={$options.main.delayAlert} /><input
        class="num"
        type="number"
        bind:value={$options.main.delayAlertTime}
      />{L('main.secAlarm')}</label
    >
    <label
      ><input type="checkbox" bind:checked={$options.main.delayReload} /><input
        class="num"
        type="number"
        bind:value={$options.main.delayReloadTime}
      />{L('main.secReload')}</label
    >
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.riddlePopup} />{L(
        'main.riddlePopup',
      )}</label
    >
  </div>
  <div class="row">
    <b>Stamina</b>
    {L('main.stamLoss')} ≥
    <input class="num" type="number" bind:value={$options.main.staminaLose} />:
    <label
      ><input type="checkbox" bind:checked={$options.main.staminaPause} />{L('main.pause')}</label
    >
    <label><input type="checkbox" bind:checked={$options.main.staminaWarn} />{L('main.warn')}</label
    >
    <label><input type="checkbox" bind:checked={$options.main.staminaFlee} />{L('main.flee')}</label
    >
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.idleArena} /><b>{L('main.idleArena')}</b
      ></label
    >
    <input class="num" type="number" bind:value={$options.main.idleArenaTime} />{L(
      'main.afterIdle',
    )}
    <button type="button" onclick={() => setQueue([])}>{L('ui.clear')}</button>
    <button type="button" onclick={() => kvDel(ARENA_KEY)}>{L('main.arenaReset')}</button>
    <div style="margin-top: 8px">
      <b>{L('main.arenaQueue')}</b><span class="hint">{L('order.seq')}</span><br />
      {#if queue().length === 0}
        <span class="hint">{L('order.empty')}</span>
      {:else}
        <ol class="seq">
          {#each queue() as id, i}
            <li>
              <span class="n">{i + 1}</span>{arenaLabel(id)}
              <button type="button" onclick={() => move(i, -1)} aria-label="up">↑</button>
              <button type="button" onclick={() => move(i, 1)} aria-label="down">↓</button>
              <button type="button" onclick={() => remove(i)} aria-label="remove">✕</button>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
    <div style="margin-top: 8px">
      <b>{L('main.arenaAr')}</b><br />
      {#each ARENA_AR as c}
        <label
          ><input
            type="checkbox"
            checked={queue().includes(c.id)}
            onchange={(e) => toggle(c.id, e)}
          />{arenaLabel(c.id)}</label
        >
      {/each}
    </div>
    <div style="margin-top: 8px">
      <b>{L('main.arenaRb')}</b><br />
      {#each ARENA_RB as c}
        <label
          ><input
            type="checkbox"
            checked={queue().includes(c.id)}
            onchange={(e) => toggle(c.id, e)}
          />{arenaLabel(c.id)}</label
        >
      {/each}
    </div>
    <div style="margin-top: 8px">
      <b>{L('main.arenaGr')}</b>
      <label
        ><input
          type="checkbox"
          checked={queue().includes(GRIND_TOKEN)}
          onchange={(e) => toggle(GRIND_TOKEN, e)}
        />Grindfest</label
      >
      {L('main.grTimes')}
      <input class="num" type="number" bind:value={$options.main.idleArenaGrTime} />
    </div>
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.repair} /><b>{L('main.repair')}</b></label
    >
    {L('main.durability')} ≤
    <input class="num" type="number" bind:value={$options.main.repairValue} />%
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.etherTap} /><b>Ether Tap</b></label>
    <ConditionEditor bind:expr={$options.main.etherTapCondition} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.autoFlee} /><b>{L('main.autoFlee')}</b
      ></label
    >
    <ConditionEditor bind:expr={$options.main.fleeCondition} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.restoreStamina} /><b
        >{L('main.restore')}</b
      ></label
    >
    Stamina ≤ <input class="num" type="number" bind:value={$options.main.staminaLow} />
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.recordEach} /><b>{L('main.recordEach')}</b
      ></label
    >
  </div>
  <div class="row">
    <label
      ><input type="checkbox" bind:checked={$options.main.hpFloorPause} /><b
        >{L('main.hpFloor')}
        <input class="num" type="number" bind:value={$options.main.hpFloor} />{L(
          'main.hpFloorDo',
        )}</b
      ></label
    >
  </div>
  <div class="row">
    <b>{L('main.delay')}</b>: 1. {L('main.skills')}
    <input class="num" type="number" bind:value={$options.main.spellDelay} />ms 2. {L('main.other')}
    <input class="num" type="number" bind:value={$options.main.noSpellDelay} />ms {L('main.jitter')}
  </div>
  <div class="row">
    {L('main.style')}:
    <select bind:value={$options.main.fightingStyle}>
      <option value="1">{L('main.style.niten')} / Niten Ichiryu</option>
      <option value="2">{L('main.style.oneHand')} / One-Handed</option>
      <option value="3">{L('main.style.twoHand')} / 2-Handed</option>
      <option value="4">{L('main.style.dual')} / Dual Wielding</option>
      <option value="5">{L('main.style.staff')} / Staff</option>
    </select>
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
  .hot {
    color: #dc2626;
  }
</style>
