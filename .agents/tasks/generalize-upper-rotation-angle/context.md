# Task: 上旋最大角度算法通用化

## 背景

当前上旋最大角度算法以扫描展开和全局目标函数搜索为主，但默认路径包含 H1、H2、C5、DS05-like 等由 DS01～DS05 历史样本逐步形成的特征门控和定向修正。部分规则包含窄覆盖率区间、固定融合比例、固定加减速时间和目标角度带，存在历史样本准确但跨机台、跨配方或现场长数据误差较大的风险。

本任务计划逐步建立“特征追踪粗估 + 通用目标函数局部精调”的新路径：利用正反换向信号划分完整行程，从相邻标准化扫描剖面追踪角度变化并估计匀速角速度，再用短时端部加减速模型计算最大角度候选，最后由无样本定向规则的目标函数进行局部精调和一致性验证。

## 当前事实

- 上旋在 `0 ↔ θ_max` 间往返，单程约 6～8 分钟，`180° < θ_max < 360°`。
- 测厚仪约 30 秒完成一次扫描，相邻扫描预期产生约 19～25° 的上旋角变化。
- 上旋两端加减速时间较短，中间大部分行程近似匀速。
- `rotation_raw.motorFrequency` 当前未接入，不能作为可靠的实时速度来源。
- 换向信号可以作为每个积分行程的边界，但需要去抖、完整性和方向一致性检查。
- 膜厚扫描剖面随上旋变化只近似平移，且存在 `θ` 与 `θ+180°` 的观测等价性，特征追踪必须带搜索范围、连续性和置信度约束。
- 现有互相关实现缺少完整的逐位移归一化、亚像素峰值、时间戳角速度计算和可靠的峰值置信度，不能直接用于生产替换。

## 涉及文件

- `packages/AirRingServer/algorithms/upperRotation/upperRotation.config.ts`
- `packages/AirRingServer/algorithms/upperRotation/upperRotation.estimate.ts`
- `packages/AirRingServer/algorithms/upperRotation/upperRotation.ts`
- `packages/AirRingServer/algorithms/bubbleReconstruction/phaseEstimation/crossCorrelation.ts`
- `packages/AirRingServer/algorithms/buildTripSegment.ts`
- `packages/AirRingServer/algorithms/timeToAngle.ts`
- `packages/AirRingServer/types/index.ts`
- `packages/AirRingServer/algorithms/upperRotation/tests/`
- 可能新增的上旋特征追踪模块和诊断测试文件

## 约束

- 先隔离、影子运行和验证，再删除旧分支；每一步必须可回退。
- 不使用 DS 编号、历史目标角度带或为特定样本选择的融合权重作为通用规则。
- 质量不足或双估计器明显冲突时拒绝标定，不强制输出貌似合理的角度。
- 端部参数必须来自设备物理配置、速度信号或独立现场验证，不能按历史标签误差反推。
- 设备角度边界保持在合法搜索范围内，所有配置需要边界校验。
- 单次算法执行目标保持小于 100ms，CPU 密集计算继续运行在 Worker 中。
- 不修改设备连接或运动控制指令；如后续必须修改标定控制器逻辑分支，需先取得用户确认。
- 遵循最小 diff；不引入新的运行时依赖，除非另行评审和确认。
- 每次代码修改后主动运行与风险相称的最小相关测试集；阶段验收运行对应测试矩阵，完成阶段执行 lint 和 typecheck。

## 数据与验收集

### 2026-07-27 数据资产审计

| 数据 | 当前可用性 | 参考角度来源 | 可信度与用途 |
|------|------------|--------------|--------------|
| DS01～DS05 | 仓库内完整，含 thickness/upper/info JSON | `info.json` 仅保存角度数值，仓库中未找到测量方法、仪器或原始记录说明 | 已参与 H1/H2/C5/DS05-like 规则开发，只能作为开发回归集，不得作为独立验收集 |
| 模拟器 10 组 | 代码可运行，真值由 `upperRotation.maxAngle` 直接设定 | 模拟器配置真值，理论上可靠 | 当前使用不可追踪的 `Math.random()`，失败后无法重放；2026-07-27 运行 10/10 失败。应改为分布驱动的生成式测试，记录随机 seed 供失败重放，但不得固定角度样本集 |
| 2026-05-22 ModBus | 仓库外 `/Volumes/USER/Users/zane/Downloads/logs` 可读 | `295.946411°` 只见于长期上下文，未找到独立实测来源；现有测试仅断言输出落在宽范围 | 无标签现场诊断集，可用于行程完整性、稳定性、generic/tuned 差异和性能比较，不能计算准确度 |
| 2026-06-10 ADBox | 测试代码存在，但预期的两份原始日志当前路径均缺失 | `306.022472°` 只见于长期上下文，未找到独立实测来源 | 当前不可运行；找回日志后仍先按无标签现场诊断集处理 |
| 新现场标定数据 | 尚未建立 | 必须来自独立机械角度读数、PLC绝对位置或经确认的人工测量 | 作为调参集和冻结验收集；同一生产批次不得跨集合 |

