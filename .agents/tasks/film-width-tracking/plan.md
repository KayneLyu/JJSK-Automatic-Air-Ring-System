# Plan: 膜宽追踪与测厚仪运动控制

> 经过三轮评审已确定方案。本方案待用户审阅后按指示执行。

---

## 问题定义

当前实际设备上测厚仪在膜外无效行程过长，原因：
- 测厚仪依赖机械限位（`LeftLimit`/`RightLimit`）换向
- 无基于膜宽的主动减速-掉头控制
- Simulation 已有合理运动模型（`bufferPulse` + `decelTime`），但后端实际控制逻辑缺失

目标：实现测厚仪在运动出膜宽之后开始减速然后掉头，减少膜外无效行程。

---

## 方案演进

| 阶段 | 结论 |
|------|------|
| 初始评审 | 提出方案 A~D，推荐方案 D（通用运动控制器 + 标定膜宽） |
| 第二轮评审 | 否决方案 A/D：标定膜宽需要测厚仪先跑 10 趟才能标定 → **死锁** |
| 第三轮评审 | 确认方案 E，去掉软判定（硬判定已足够可靠），补充安全保护 |
| 第四轮评审 | 容错窗口从固定1秒改为可配置参数（默认200ms），膜外行程从~90mm降至~30mm |
| ✓ 最终确定 | **方案 E：基于 `ProbeValue` 在线检测的测厚仪出膜减速控制** |

---

## 方案 E：核心思路

### 物理基础（已验证）

从现有 `calcThickness`（`algorithms/thickness.ts:188-196`）和 `detectBimodalThreshold`（`buildTripSegment.ts`）确认：

```
膜内 AD 值：30000–40000（低光通量）→ 厚度正常
膜外 AD 值：接近 airAD（50300）→ 厚度 = 0
```

膜内/膜外 AD 值差异达 **10000+**，几乎不重叠，信噪比极高。

### 出膜检测：纯硬判定

| 检测条件 | 可靠性 |
|---------|--------|
| 连续 3 个点 `calcThickness(ProbeValue, {airAD}) === 0` | 绝对（物理定律） |

> **为何不保留软判定**：膜内/膜外 AD 差异为数量级而非百分比级别，单点 `ProbeValue >= airAD` 已是零误报的物理事实。连续 3 点确认 + 容错窗口足以覆盖膜边缘过渡区，额外的滑动窗口跳变检测不参与控制决策，仅为实现复杂度。

### 膜外行程分析

基于现有仿真参数（`THICKNESS_UNIT_PULSE_DIS=0.1mm/pulse`，`maxSpeed=4m/min=66.7mm/s`，采样周期=30ms）：

```
单侧膜外行程 = 检测延迟 + 容错窗口 + 减速距

检测延迟: 3点 × 30ms × 0.0667mm/ms  = 6mm  （不可压缩，需连续3点确认）
减速距:   仿真decelPulse 166.8pulse    = 17mm （机械惯性，取决于PLC是否支持调速）
容错窗口: toleranceMs × 0.0667mm/ms   = 可变
```

| 容错窗口 | 单侧膜外行程 | 噪声容错 | 节拍效率 |
|---------|------------|---------|---------|
| 1000ms（原方案） | **~90mm** | 极高 | 最低 |
| 200ms（**推荐默认**） | **~36mm** | 高（连续3点+额外容错双重保护） | 高 |
| 100ms | **~30mm** | 中 | 最高 |
| 0ms | **~23mm** | 无（仅依赖连续3点） | 最高 |

**选择**：容错窗口设为**可配置参数**，默认值 **200ms**（约 13mm 容错行程）。3 点硬判定 + 200ms 容错构成双重保护：噪声需要连续 3×30ms + 额外 200ms 才能误触发减速，概率极低。

> 注：若 PLC 仅支持 STOP/GO（无调速），减速距取决于机械惯性滑行距离，需在实际设备上标定。以上减速距基于仿真模型估算。

### 约束

用户指定三个约束：

1. **优先判断膜厚度为0**：检测逻辑只有硬判定，无其他分支
2. **可配置容错窗口（默认 200ms）**：检测到"已出膜"后，等待容错窗口再触发减速；窗口内连续3点厚度>0则取消
3. **同时标记左右两边出界的 `HorizontalPulse`**：检测到出膜时记录当前脉冲值，左右分别标记，用于后续膜宽推算和调试参考

