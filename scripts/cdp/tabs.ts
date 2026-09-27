// 全 tab 切换矩阵：逐个点击并校验 active 与内容签名。用法：npx tsx scripts/cdp/tabs.ts
import { pickPage, connect } from './common.js';

// [菜单名, 内容应包含的签名]
const CASES: [string, string][] = [
  ['主要选项', '攻击模式'],
  ['物品', 'Full-Cure'],
  ['Channel 技能', '先施放 Channel'],
  ['BUFF 技能', '施放顺序'],
  ['DEBUFF 技能', 'Imperil'],
  ['其他技能', '友情小马炮'],
  ['卷轴', 'Scroll of the Gods'],
  ['魔药', '自动使用魔药'],
  ['警报', 'Riddle'],
  ['攻击规则', '权重'],
  ['掉落监测', 'Credit'],
  ['数据记录', '总伤害'],
  ['关于', '运行日志'],
  ['反馈', '控制台日志'],
];

const cdp = await connect(await pickPage());
let pass = 0;
try {
  for (const [name, sig] of CASES) {
    await cdp.ev(
      `(()=>{[...document.querySelectorAll("#hvAABox .hvAATabmenu>button")].find(s=>s.textContent.trim()==="${name}")?.click();})()`,
    );
    await new Promise((r) => setTimeout(r, 350));
    const active = await cdp.ev<string | null>(
      'document.querySelector("#hvAABox .hvAATabmenu>button.active")?.textContent?.trim()',
    );
    const content = await cdp.ev<string>('document.querySelector("#hvAABox .hvAATab")?.textContent ?? ""');
    const ok = active === name && content.includes(sig);
    if (ok) pass++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  }
  console.log(`\n${pass}/${CASES.length} passed`);
} finally {
  cdp.close();
}
if (pass !== CASES.length) process.exitCode = 1;
