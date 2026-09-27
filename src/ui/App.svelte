<script lang="ts">
  import type { Component } from 'svelte';
  import './theme.css';
  import { panelOpen, activeTab, options } from '../lib/store';
  import { tr } from '../lib/i18n';
  import MainTab from './tabs/MainTab.svelte';
  import ItemTab from './tabs/ItemTab.svelte';
  import ChannelTab from './tabs/ChannelTab.svelte';
  import BuffTab from './tabs/BuffTab.svelte';
  import DebuffTab from './tabs/DebuffTab.svelte';
  import SkillTab from './tabs/SkillTab.svelte';
  import ScrollTab from './tabs/ScrollTab.svelte';
  import InfusionTab from './tabs/InfusionTab.svelte';
  import AlarmTab from './tabs/AlarmTab.svelte';
  import RuleTab from './tabs/RuleTab.svelte';
  import DropTab from './tabs/DropTab.svelte';
  import UsageTab from './tabs/UsageTab.svelte';
  import AboutTab from './tabs/AboutTab.svelte';
  import FeedbackTab from './tabs/FeedbackTab.svelte';

  const TABS: { name: string; labelKey: string; comp: Component; check?: string }[] = [
    { name: 'Main', labelKey: 'tab.Main', comp: MainTab },
    { name: 'Item', labelKey: 'tab.Item', comp: ItemTab },
    { name: 'Channel', labelKey: 'tab.Channel', comp: ChannelTab, check: 'channel' },
    { name: 'Buff', labelKey: 'tab.Buff', comp: BuffTab, check: 'buff' },
    { name: 'Debuff', labelKey: 'tab.Debuff', comp: DebuffTab, check: 'debuff' },
    { name: 'Skill', labelKey: 'tab.Skill', comp: SkillTab, check: 'skill' },
    { name: 'Scroll', labelKey: 'tab.Scroll', comp: ScrollTab, check: 'scroll' },
    { name: 'Infusion', labelKey: 'tab.Infusion', comp: InfusionTab, check: 'infusion' },
    { name: 'Alarm', labelKey: 'tab.Alarm', comp: AlarmTab },
    { name: 'Rule', labelKey: 'tab.Rule', comp: RuleTab },
    { name: 'Drop', labelKey: 'tab.Drop', comp: DropTab, check: 'dropMonitor' },
    { name: 'Usage', labelKey: 'tab.Usage', comp: UsageTab, check: 'recordUsage' },
    { name: 'About', labelKey: 'tab.About', comp: AboutTab },
    { name: 'Feedback', labelKey: 'tab.Feedback', comp: FeedbackTab },
  ];

  function switchCheck(name: string): boolean {
    if (name === 'channel') return $options.channel.enabled;
    if (name === 'buff') return $options.buff.enabled;
    if (name === 'debuff') return $options.debuff.enabled;
    if (name === 'skill') return $options.skill.enabled;
    if (name === 'scroll') return $options.scroll.enabled;
    if (name === 'infusion') return $options.infusion.enabled;
    if (name === 'dropMonitor') return $options.dropMonitor;
    if (name === 'recordUsage') return $options.recordUsage;
    return true;
  }

  function setCheck(name: string, v: boolean) {
    if (name === 'channel') $options.channel.enabled = v;
    else if (name === 'buff') $options.buff.enabled = v;
    else if (name === 'debuff') $options.debuff.enabled = v;
    else if (name === 'skill') $options.skill.enabled = v;
    else if (name === 'scroll') $options.scroll.enabled = v;
    else if (name === 'infusion') $options.infusion.enabled = v;
    else if (name === 'dropMonitor') $options.dropMonitor = v;
    else if (name === 'recordUsage') $options.recordUsage = v;
  }

  const GROUPS: { title: string; tabs: typeof TABS }[] = [
    { title: '战斗设置', tabs: TABS.filter((t) => ['Main', 'Channel', 'Buff', 'Debuff', 'Skill'].includes(t.name)) },
    { title: '物品消耗', tabs: TABS.filter((t) => ['Item', 'Scroll', 'Infusion'].includes(t.name)) },
    { title: '监控数据', tabs: TABS.filter((t) => ['Alarm', 'Rule', 'Drop', 'Usage'].includes(t.name)) },
    { title: '系统', tabs: TABS.filter((t) => ['About', 'Feedback'].includes(t.name)) },
  ];

  const current = $derived(TABS.find((t) => t.name === $activeTab) ?? TABS[0]);
  const crumb = $derived(() => {
    const g = GROUPS.find((gr) => gr.tabs.some((t) => t.name === current.name));
    return `${g?.title ?? ''} / ${tr($options.lang, current.labelKey)}`;
  });
