/**
 * 数据收集 v3（单场全量行存 IDB battles/cur 表，总数读时求和）。
 * 数据源：每次战斗响应的 textlog 行（经 recorder 桥接），不再爬 DOM.
 * 分段由战斗引擎驱动：一局＝从 Initializing 到终局（多轮），类型来自引擎。
 *
 * 本文件仅为 facade（静态重导出，保持调用方零改动）：
 * - stats/types.ts     类型＋工厂（emptyTurn/emptyTotals/newCur/bump）
 * - stats/parse.ts     纯函数：行文本 → 单轮统计，可单测（禁碰 store/kv/IDB）
 * - stats/lifecycle.ts 写路径（异步，只碰 cur 表；纯 helper 可单测）
 * - stats/queries.ts   读路径（deriveTotals 纯求和＋IDB 异步读＋CSV 导出，供 Usage 面板）
 */
export * from './stats/types';
export * from './stats/parse';
export * from './stats/lifecycle';
export * from './stats/queries';