---

## 控制状态机

```
                                    ┌──────────────────┐
                                    │     UNKNOWN       │
                                    │ (初始/复位后状态)   │
                                    └──────┬───────────┘
                                           │ 厚度>0 连续3点
                                           ▼
                              ┌───────────────────────┐
                    ┌────────►│     IN_MEMBRANE       │◄──────────────────┐
                    │         │    (膜内匀速扫描)       │                    │
                    │         └───────────┬───────────┘                    │
                    │                     │ 厚度=0 连续3点                   │
                    │                     │ ① 记录出界pulse                │
                    │                     │ ② 启动1秒容错计时              │
│         ┌───────────▼───────────┐                    │
│         │     TOLERATING        │                    │
│         │   (容错窗口,默认200ms)  │───────────────────►│
                    │         └───────────┬───────────┘                    │
                    │                     │                                 │
                    │      ┌──────────────┼──────────────┐                  │
                    │      │   1秒到期    │ 厚度>0 连续3点  │  限位触发        │
                    │      │  (未回膜内)   │  (回膜内)      │                 │
                    │      ▼              └──────────────►│                 │
                    │ ┌──────────────┐                    │                 │
                    │ │ DECELERATING │                    │                 │
                    │ │  (发送STOP)   │                    │                 │
                    │ └──────┬───────┘                    │                 │
                    │        │                            │                 │
                    │  ┌─────┼─────┐                      │                 │
                    │  │脉冲停止   │ 5秒超时/限位触发        │                 │
                    │  │≥200ms    │                       │                 │
                    │  ▼          ▼                       │                 │
                    │ ┌────────┬──────────┐               │                 │
                    │ │TURNING │ 告警+     │               │                 │
                    │ │(发REV) │ 被动模式   │               │                 │
                    │ └───┬────┴──────────┘               │                 │
                    │     │                               │                 │
                    │ ┌───┼───┐                           │                 │
                    │ │方向验证│ N秒超时/限位触发             │                 │
                    │ │通过    │                           │                 │
                    │ │+厚度>0 │                           │                 │
                    │ │连续2点  │                           │                 │
                    │ ▼       ▼                           │                 │
                    │ ┌────────┬──────────┐               │                 │
                    └─┤正常恢复│ 重发REV/  │               │                 │
                      │        │ 告警     │               │                 │
                      └────────┴──────────┘               │                 │
                                                          │                 │
                    ┌─────────────────────────────────────┘                 │
                    │  LeftLimit / RightLimit 触发（任意状态下）              │
                    ▼                                                       │
          ┌──────────────────┐                                             │
          │ EMERGENCY_STOP    │                                             │
          │ (禁止一切主动控制) │                                             │
          └────────┬─────────┘                                             │
                   │ 手动复位                                                │
                   └──────────────────────────────────────────────────────┘
```

**状态转换详解**：

| 转换 | 触发条件 | 动作 | 安全保护 |
|------|---------|------|---------|
| UNKNOWN → IN_MEMBRANE | 厚度>0 连续≥3点 | 恢复正常扫描 | — |
| IN_MEMBRANE → TOLERATING | 厚度=0 连续≥3点 | ① 记录出界 pulse ② 启动容错计时 | — |
| TOLERATING → IN_MEMBRANE | 厚度>0 连续≥3点 | 取消计时器（对称回退） | 连续3点回退，避免单点噪声震荡 |
| TOLERATING → DECELERATING | 容错到期，未回膜内 | 发送 STOP | — |
| DECELERATING → TURNING | 脉冲停止变化 ≥200ms | 发送 REV | 必须确认已停止（防电机堵转） |
| DECELERATING → 告警 | 5秒超时仍未停止 | 日志告警，回退被动模式 | 超时保护，防卡死 |
| TURNING → IN_MEMBRANE | ① 脉冲沿预期方向变化 ② 厚度>0 连续≥2点 | 恢复正常扫描（反向） | 方向验证（防 REV 未生效），连续2点确认 |
| TURNING → 告警 | N秒超时未验证方向 | 重发 REV + 告警 | 超时保护 |
| 任意状态 → EMERGENCY_STOP | LeftLimit/RightLimit 为 true | 禁止一切主动控制指令 | 硬件限位最高优先级 |
| EMERGENCY_STOP → UNKNOWN | 手动复位 | 回到初始状态 | 需人工确认 |

