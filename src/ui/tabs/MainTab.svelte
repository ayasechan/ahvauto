<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import type { I18nKey } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';

  const L = (k: I18nKey) => tr($options.lang, k);
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
    {L('main.levelSeq')} <input style="width:90%" bind:value={$options.main.idleArenaValue} />
    {L('main.grTimes')}
    <input class="num" type="number" bind:value={$options.main.idleArenaGrTime} />
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
