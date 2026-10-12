import type { HvOptions } from '../config/options-types';
import type { I18nKey } from '../platform/i18n';

export type TabGroup = 'battle' | 'item' | 'monitor' | 'sys';

/** 页头开关读写器：get/set 直达选项位，加可开关页只加注册表一行，不碰 App.svelte。 */
export interface TabCheck {
  get: (o: HvOptions) => boolean;
  set: (o: HvOptions, v: boolean) => void;
}

export interface TabDef {
  name: string;
  labelKey: I18nKey;
  group: TabGroup;
  check?: TabCheck;
}

const section = (
  key: 'channel' | 'buff' | 'debuff' | 'skill' | 'scroll' | 'infusion',
): TabCheck => ({
  get: (o) => o[key].enabled,
  set: (o, v) => {
    o[key].enabled = v;
  },
});

const recordUsage: TabCheck = {
  get: (o) => o.recordUsage,
  set: (o, v) => {
    o.recordUsage = v;
  },
};

/** 13 页注册表（顺序即展示顺序；分组见 group，App.svelte 只做渲染）。 */
export const TAB_DEFS: TabDef[] = [
  { name: 'Main', labelKey: 'tab.main', group: 'battle' },
  { name: 'Item', labelKey: 'tab.item', group: 'item' },
  { name: 'Channel', labelKey: 'tab.channel', group: 'battle', check: section('channel') },
  { name: 'Buff', labelKey: 'tab.buff', group: 'battle', check: section('buff') },
  { name: 'Debuff', labelKey: 'tab.debuff', group: 'battle', check: section('debuff') },
  { name: 'Skill', labelKey: 'tab.skill', group: 'battle', check: section('skill') },
  { name: 'Scroll', labelKey: 'tab.scroll', group: 'item', check: section('scroll') },
  { name: 'Infusion', labelKey: 'tab.infusion', group: 'item', check: section('infusion') },
  { name: 'Alarm', labelKey: 'tab.alarm', group: 'battle' },
  { name: 'Rule', labelKey: 'tab.rule', group: 'battle' },
  { name: 'Usage', labelKey: 'tab.usage', group: 'monitor', check: recordUsage },
  { name: 'About', labelKey: 'tab.about', group: 'sys' },
  { name: 'Feedback', labelKey: 'tab.feedback', group: 'sys' },
];

export const TAB_GROUPS: { key: TabGroup; titleKey: I18nKey }[] = [
  { key: 'battle', titleKey: 'group.battle' },
  { key: 'item', titleKey: 'group.item' },
  { key: 'monitor', titleKey: 'group.monitor' },
  { key: 'sys', titleKey: 'group.sys' },
];
