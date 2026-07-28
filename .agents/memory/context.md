# context.md — 长期上下文

- 2026-07-29：影子工况的速度、生产选中角度和膜宽分桶不得使用历史样本默认边界；边界由验收方显式提供，缺失值与范围外值必须分开统计。

- 2026-07-28：影子批次不得自动排序或去重；window ID 必须唯一且观测时间严格递增，重复、同刻或乱序表示采集完整性失败。

- 2026-07-28：无独立角度标签的影子批次只用于统计三路径接受率、拒绝原因、耗时与两两差值；路径间一致不得解释为准确度，且影子候选不得覆盖生产选择。

- 2026-07-28：通用离线角度编排必须按特征候选、expanded 目标、局部精调三层短路；任一层失败仅返回诊断，不回退到前层角度或边界值。

- 2026-07-28：Stage 6 到 Stage 7 的粗估适配使用多行程角度中位数；角度 MAD、正反向差、已观测趋势跨度和端部时间角度不确定度保持具名分量，不折算经验置信权重。

- 2026-07-28：`evaluateExpanded` 接入新通用精调路径前必须经过只读适配校验；只有 `y=NaN` 是合法缺测，非法行程参数、越界时间或无限数值不得依赖底层裁剪后继续估算。

- 2026-07-28：特征角度与通用目标函数细化结果的偏移必须按调用方显式容差检查；明显冲突时双方均不得作为最终值兜底。

- 2026-07-28：黄金分割细化必须以离散最佳点左右最近的有限 loss 点为括区间；缺少任一侧支撑时拒绝，不跨越无效目标区补点。

- 2026-07-28：特征约束的局部目标函数若在窗口任一边界取得最佳 loss，必须视为窗口覆盖不足并拒绝；不得静默接受或自动扩大为全局搜索。

- 2026-07-27：特征粗估的局部搜索半径按显式非负不确定度分量作最坏情况求和，并同时受全局角度边界、搜索步长和点数预算保护；不使用固定目标角度带。

- 2026-07-27：行程置信度不使用加权标量分数；相关度、重叠率、峰突出度和 Fisher 分离度分别汇总数量、中位数与最小值，并保留缺失/歧义计数。

- 2026-07-27：通用单行程候选必须同时具备完整去抖行程、方向一致的稳健速度聚合和可信端部时间；任一证据缺失均分层拒绝，不使用默认值补齐。

- 2026-07-27：方向采集的首尾片段不能证明完整；通用候选路径只把两个已去抖确认的换向边界之间视为完整行程，初始稳定方向仅用于建立状态。

- 2026-07-27：多行程角度中心采用中位数；时间趋势采用 Theil–Sen 成对斜率中位数，避免普通最小二乘被单个异常行程拉偏。所有接受容差继续由调用方显式提供。

- 2026-07-27 审计确认：上旋 S7 映射没有加减速时间字段；DS01～DS05 的 `motorFrequency` 全为 0，且实际单位/比例未确认。仿真中的 20 秒端部时间和 ADBox 扫描器加减速参数不能作为上旋生产端部时间。

> 只保留"代码未表达的信息"。代码已说明的内容不要重复。

## 项目类型

- **语言**：TypeScript 7.0.1-rc（typescript-go, 严格模式, 严格模式 + 严格 import attribute）
- **框架**：Electron 30 + Vue 3 + Vite 7
- **包管理**：pnpm monorepo（apps/ + packages/）
- **测试框架**：vitest

## 物理模型与核心约定

### 吹膜系统结构

| 模块       | 功能                       | 约束                                 |
| ---------- | -------------------------- | ------------------------------------ |
| **风环**   | N 个风道将熔融原料吹成膜泡 | 理想正圆柱体                         |
| **上旋**   | 将膜泡压平，往复旋转       | 180° < θ_max < 360°，单程约 6–8 分钟 |
| **测厚仪** | 采集压平后的双层薄膜厚度   | 往复扫描，30 秒/单程，有出界点       |
| **牵引辊** | 固定线速度收卷薄膜         | —                                    |

### 上旋运动模型

- **运动模式**：往返旋转运动（**不是单向连续旋转**），θ 在 0 ↔ θ_max 之间往返旋转，θ_max 通常约 300°
- **物理结构**：上旋是穿过膜泡圆心的压合辊，略长于膜泡直径，以膜泡圆心自转
- **180° 覆盖性**：上旋旋转 180° 即覆盖膜泡全周（因为上旋杆跨过膜泡直径，180° 后杆的朝向与初始朝向相同只是反转）
- **扫描角度约束**：180° < θ_max < 360°（实际 ~300°，其中 ~120° 为冗余覆盖），单程约 6–8 分钟
- **θ 与 θ+180° 等价性**：测量相同的膜泡经线对，仅前/后层标签互换
- **测量模型**：T(x) = η × (B(φ₁) + B(φ₂)), φ₁ = θ+90°+δ, φ₂ = θ+90°−δ, δ = (x/W)×180°
- **关键结论**：φ₁−φ₂ = 2δ, 仅在边缘(|x|=W/2)时分离角=180°，内点不满足 φ₂=φ₁+180°
- **不可简化为**：T(t) = f(θ(t)) + f(θ(t)+π)（旧模型，仅边缘成立）
- **梯形速度映射**：`trapezoidalPosition(progress, accelRatio)`（非纯线性）
- **默认加速比**：`accelRatio = min(20000ms, duration * 0.45) / duration`
- **行程端部**：两端加减速时间占比很少（约 20 秒），其余时间近似匀速
- **⚠️ 绝对角度基准待标定**：重建剖面的 bin[0] 与实测膜泡的 0° 物理位置不对齐，存在约 158° 的固定偏移。需要通过物理标定（如标记膜泡 0° 位置）来确定该偏移量，或使用 `autoScaleProfile` 前进行角度对齐
- **电机频率**：
  - 字段 `motorFrequency` 表示上旋旋转速度
  - 匀速运行阶段：`motorFrequency` 值保持为最大速度值
  - 加速/减速阶段：`motorFrequency` 在 0 ↔ 最大值之间线性变化
  - **⚠️ 当前数据未接入**：`rotation_raw.motorFrequency` 始终为 0（传感器数据未连接），不可用于速度估算
  - 方向变化由 `forwardRotation` / `reverseRotation` 字段推断（详见 `rotation_raw` 表结构）
  - **最大频率值待确认**（当前假设 30 Hz 仅作参考）

