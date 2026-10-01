/**
 * 数据收集 v2（按实战数据重写，见 logs/battle-records-1.json）。
 * 数据源：每次战斗响应的 textlog 行（经 recorder 桥接），不再爬 DOM.
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 *
 * 本文件仅为 facade（静态重导出，保持 7 处调用方零改动）：
 * - stats/types.ts     类型＋工厂（emptyTurn/emptyTotals/newCur/bump）
 * - stats/parse.ts     纯函数：行文本 → 单轮统计，可单测（禁碰 store/kv）
 * - stats/lifecycle.ts 记录生命周期状态机＋落盘（唯一碰 kv/store 处）
 * - stats/queries.ts   查询＋CSV 导出（供 Usage/Drop 面板）
 */
export * from './stats/types';
export * from './stats/parse';
export * from './stats/lifecycle';
export * from './stats/queries';
