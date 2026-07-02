# Task: 膜宽追踪与测厚仪运动控制

## 背景

当前测厚仪在实际设备上依赖机械限位（`LeftLimit`/`RightLimit`）或固定行程进行换向，导致膜外无效扫描行程过长，降低扫描效率并增加机械磨损。

Simulation（`packages/Simulation/mocks/thickness.mock.ts`）中已实现“运动出膜宽之后减速→缓冲→掉头”的运动模型，但后端实际控制逻辑中缺乏对应的主动控制策略，仿真与实际设备行为不一致。

本任务旨在：
1. 建立膜宽追踪能力（实时或准实时获取膜宽边界）
2. 将 Simulation 中的运动模型抽象为通用测厚仪运动控制器
3. 实现基于膜宽的测厚仪减速-掉头主动控制，使实际设备行为与仿真对齐

## 涉及文件

| 路径 | 说明 |
|------|------|
| `packages/Simulation/mocks/thickness.mock.ts` | 测厚仪仿真器，已有运动模型（含 bufferPulse/decelTime） |
| `packages/AirRingServer/connections/thickness/s7.ts` | 测厚仪 S7 连接层，提供 FWD/REV/STOP 控制信号读写 |
| `packages/AirRingServer/controllers/calibration.ts` | 标定控制器，可获取膜宽 `membraneWidth` |
| `packages/AirRingServer/algorithms/thickness.ts` | 测厚仪数据解析，`extractScanSegments` 检测换向/限位 |
| `packages/AirRingServer/utils/tracker.ts` | 测厚仪数据追踪，提取厚度分布 |
| `packages/core/types/index.ts` | `ThicknessDevice` 类型定义（含 HorizontalPulse/LeftLimit/RightLimit/SwapDirection 等） |
| `packages/AirRingServer/apis/thk.types.ts` | 旧 API 类型，含 `FilmWidth` |
| `apps/AirRingSys/src/components/frame-info.vue` | 前端膜宽显示 UI |
| `apps/AirRingSys/src/views/control/channels/charts.vue` | 前端图表，显示 `frameData.width` |

## 约束

1. **设备安全**：测厚仪为精密机械，频繁启停或急减速可能损坏电机/探头；任何控制指令必须带边界校验
2. **实时性**：S7 通信周期有限，控制指令发送频率不可过高，需避免 PLC 命令队列堆积
3. **向后兼容**：Simulation 现有行为不可被破坏，前端 UI 膜宽显示接口保持稳定
4. **标定依赖**：当前膜宽主要来自标定（`calibration.ts`），若膜宽变化需触发重新标定或采用自适应追踪
5. **TypeScript 严格模式**：所有新增代码必须通过类型检查，禁止使用 `as any`
6. **one-task-one-stream**：本任务需在独立分支/worktree 中执行，避免与当前 `feat/bubble-thickness-reconstruction` 冲突

## 相关测试

```bash
# 测厚仪模拟器测试
cd packages/Simulation
pnpm exec vitest run mocks/thickness.mock.test.ts

# 标定与厚度重建测试
cd packages/AirRingServer
pnpm exec vitest run algorithms/thickness.test.ts
pnpm exec vitest run controllers/calibration.logReplay.test.ts

# 全量类型检查
cd packages/AirRingServer
pnpm exec tsc --noEmit
```

## 相关决策

- `.agents/memory/decisions.md` 中 D-001~D-028 涉及上旋算法决策，需确认膜宽控制与上旋控制的交互边界
- 新增决策将记录于 `.agents/tasks/film-width-tracking/decisions.md`