### 当前数据分组

- **开发集**：DS01～DS05；用于复现历史行为、发现退化和开发诊断能力，但不得据此新增定向规则。
- **合成开发集**：分布驱动的随机模拟器数据；用于验证已知角度、速度、噪声、缺失和扫描方向场景。每次运行记录 seed，失败可按 seed 重放，但日常验证持续抽取新样本。
- **无标签现场诊断集**：2026-05-22；用于比较稳定性、执行时间、拒绝原因和路径差异，不计算绝对误差。
- **待恢复现场诊断集**：2026-06-10。
- **调参集**：当前为空，等待带独立角度真值的新现场数据。
- **冻结验收集**：当前为空；在建立前不得将新通用算法切换为生产默认或删除旧回退路径。

### 标签规则

- 历史算法输出不得作为新算法的真值标签。
- 只有具备独立测量来源、测量时间、机台/配方信息和可信度说明的角度可用于准确度验收。
- 无标签数据只能评价可用率、稳定性、一致性、性能和拒绝行为。

### 模拟器生成规则

- 不维护少量固定角度作为主要准确度验收集，避免算法再次针对有限样本优化。
- 从物理允许范围连续采样 `θmax`，同时随机化单程时间、端部加减速、扫描周期、噪声、缺失率、扫描方向和厚度特征。
- 每次测试输出随机 seed 和完整生成参数；失败时允许用该 seed 单独重放诊断，但修复后仍必须通过新的随机样本。
- 单次提交运行中等规模随机样本，阶段验收扩大样本量，并报告误差分布、最坏误差和拒绝率，而不是只断言若干固定点。
- 不允许根据某个失败 seed 新增角度区间、目标带或定向修正规则；修复必须对应可解释的通用模型或质量判断。

### 统一诊断格式与基线指标

单次估计通过 `UpperRotationEstimateDiagnostics` 记录：

- 状态与拒绝原因：`status`、`rejectReason`
- 策略与目标函数：`strategyProfile`、`objectiveMode`、`offsetMode`、`objectiveUsed`
- 数据规模：输入、完整、过滤后行程数及搜索点数
- 估计轨迹：`baseThetaDeg`、`finalThetaDeg`、`finalLoss`、`triggeredRules`
- 性能：`elapsedMs`

批量基线由单次诊断聚合得到：

- 有独立真值时：绝对误差中位数、P95、最大值和 `>10°` 严重错误率
- 无标签时：generic/tuned 差异、跨行程标准差、跳变次数和边界解比例
- 全部数据：成功率、拒绝率、拒绝原因分布、耗时中位数/P95/最大值
- 后续特征追踪接入后补充：正反向角度差、有效相位对数量和角速度离散度

显式影子对照通过 `compareUpperRotationStrategies` 执行：

- `production` 固定运行 `datasetTuned2026Q1`，迁移期间仍作为选择结果
- `shadow` 固定运行 `generic`，不影响生产选择
- 输出有符号/绝对角度差、两侧完整诊断、耗时差和是否可比较
- 原生产入口不会自动调用影子对照，避免默认增加双倍计算开销

## 相关测试

计划中的测试范围如下；单步迭代按改动选择最小相关测试，阶段验收运行完整矩阵：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"
pnpm exec vitest run algorithms/upperRotation/tests/simulator/*.test.ts
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.landscape.test.ts
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts
```

完成阶段还需要执行项目 lint 和 AirRingServer typecheck。

## 相关决策

- 见本任务 `decisions.md`。
- 历史 D-001～D-028 见 `.agents/memory/decisions.md`。