</script>

{#if $panelOpen}
  <div id="hvAABox" role="dialog" aria-label="hvAutoAttack">
    <div class="hvAACenter">
      <h1>hvAutoAttack</h1>
      <select bind:value={$options.lang} aria-label={tr($options.lang, 'a.lang')}>
        <option value="0">简体中文</option>
        <option value="1">繁體中文</option>
        <option value="2">English</option>
      </select>
      <button type="button" class="hvAAClose" onclick={() => ($panelOpen = false)}>{tr($options.lang, 'ui.close')}</button>
    </div>
    <div class="hvAATablist">
      <div class="hvAATabmenu" role="tablist">
        {#each GROUPS as g}
          <div class="hvAAGroup">{g.title}</div>
          {#each g.tabs as t}
            <button
              type="button"
              role="tab"
              aria-selected={$activeTab === t.name}
              class:active={$activeTab === t.name}
              onclick={() => ($activeTab = t.name)}
            >
              {#if t.check}
                <input
                  type="checkbox"
                  checked={switchCheck(t.check)}
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => setCheck(t.check!, e.currentTarget.checked)}
                  aria-label={tr($options.lang, t.labelKey)}
                />
              {/if}
              {tr($options.lang, t.labelKey)}
            </button>
          {/each}
        {/each}
      </div>
      <div class="hvAAContent">
        <div class="hvAACrumb">{crumb()}</div>
        <div class="hvAATitle">{tr($options.lang, current.labelKey)}</div>
        <div class="hvAATab" role="tabpanel">
          <current.comp />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  #hvAABox {
    left: calc(50% - 480px); top: 40px; font-size: 14px; z-index: 99999;
    width: 960px; max-height: 86vh; overflow: hidden; position: fixed; text-align: left;
    background-color: var(--hv-panel); border: 1px solid var(--hv-line); border-radius: 12px;
    font-family: 'Microsoft Yahei', 'Noto Sans TC', sans-serif; color: var(--hv-t1);
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  }
  .hvAACenter {
    display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid var(--hv-line); text-align: left;
  }
  .hvAACenter h1 { display: inline; font-size: 16px; margin: 0 8px 0 0; }
  .hvAACenter select { margin-left: auto; }
  .hvAATablist { position: relative; display: flex; max-height: calc(86vh - 57px); }
  .hvAATabmenu {
    width: 208px; flex: none; display: flex; flex-direction: column; gap: 2px;
    padding: 12px 10px; overflow-y: auto; min-height: 0;
    border-right: 1px solid var(--hv-line); background: var(--hv-side);
  }
  .hvAAGroup { font-size: 11px; color: var(--hv-t3); font-weight: 700; padding: 8px 8px 2px; }
  .hvAATabmenu > button {
    display: flex; align-items: center; gap: 6px; padding: 7px 10px;
    border: 1px solid transparent; font-size: 13px;
    border-radius: 8px; background-color: transparent; color: var(--hv-t2); cursor: pointer; text-align: left;
    white-space: nowrap; text-overflow: ellipsis; overflow: hidden;
  }
  .hvAATabmenu > button:hover { background: var(--hv-primary-soft); color: var(--hv-primary); }
  .hvAATabmenu > button.active { background: var(--hv-primary); color: #fff; font-weight: 700; }
  .hvAAContent { flex: 1; min-width: 0; background: var(--hv-bg); padding: 12px 16px 16px; overflow: hidden; display: flex; flex-direction: column; }
  .hvAACrumb { font-size: 12px; color: var(--hv-t3); }
  .hvAATitle { font-size: 18px; font-weight: 800; margin: 2px 0 10px; }
  .hvAATab {
    flex: 1; min-height: 0; overflow: auto; padding: 2px;
    color: var(--hv-t1); background-color: transparent; border: none;
  }
  .hvAATab :global(.row) {
    background: var(--hv-card) !important;
    border: 1px solid var(--hv-line) !important;
    border-radius: var(--hv-radius-card) !important;
    margin: 0 0 12px !important;
    padding: 12px !important;
  }
  .hvAATab :global(.row) :global(b) { font-size: 13px; }
  .hvAATab :global(.num) { width: 56px !important; text-align: right !important; }
</style>