### 测厚数据特征

- 因测厚行程大于膜宽，数据中存在**出界点**（`y = NaN`）
- 历史样本文件（`data/01..05`）的 ProbeValue 是**原始光通量**，不是 μm
- `sysTick` 是 7-bit 硬件帧计数器（0-127），**不是时间戳**

## 设备连接

| 设备          | 协议     | 端口/地址            |
| ------------- | -------- | -------------------- |
| ADBox（测厚） | TCP      | 192.168.251.12:20021 |
| 上旋 PLC      | S7 (TCP) | 192.168.2.10         |
| OPC UA 服务器 | OPC UA   | 见配置               |

## 上旋算法入口

- **主函数**：`estimateThetaMaxWithPhaseCorrection(tripSegments, options)`
- **位置**：`packages/AirRingServer/algorithms/upperRotation/upperRotation.ts`
- **当前流程**：

1.  验证输入和搜索范围
2.  过滤不完整片段（`duration <= 0`）
3.  过滤部分首尾片段（使用时长阈值）
4.  运行扫描展开路径（`estimateWithScannerExpansion`）
5.  若失败，回退至脉冲展开路径（`estimateWithPulseExpansion`）

## 实时性约束

- 单次算法执行必须 < 100ms（已迁移到 Worker 线程）
- ADBox 每 1ms 推送一帧厚度数据
- 主进程（Electron）不能阻塞事件循环（已通过 Worker 解决）
- `validThickness[]` 上限 2,000,000 条（约 33 分钟 1ms 数据）
- `allRawProbeValues[]` 上限 50,000 条

## 性能优化里程碑

| 时间       | 优化                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-06-11 | 修复百万级数据栈溢出；flipped/expanded 缓存；searchBest 去重缓存；索引 for 循环；惰性 pulseCoverageSignature |
| 2026-06-11 | 将算法迁移到 Worker 线程，添加互斥锁保护                                                                     |
| 2026-06-11 | validThickness 上限 200k→2M，修复 6-10 数据截断                                                              |

## 上旋估算质量保护

- 2026-07-26：恒定厚度或无 loss 区分度的数据返回 `null`，不再产生伪 180° 结果。
- 梯形运动映射要求 `accelRatio < 0.5`；实现对异常输入防御性限制到 `0.49`。
- `deltaRange.step` 控制粗搜索与小于 0.1° 时的精搜索步长。
- 不完整片段阈值以时长上四分位数为基准，过滤后不足两段时由估算流程自然返回 `null`，不再恢复已过滤片段。

## 验收数据集

| 数据集           | 期望值      | 状态 |
| ---------------- | ----------- | ---- |
| DS01             | 335.6°      | ✓    |
| DS02             | 320.2°      | ✓    |
| DS03             | 333.5°      | ✓    |
| DS04             | 320.5°      | ✓    |
| DS05             | 321.8°      | ✓    |
| 5-22 ModBus 日志 | 295.946411° | —    |
| 6-10 ADBox 日志  | 306.022472° | —    |

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式运行主应用
cd apps/AirRingSys
pnpm dev

# 构建应用
cd apps/AirRingSys
pnpm build

# 运行 lint（oxlint + oxlint-tsgolint）
pnpm lint

# 运行 typecheck（TS 7.0.1-rc）
pnpm exec tsc --noEmit -p apps/AirRingSys/tsconfig.json
pnpm exec tsc --noEmit -p apps/AirRingSys/tsconfig.node.json
pnpm exec tsc --noEmit -p packages/AirRingServer/tsconfig.json
pnpm exec tsc --noEmit -p packages/Simulation/tsconfig.json

# 运行上旋测试（全量）
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts

# 仅真实数据集
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"

# 仅模拟器
pnpm exec vitest run algorithms/upperRotation/tests/simulator/*.test.ts

# 诊断测试
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.landscape.test.ts

# 运行仿真服务器
cd packages/Simulation
pnpm start
```

## 重要约束（代码未表达）

- 代码修改后主动执行与风险相称的相关测试；单步迭代运行最小相关测试集，阶段验收运行对应测试矩阵
- 不要手动修复 lint 问题（oxlint 是类型感知 linter, 真实 type-safety 警告请保留为 warning）
- `.instructions/` 目录是历史遗留，已迁移到 `.agents/`
- `.github/copilot-instructions.md` 已迁移到 `.agents/guide/`
