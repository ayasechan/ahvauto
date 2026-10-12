<script lang="ts">
  import type { Component } from 'svelte';
  import './theme.css';
  import { panelOpen, activeTab, options } from '../config/store';
  import { tr } from '../platform/i18n';
  import type { I18nKey } from '../platform/i18n';
  import MainTab from './battle/MainTab.svelte';
  import ItemTab from './item/ItemTab.svelte';
  import ChannelTab from './battle/ChannelTab.svelte';
  import BuffTab from './battle/BuffTab.svelte';
  import DebuffTab from './battle/DebuffTab.svelte';
  import SkillTab from './battle/SkillTab.svelte';
  import ScrollTab from './item/ScrollTab.svelte';
  import InfusionTab from './item/InfusionTab.svelte';
  import AlarmTab from './system/AlarmTab.svelte';
  import RuleTab from './battle/RuleTab.svelte';
  import UsageTab from './system/UsageTab.svelte';
  import AboutTab from './system/AboutTab.svelte';
  import FeedbackTab from './system/FeedbackTab.svelte';
  import { TAB_DEFS, TAB_GROUPS } from './tabs';

  const COMPS: Record<string, Component> = {
    Main: MainTab,
    Item: ItemTab,
    Channel: ChannelTab,
    Buff: BuffTab,
    Debuff: DebuffTab,
    Skill: SkillTab,
    Scroll: ScrollTab,
    Infusion: InfusionTab,
    Alarm: AlarmTab,
    Rule: RuleTab,
    Usage: UsageTab,
    About: AboutTab,
    Feedback: FeedbackTab,
  };

  const TABS = TAB_DEFS.map((t) => ({ ...t, comp: COMPS[t.name] }));

  const GROUPS: { titleKey: I18nKey; tabs: typeof TABS }[] = TAB_GROUPS.map((g) => ({
    titleKey: g.titleKey,
    tabs: TABS.filter((t) => t.group === g.key),
  }));

  const current = $derived(TABS.find((t) => t.name === $activeTab) ?? TABS[0]);
  const crumb = $derived(() => {
    const g = GROUPS.find((gr) => gr.tabs.some((t) => t.name === current.name));
    return `${g ? tr($options.lang, g.titleKey) : ''} / ${tr($options.lang, current.labelKey)}`;
  });
</script>

{#if $panelOpen}
  <div id="ahvauto-panel" role="dialog" aria-label="ahvauto">
    <div class="ahvauto-center">
      <h1>ahvauto</h1>
      <select bind:value={$options.lang} aria-label={tr($options.lang, 'about.lang')}>
        <option value="0">{tr($options.lang, 'lang.zhHans')}</option>
        <option value="1">{tr($options.lang, 'lang.zhHant')}</option>
        <option value="2">{tr($options.lang, 'lang.en')}</option>
      </select>
      <button type="button" class="ahvauto-close" onclick={() => ($panelOpen = false)}
        >{tr($options.lang, 'ui.close')}</button
      >
    </div>
    <div class="ahvauto-tablist">
      <div class="ahvauto-tabmenu" role="tablist">
        {#each GROUPS as g}
          <div class="ahvauto-group">{tr($options.lang, g.titleKey)}</div>
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
                  checked={t.check.get($options)}
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => t.check?.set($options, e.currentTarget.checked)}
                  aria-label={tr($options.lang, t.labelKey)}
                />
              {/if}
              {tr($options.lang, t.labelKey)}
            </button>
          {/each}
        {/each}
      </div>
      <div class="ahvauto-content">
        <div class="ahvauto-crumb">{crumb()}</div>
        <div class="ahvauto-title">{tr($options.lang, current.labelKey)}</div>
        <div class="ahvauto-tab" role="tabpanel">
          <current.comp />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  #ahvauto-panel {
    left: calc(50% - 480px);
    top: 40px;
    font-size: 14px;
    z-index: 99999;
    width: 960px;
    max-height: 86vh;
    overflow: hidden;
    position: fixed;
    text-align: left;
    background-color: var(--hv-panel);
    border: 1px solid var(--hv-line);
    border-radius: 12px;
    font-family: 'Microsoft Yahei', 'Noto Sans TC', sans-serif;
    color: var(--hv-t1);
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  }
  .ahvauto-center {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hv-line);
    text-align: left;
  }
  .ahvauto-center h1 {
    display: inline;
    font-size: 16px;
    margin: 0 8px 0 0;
  }
  .ahvauto-center select {
    margin-left: auto;
  }
  .ahvauto-tablist {
    position: relative;
    display: flex;
    max-height: calc(86vh - 57px);
  }
  .ahvauto-tabmenu {
    width: 208px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 10px;
    overflow-y: auto;
    min-height: 0;
    border-right: 1px solid var(--hv-line);
    background: var(--hv-side);
  }
  .ahvauto-group {
    font-size: 11px;
    color: var(--hv-t3);
    font-weight: 700;
    padding: 8px 8px 2px;
  }
  .ahvauto-tabmenu > button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border: 1px solid transparent;
    font-size: 13px;
    border-radius: 8px;
    background-color: transparent;
    color: var(--hv-t2);
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .ahvauto-tabmenu > button:hover {
    background: var(--hv-primary-soft);
    color: var(--hv-primary);
  }
  .ahvauto-tabmenu > button.active {
    background: var(--hv-primary);
    color: #fff;
    font-weight: 700;
  }
  .ahvauto-content {
    flex: 1;
    min-width: 0;
    background: var(--hv-bg);
    padding: 12px 16px 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .ahvauto-crumb {
    font-size: 12px;
    color: var(--hv-t3);
  }
  .ahvauto-title {
    font-size: 18px;
    font-weight: 800;
    margin: 2px 0 10px;
  }
  .ahvauto-tab {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 2px;
    color: var(--hv-t1);
    background-color: transparent;
    border: none;
  }
  .ahvauto-tab :global(.row) {
    background: var(--hv-card) !important;
    border: 1px solid var(--hv-line) !important;
    border-radius: var(--hv-radius-card) !important;
    margin: 0 0 12px !important;
    padding: 12px !important;
  }
  .ahvauto-tab :global(.row) :global(b) {
    font-size: 13px;
  }
</style>
