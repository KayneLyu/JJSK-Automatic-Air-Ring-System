# Plan: 膜泡原始厚度改为算法重建的 0-360° 单层厚度

## 目标

替换当前「X 光 AD → 双层厚度」的实时折线图，改为：

- 由后端 `reconstructBubbleThickness` 算法重建膜泡 0-360° 圆周单层厚度 profile
- x 轴：膜泡圆周角度 0-360°（按 bin 中心）
- y 轴：单层膜厚
- 在线：RingBuffer + 边沿实时
- **离线：SQLite 历史数据回放**
- 周期拉取（每 2s）刷新图表

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `apps/AirRingSys/electron/dataPipeline.ts` | 修改：拆 live/historical 两路，复用 buildProfile |
| `apps/AirRingSys/electron/adbox.ts` | 修改：handler 透传 startMs/endMs |
| `apps/AirRingSys/src/types/ipc.d.ts` | 修改：参数可选 startMs/endMs |
| `apps/AirRingSys/src/views/settings/rack/BubbleRawThickness.vue` | 修改：听 adbox-status 切换数据源；离线默认 15min 窗口 |
| `.agents/scripts/outputs/plan-bubble-raw-thickness-tab.md` | 修改（本文件） |

## 数据流

```
[Live 模式]
ADBox → receiveThickness → thicknessRing
S7 PLC → receiveRotation → rotationRing → 边沿检测 → cycle 状态
                                              ↓
                                  getBubbleProfile(live)
                                              ↓
                                    buildProfile + reconstructBubbleThickness

[Historical 模式]
SQLite.thickness_raw(startMs, endMs)
SQLite.rotation_raw(startMs, endMs) → forwardDirChange/reverseDirChange 边沿
                                              ↓
                                  findCycleFromHistory
                                              ↓
                                  getBubbleProfile(startMs, endMs)
                                              ↓
                                    buildProfile + reconstructBubbleThickness
```

## IPC `bubble-reconstruct` 参数

```ts
{
  membraneWidthMm, thetaMaxDeg, mmPerPulse,
  numBins?, processDeformationFactor?,
  startMs?, endMs?    // ← 新增；都传 = 离线历史模式
}
```

## Historical 模式 cycle 状态

- 查询 `rotation_raw` 在 `[startMs, endMs]` 区间
- 收集 `forwardDirChange=1` / `reverseDirChange=1` 事件
- 最后一个 change 事件作为 `cycleStartTs` + `cycleDirection`
- `cycleDurationMs`：倒序找相邻同向 change 的时间差（找不到用默认 7 分钟）

## 离线时间窗

后端用 `useLatestWindowMs` 自动锚定 SQLite 最新时间戳为 `endMs`，往前推 N 毫秒；前端不传 `startMs/endMs`。
前端只传 `useLatestWindowMs: HISTORICAL_WINDOW_MS`。

## 厚度单位：AD → μm

**问题**：原实现直接用 `push.ad0`（AD 原始值，0-65535）作为 `MeasurementTriple.thickness` 输入，算法内部 `b[k] = thickness / processFactor`，输出仍是 AD 同量级（11000-26000），不是用户期望的 ~90μm 单层膜厚。

**修复**：
- data pipeline 内置 `calcThickness`（与 `apps/AirRingSys/src/views/settings/rack/utiles.ts:241` 保持一致，注释标注来源）
- 前端传 `airAD`（number）、`gain`（number）参数
- data pipeline 在构造 triple 前：`thickness = calcThickness(item.ad, { airAD, gain })`
- raw 模式 `processDeformationFactor = 1.0`（不做形变补偿）

## 根因（坍塌到 0μm）

### 类型 A：真·无数据
- cycle 状态范围错位：`findCycleFromHistory` 用**最后一次方向变化**当 cycle 起点，但 PLC 可能刚换向 30 秒，当前 cycle 还在中段
- 实际喂算法的数据**远不到 1 个完整 cycle**（7 分钟）
- θ_max=300° → 实际角度范围 ~21° / binWidth=7.5° = **~3 个 bin 有数据**
- 剩下 45 个 bin = 0（无数据）

### 类型 B：假·clamp（已修，但视觉上和 A 一样）
- 已被算法内 `profile[i] = max(0, profile[i])` 修掉，不会出负值
- 但产生的 0 跟类型 A 视觉上无法区分

### 修复
1. **`findCycleFromHistory` 改用最后一个完整 cycle 作起点**（`last.ts - cycleDurationMs`）—— 历史窗口里其实至少有 1 个完整上旋行程，别再扔
2. **放开 progress 的 clamp**：`progress = elapsed / cycleDur`（不 clamp 到 1），让 angle 能跨 cycle 累积，normalizeAngle 自会 wrap 到 0-360°
3. **UI 标注每个 bin 的 coverage**——区分两类 0