**出界脉冲标记规则**：

| `MotionDirection` | 标记含义 | 脉冲变量 |
|-------------------|---------|---------|
| `true`（正向/向右） | 右边出界点 | `rightBoundaryPulse` |
| `false`（反向/向左） | 左边出界点 | `leftBoundaryPulse` |

**后续用途**：
- 估算膜宽：`|rightBoundaryPulse - leftBoundaryPulse| × THICKNESS_UNIT_PULSE_DIS`（mm）
- 对标限位：与 LeftLimit/RightLimit 触发时的脉冲做比较，优化 buffer 余量
- 反馈给 `thicknessReversal` 的 `membraneWidthMm` 参数（后续优化）

---

## 状态转换日志

每次状态转换必须输出结构化日志，格式：

```
[ScannerMotion] <timestamp> <oldState> → <newState> reason="<reason>" pulse=<pulse> thickness=<μm> detail="<附加信息>"
```

示例：

```
[ScannerMotion] 2026-07-02 14:30:00.123 IN_MEMBRANE → TOLERATING reason="out-of-bounds" pulse=45210 thickness=0.0 side=right toleranceMs=200
[ScannerMotion] 2026-07-02 14:30:00.325 TOLERATING → DECELERATING reason="tolerance-expired" pulse=45230 thickness=0.0 elapsedMs=202
[ScannerMotion] 2026-07-02 14:30:02.456 DECELERATING → TURNING reason="stopped" pulse=45500 thickness=0.0 stopDurationMs=220
[ScannerMotion] 2026-07-02 14:30:02.457 TURNING → IN_MEMBRANE reason="direction-verified+in-membrane" pulse=45400 thickness=98.5
```

---

## 实施步骤

### 步骤 1：实现出膜检测算法

**文件**：`packages/AirRingServer/algorithms/outOfBoundsDetector.ts`

```typescript
outOfBoundsDetector(options: { airAD: number })
  → { next(probeValue: number, horizontalPulse: number, motionDirection: boolean) → OutOfBoundsResult }

OutOfBoundsResult = {
  inMembrane: boolean,             // true = 膜内, false = 膜外
  confirmedOutOfBounds: boolean,   // 连续3点厚度=0 → true（触发状态转换用）
  confirmedInMembrane: boolean,    // 连续3点厚度>0 → true（对称回退用）
  boundaryPulse?: number,          // 确认出界时刻的脉冲值
  boundarySide?: 'left' | 'right'  // 由 motionDirection 判定
}
```

**核心逻辑**：

```typescript
const next = (probeValue: number, pulse: number, direction: boolean): OutOfBoundsResult => {
  const thickness = calcThickness(probeValue, { airAD })
  const outOfBounds = thickness === 0

  // 连续计数
  if (outOfBounds) {
    outCount++
    inCount = 0
  } else {
    inCount++
    outCount = 0
  }

  const confirmedOut = outCount >= 3
  const confirmedIn = inCount >= 3

  return {
    inMembrane: !outOfBounds,
    confirmedOutOfBounds: confirmedOut,
    confirmedInMembrane: confirmedIn,
    // 仅在首次确认出界时记录 pulse（避免重复覆盖）
    boundaryPulse: confirmedOut && outCount === 3 ? pulse : undefined,
    boundarySide: direction ? 'right' : 'left',
  }
}
```

**单元测试**：`packages/AirRingServer/algorithms/outOfBoundsDetector.test.ts`

### 步骤 2：实现状态机

**文件**：`packages/AirRingServer/algorithms/scannerStateMachine.ts`

