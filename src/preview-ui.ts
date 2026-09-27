// 临时 UI 预览入口（CDP 注入专用，用完即删）：
// 只挂载设置面板供目检；不运行战斗逻辑；拦截一切 hvAA* 存储写入。
const rawSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = ((key: string, value: string): void => {
  if (key.startsWith('hvAA')) return;
  rawSetItem(key, value);
}) as typeof localStorage.setItem;

void (async () => {
  const [{ mount }, appMod, store] = await Promise.all([
    import('svelte'),
    import('./ui/App.svelte'),
    import('./lib/store'),
  ]);
  const host = document.createElement('div');
  host.id = 'hvaa-preview-host';
  document.body.append(host);
  mount(appMod.default, { target: host });
  store.panelOpen.set(true);
})();
