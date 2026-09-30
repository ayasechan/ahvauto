<script lang="ts">
  import { options } from '../../lib/store';
  import { tr } from '../../lib/i18n';
  import ConditionEditor from '../ConditionEditor.svelte';

  const L = (k: string) => tr($options.lang, k);
</script>

<div>
  <div class="row">
    Gem: Health <input class="num" type="number" bind:value={$options.main.hp1} />%
    Mana <input class="num" type="number" bind:value={$options.main.mp1} />%
    Spirit <input class="num" type="number" bind:value={$options.main.sp1} />%
  </div>
  <div class="row hot">
    <b>*{L('m.attackMode')}:</b>
    <select bind:value={$options.main.attackStatus}>
      <option value={-1}></option>
      <option value={0}>物理 / Physical</option>
      <option value={1}>火 / Fire</option>
      <option value={2}>冰 / Cold</option>
      <option value={3}>雷 / Elec</option>
      <option value={4}>风 / Wind</option>
      <option value={5}>圣 / Divine</option>
      <option value={6}>暗 / Forbidden</option>
    </select>
  </div>
  <div class="row">
    <b>{L('m.pause')}:</b>
    <label><input type="checkbox" bind:checked={$options.main.pauseButton} />{L('m.btn')}</label>
    <label><input type="checkbox" bind:checked={$options.main.pauseHotkey} />{L('m.hotkey')} <input style="width:40px" bind:value={$options.main.pauseHotkeyStr} /></label>
  </div>
  <div class="row">
    <b>{L('m.warn')}:</b>
    <label><input type="checkbox" bind:checked={$options.main.alert} />{L('m.audio')}</label>
    <label><input type="checkbox" bind:checked={$options.main.notification} />{L('m.desktop')}</label>
  </div>
  <div class="row">
    <b>{L('m.plugins')}:</b>
    <label><input type="checkbox" bind:checked={$options.main.encounter} />{L('m.encounter')}</label>
  </div>
  <div class="row"><b>{L('m.mid')}</b><ConditionEditor bind:expr={$options.main.middleSkillCondition} /></div>
  <div class="row"><b>{L('m.high')}</b><ConditionEditor bind:expr={$options.main.highSkillCondition} /></div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.turnOnSS} /><b>{L('m.sson')}</b></label>
    <ConditionEditor bind:expr={$options.main.turnOnSSCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.turnOffSS} /><b>{L('m.ssoff')}</b></label>
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
    {L('m.idle')}:
    <label><input type="checkbox" bind:checked={$options.main.delayAlert} /><input class="num" type="number" bind:value={$options.main.delayAlertTime} />{L('m.secAlarm')}</label>
    <label><input type="checkbox" bind:checked={$options.main.delayReload} /><input class="num" type="number" bind:value={$options.main.delayReloadTime} />{L('m.secReload')}</label>
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.riddlePopup} />{L('m.riddlePopup')}</label>
  </div>
  <div class="row">
    <b>Stamina</b> {L('m.stamLoss')} ≥ <input class="num" type="number" bind:value={$options.main.staminaLose} />:
    <label><input type="checkbox" bind:checked={$options.main.staminaPause} />{L('m.pause')}</label>
    <label><input type="checkbox" bind:checked={$options.main.staminaWarn} />{L('m.warn')}</label>
    <label><input type="checkbox" bind:checked={$options.main.staminaFlee} />{L('m.flee')}</label>
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.idleArena} /><b>{L('m.idleArena')}</b></label>
    <input class="num" type="number" bind:value={$options.main.idleArenaTime} />{L('m.afterIdle')}
    {L('m.levelSeq')} <input style="width:90%" bind:value={$options.main.idleArenaValue} />
    {L('m.grTimes')} <input class="num" type="number" bind:value={$options.main.idleArenaGrTime} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.repair} /><b>{L('m.repair')}</b></label>
    {L('m.durability')} ≤ <input class="num" type="number" bind:value={$options.main.repairValue} />%
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.etherTap} /><b>Ether Tap</b></label>
    <ConditionEditor bind:expr={$options.main.etherTapCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.autoFlee} /><b>{L('m.autoFlee')}</b></label>
    <ConditionEditor bind:expr={$options.main.fleeCondition} />
  </div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.restoreStamina} /><b>{L('m.restore')}</b></label>
    Stamina ≤ <input class="num" type="number" bind:value={$options.main.staminaLow} />
  </div>
  <div class="row"><label><input type="checkbox" bind:checked={$options.main.recordEach} /><b>{L('m.recordEach')}</b></label></div>
  <div class="row">
    <label><input type="checkbox" bind:checked={$options.main.hpFloorPause} /><b>{L('m.hpFloor')} <input class="num" type="number" bind:value={$options.main.hpFloor} />{L('m.hpFloorDo')}</b></label>
  </div>
  <div class="row">
    <b>{L('m.delay')}</b>: 1. {L('m.skills')} <input class="num" type="number" bind:value={$options.main.spellDelay} />ms
    2. {L('m.other')} <input class="num" type="number" bind:value={$options.main.noSpellDelay} />ms {L('m.jitter')}
  </div>
  <div class="row">
    {L('m.style')}:
    <select bind:value={$options.main.fightingStyle}>
      <option value="1">二天一流 / Niten Ichiryu</option>
      <option value="2">单手 / One-Handed</option>
      <option value="3">双手 / 2-Handed</option>
      <option value="4">双持 / Dual Wielding</option>
      <option value="5">法杖 / Staff</option>
    </select>
  </div>
</div>

<style>
  .row { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 0 12px; padding: 12px; }
  .hot { color: #dc2626; }
</style>