```typescript
type ScannerState =
  | 'UNKNOWN'
  | 'IN_MEMBRANE'
  | 'TOLERATING'
  | 'DECELERATING'
  | 'TURNING'
  | 'EMERGENCY_STOP'

interface BoundaryPulseMap {
  left: number | null
  right: number | null
}

interface StateMachineResult {
  state: ScannerState
  action: 'NONE' | 'STOP' | 'REV' | 'FWD' | 'ALERT'
  log: string | null           // 状态转换时输出日志
  boundaryPulses: BoundaryPulseMap
}

const scannerStateMachine = (options: {
  toleranceMs: number          // 容错窗口（默认 200）
  stopConfirmMs: number        // 停止确认窗口（默认 200）
  decelTimeoutMs: number       // 减速超时（默认 5000）
  turnTimeoutMs: number        // 换向超时（默认 3000）
}) => { /* ... */ }
```

**关键安全规则**：

| 规则 | 实现 |
|------|------|
| STOP → REV 需确认已停止 | `decelElapsed >= stopConfirmMs` 且 `pulseChange < 5` |
| 对称回退 | `confirmedInMembrane`（连续3点）才退回 IN_MEMBRANE |
| 限位急停 | 任意状态收到 LeftLimit/RightLimit → EMERGENCY_STOP |
| 超时保护 | DECELERATING 5秒超时 / TURNING 3秒超时 → 告警 |

**单元测试**：`packages/AirRingServer/algorithms/scannerStateMachine.test.ts`（覆盖每个状态转换路径 + 超时场景 + 限位急停场景）

### 步骤 3：实现后端运动控制策略

**文件**：`packages/AirRingServer/controllers/scannerMotionControl.ts`

```
输入：ThicknessData 流 + airAD 配置
输出：{ action: 'NONE' | 'STOP' | 'FWD' | 'REV' | 'ALERT' } 建议
```

**安全约束**：
- 指令发送间隔 ≥ 100ms，避免 PLC 队列堆积
- `LeftLimit`/`RightLimit` 无条件转入 `EMERGENCY_STOP`，优先级最高
- 紧急停止状态下不发送任何主动控制指令
- 告警状态（超时/REV失败）需人工介入

**与 S7 连接层交互**：
- `EMERGENCY_STOP` → 发送 `{ STOP: true }`
- `DECELERATING` → 发送 `{ STOP: true }`
- `TURNING` → 发送 `{ REV: true }`（或 `{ FWD: true }`，按方向）
- 其他状态 → 不主动发送指令

### 步骤 4：改造 Simulation 对齐实际控制

**影响面分析**（先行）：

| 受影响模块 | 当前行为 | 改造影响 | 风险 |
|-----------|---------|---------|------|
| `mockThickness.ts` | 膜外 `ProbeValue = 0` | 改为膜外 `ProbeValue = airAD` | 低：仅改变膜外值，膜内不变 |
| `extractScanSegments` | 依赖 SwapDirection/LeftLimit 分段 | 不变 | 无：分段逻辑不依赖 ProbeValue |
| `findMutation` | 滑动窗口均值检测突变 | 窗口均值可能在膜内/膜外界线跳变 | 低：windowSize 较大（几百点），单边界跳变影响有限 |
| `Tracker.extractThicknessProfile` | 过滤 `ProbeValue` 和 `RollSpeedSignal` | 膜外 ProbeValue 从 0 变 airAD → 过滤逻辑需微调 | 低：膜外点本应被过滤 |
| `buildTripSegment` / `detectBimodalThreshold` | 在原始 AD 值域检测双峰 | 不变（Simulation 现输出真实值域） | 无 |

**改造内容**：
- [ ] 将 `thickness.mock.ts` 膜外 `ProbeValue` 改为 `airAD`（而非 0）
- [ ] 将 `mockThickness` 的运动阶段与 `scannerStateMachine` 状态对齐
- [ ] 膜外减速阶段：ProbeValue 从正常值平滑过渡到 airAD（模拟真实的 X 光衰减过程）
- [ ] 运行 `mocks/thickness.mock.test.ts` 确认无回归

### 步骤 5：集成与端到端验证

- [ ] 在 AirRingServer 主流程（`electron.ts` 或对应入口）中集成 `scannerMotionControl`
- [ ] 端到端测试：Simulation → 检测 → 控制指令 → 验证

**测试用例矩阵**：

