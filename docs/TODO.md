# 待办（注释-文档冲突复核挂起项）

- [ ] C5 `snapshot.ts:readSnapshot` 头注“唯一碰 DOM 的地方”与
      `docs/ARCHITECTURE.md`（唯一读成快照，他处仍有零散只读）冲突，
      复核成立。推荐：改为“唯一读成快照的地方”。
- [ ] C6 `combat/execute.ts:executeAction` 头注“唯一写 DOM 的地方，除面板外”与
      `docs/ARCHITECTURE.md` 触点表（`battle.ts` 写 battle_main/eventEnd/battleInfo）冲突，
      复核成立。推荐：以文档为准，注释加“决策动作写”限定。
