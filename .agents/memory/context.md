# context.md — 长期上下文

> 只保留"代码未表达的信息"。代码已说明的内容不要重复。

## 项目类型

- **语言**：TypeScript 7.0.1-rc（typescript-go, 严格模式, 严格模式 + 严格 import attribute）
- **框架**：Electron 30 + Vue 3 + Vite 7
- **包管理**：pnpm monorepo（apps/ + packages/）
- **测试框架**：vitest

## 物理模型与核心约定

### 吹膜系统结构

| 模块 | 功能 | 约束 |
|------|------|------|
| **风环** | N 个风道将熔融原料吹成膜泡 | 理想正圆柱体 |
| **上旋** | 将膜泡压平，往复旋转 | 180° < θ_max < 360°，单程约 6–8 分钟 |
| **测厚仪** | 采集压平后的双层薄膜厚度 | 往复扫描，30 秒/单程，有出界点 |
| **牵引辊** | 固定线速度收卷薄膜 | — |

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

| 设备 | 协议 | 端口/地址 |
|------|------|----------|
| ADBox（测厚） | TCP | 192.168.251.12:20021 |
| 上旋 PLC | S7 (TCP) | 192.168.2.10 |
| OPC UA 服务器 | OPC UA | 见配置 |

## 上旋算法入口

- **主函数**：`estimateThetaMaxWithPhaseCorrection(tripSegments, options)`
- **位置**：`packages/AirRingServer/algorithms/upperRotation/upperRotation.ts`
- **当前流程**：
 1. 验证输入和搜索范围
 2. 过滤不完整片段（`duration <= 0`）
 3. 过滤部分首尾片段（使用时长阈值）
 4. 运行扫描展开路径（`estimateWithScannerExpansion`）
 5. 若失败，回退至脉冲展开路径（`estimateWithPulseExpansion`）

## 实时性约束

- 单次算法执行必须 < 100ms（已迁移到 Worker 线程）
- ADBox 每 1ms 推送一帧厚度数据
- 主进程（Electron）不能阻塞事件循环（已通过 Worker 解决）
- `validThickness[]` 上限 2,000,000 条（约 33 分钟 1ms 数据）
- `allRawProbeValues[]` 上限 50,000 条

## 性能优化里程碑

| 时间 | 优化 |
|------|------|
| 2026-06-11 | 修复百万级数据栈溢出；flipped/expanded 缓存；searchBest 去重缓存；索引 for 循环；惰性 pulseCoverageSignature |
| 2026-06-11 | 将算法迁移到 Worker 线程，添加互斥锁保护 |
| 2026-06-11 | validThickness 上限 200k→2M，修复 6-10 数据截断 |

## 上旋估算质量保护

- 2026-07-26：恒定厚度或无 loss 区分度的数据返回 `null`，不再产生伪 180° 结果。
- 梯形运动映射要求 `accelRatio < 0.5`；实现对异常输入防御性限制到 `0.49`。
- `deltaRange.step` 控制粗搜索与小于 0.1° 时的精搜索步长。
- 不完整片段阈值以时长上四分位数为基准，过滤后不足两段时由估算流程自然返回 `null`，不再恢复已过滤片段。

## 验收数据集

| 数据集 | 期望值 | 状态 |
|--------|--------|------|
| DS01 | 335.6° | ✓ |
| DS02 | 320.2° | ✓ |
| DS03 | 333.5° | ✓ |
| DS04 | 320.5° | ✓ |
| DS05 | 321.8° | ✓ |
| 5-22 ModBus 日志 | 295.946411° | — |
| 6-10 ADBox 日志 | 306.022472° | — |

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

- 不要自动执行测试（除非用户明确要求）
- 不要手动修复 lint 问题（oxlint 是类型感知 linter, 真实 type-safety 警告请保留为 warning）
- `.instructions/` 目录是历史遗留，已迁移到 `.agents/`
- `.github/copilot-instructions.md` 已迁移到 `.agents/guide/`