| # | 场景 | 输入序列 | 期望路径 |
|---|------|---------|---------|
| 1 | 正常出膜→减速→换向 | 膜内正常厚度 → 连续3点厚度=0 | UNKNOWN→IN_MEMBRANE→TOLERATING(1s)→DECELERATING→TURNING→IN_MEMBRANE |
| 2 | 容错取消 | TOLERATING 期间（180ms）恢复厚度>0 连续3点 | TOLERATING → IN_MEMBRANE（不发送 STOP） |
| 3 | 膜边缘震荡 | 反复出膜→回膜→出膜（<容错窗口间隔） | 连续3点回退 + 连续3点出膜，不反复触发 DECELERATING |
| 4 | 冷启动在膜外 | 首个点厚度=0 | UNKNOWN → 保持 UNKNOWN，等待运动或限位触发 |
| 5 | 减速超时 | DECELERATING 5s 脉冲仍在变 | 告警 + 回退被动模式 |
| 6 | REV 未生效 | TURNING 3s 脉冲未反向 | 重发 REV + 告警 |
| 7 | 限位急停（膜内） | IN_MEMBRANE 期间 LeftLimit=true | 立即 EMERGENCY_STOP |
| 8 | 限位急停（换向中） | DECELERATING 期间 RightLimit=true | 立即 EMERGENCY_STOP |
| 9 | 手动复位 | EMERGENCY_STOP → 复位信号 | EMERGENCY_STOP → UNKNOWN |

- [ ] 类型检查 + lint：
  ```bash
  cd packages/AirRingServer && pnpm exec tsc --noEmit
  ```

---

## 预期产出

| 文件 | 说明 |
|------|------|
| `algorithms/outOfBoundsDetector.ts` | 出膜检测算法（纯硬判定 + 连续确认） |
| `algorithms/outOfBoundsDetector.test.ts` | 检测算法单元测试 |
| `algorithms/scannerStateMachine.ts` | 完整状态机（6状态 + 安全保护 + 超时） |
| `algorithms/scannerStateMachine.test.ts` | 状态机单元测试（覆盖所有状态路径） |
| `controllers/scannerMotionControl.ts` | 后端运动控制策略（连接 S7 层） |
| `mocks/thickness.mock.ts`（更新） | 膜外 ProbeValue 改为 airAD，对齐实际设备 |

---

## 验收标准

- [ ] 硬判定（厚度=0）在连续 3 个采样点内（约90ms）确认出膜
- [ ] 容错窗口可配置（默认 200ms）：出膜后等容错窗口到期才发减速；窗口内连续3点厚度>0 则取消
- [ ] 对称回退：TOLERATING→IN_MEMBRANE 需要连续3点厚度>0（与进入条件对称）
- [ ] STOP→REV 安全间隙：DECELERATING 确认脉冲停止 ≥200ms 后才发 REV
- [ ] 超时保护：DECELERATING 5秒 / TURNING 3秒超时后告警
- [ ] 方向验证：TURNING 状态检查脉冲是否沿预期方向运动
- [ ] 出界脉冲记录正确：向右出膜标记 `right`，向左出膜标记 `left`
- [ ] 限位急停：任何状态下 `LeftLimit`/`RightLimit` 触发 → `EMERGENCY_STOP`，禁止一切主动控制
- [ ] 状态转换日志：每次转换输出结构化日志（时间戳 + 旧状态→新状态 + 触发条件 + pulse + 厚度）
- [ ] Simulation 重构后 `thickness.mock.test.ts` 无回归
- [ ] AirRingServer 类型检查零错误
- [ ] 所有新增代码无 `as any`、无空 catch、无未处理 Promise

---

## 风险与待确认项

1. **PLC 控制能力**：实际测厚仪 PLC 是否支持调速（变频率），还是仅支持 FWD/REV/STOP 开关量？仅开关量时"减速"近似为提前 STOP。
2. **airAD 稳定性**：生产过程中 airAD 是否变化？若变化较大需定期更新或自动采样校准。
3. **DECELERATING 脉冲停止判定阈值**：当前假设"脉冲变化 < 5pulses / 200ms"为停止，需根据实际设备惯性确认。
4. **任务隔离**：当前主 worktree 处于 `feat/bubble-thickness-reconstruction` 分支，本任务需在独立分支（`feat/film-width-tracking`）+ 独立 worktree（`../wt-film-width-tracking`）中执行。

---

> **下一步动作**：等待用户审阅本方案，确认后按步骤 1→5 执行。
