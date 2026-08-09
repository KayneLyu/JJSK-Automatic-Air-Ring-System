# context.md — 长期上下文

- 2026-08-02：Rust 性能迁移阶段 4 通过。用户授权后，Calibration Bridge 改为持久单 Worker + FIFO，实时入口忙时仍跳过、Promise 入口排队；正常响应不再 `terminate()`，历史嵌套 Worker 使用 shutdown/ack 自然退出。正式 120 请求加 300 请求长跑全部成功，每进程只创建 1 个 Worker，事件循环 P95 26.755ms、CPU 约 1.136 核，未再复现 `0xC0000005`。允许显式开关下扩大串行 shadow 观测，但默认关闭、禁止并行 Native Worker和生产接管。

- 2026-08-02：Rust 性能迁移阶段 3 实际 Calibration Worker 耐久评估判定 no-go。短跑的生产输出、Native/base theta、4 线程上限和事件循环延迟均通过，Rust 核心/端到端仍有 8.85–13.95/7.91–14.19 倍加速；但每请求创建 Worker 并在响应后立即 `terminate()` 时，60 请求串行及 2 路并发可非确定性触发 Windows `0xC0000005` Native 卸载崩溃。Rust shadow 必须继续默认关闭；修改高风险 `calibrationBridge.ts` 为持久 Worker 队列或 graceful shutdown 前须用户明确授权。

- 2026-08-02：Rust 性能迁移阶段 1 完成。mise 固定 Node 24.18.0、pnpm 10.18.3 与 Rust 1.88.0，napi-rs 3 + Node-API 8 + Rayon 1.12.0 的上旋搜索 PoC 在 DS01..05 最终复跑获得核心 17.66–19.10 倍、含 TypedArray DTO 端到端 16.49–18.65 倍加速；7/7 数值等价测试通过。PoC 未接入生产，阶段 2 采用特性开关 + TypeScript 回退的影子集成，并先限制 Rayon 线程数。

- 2026-08-02：Rust 性能迁移阶段 0（Windows x64 / Node 24.18 / Ryzen 9 9950X3D，1 warmup + 3 repeats）基线：上旋 DS01..05 估算中位数 131.564/236.516/105.057/173.847/338.005ms，均超过 100ms；膜泡 Batch/RLS 为 7.163/1.988ms。100k 点 run-once Worker 端到端对象克隆 82.435ms、TypedArray transfer 17.501ms。阶段 1 优先上旋目标函数/搜索并采用 TypedArray DTO。

- 2026-08-02：DS02 当前生产入口结果约 309.748°，相对标称 320.2° 误差 10.452°，既有真实数据回归同步失败；Rust 等价和领域精度必须作为两个独立门槛，性能迁移不得静默改变算法结果。

- 2026-07-29：现场历史角度结果对选段/目标模式高度不稳定：最新短+正常两趟 auto=256.43°、direct=260.00°；两组正常双行程 direct=340.32°/330.03°、expanded=180.00°/180.50°；四个正常行程 direct=310.04°。正常行程 pulse 恒为 0，expanded 用合成 offset 却被 auto 当成有效位置；双行程还会跳过部分片段过滤。当前数据不可直接产出可信唯一角度。

- 2026-07-29：现场库 `rotation_trip` 可能为空，且一次换向的 `forwardDirChange/reverseDirChange` 会在约 7 条连续记录中重复为真；历史边界必须对连续同向事件去重，并合并由正反转状态推断的变化。现场库只读回放最近两趟 697,811 个事件约 8 秒得到 `maxAngle=256.429°`。

- 2026-07-29：历史“最大上旋角度”是独立标定项，不得复用完整 CalibrationSession 的牵引速度和突变窗口前置门槛；应直接从历史流构建至少两个完整有效行程，再调用角度 Worker。

- 2026-07-29：历史标定合并显式换向标记与正反转状态推断边界，并在有限的最近边界中选择至少含 100 条 `ad > 0` 厚度记录的最近两个行程；不能用停机收尾写入的 `rotation_trip.end_ts` 代替换向事件。厚度原始数据必须使用 `(timestamp, id)` 键集分页，并按时间线性归并旋转事件，避免百万级数据的深 `OFFSET` 与全量事件排序。

- 2026-07-29：历史标定的超时必须分层递增：内层角度 Worker 120 秒、历史回放 Worker 180 秒、IPC 宿主 190 秒，避免外层在内层合法执行期间提前终止。

- 2026-07-29：Electron 标定 IPC 的活动链路是 `adbox.ts` 的 `PROXIED_CHANNELS` → `UtilityHost` → `utilityWorker.ts`；旧 `calibrationIpc.ts` 当前没有初始化调用方。新增 worker_threads 脚本还必须在 `vite.config.ts` 中配置独立构建产物。

- 2026-07-29：影子覆盖准备度必须区分“未评估”和“已评估且无缺口”；覆盖满足只表示显式分桶样本阈值达标，不表示算法准确或具备生产切换资格。

- 2026-07-29：一维与二维补采目标存在重叠，不能直接汇总各目标缺口作为总需采集量；补采顺序应确定性地优先空覆盖、再按缺口降序，并在同级优先更具体的二维组合。

- 2026-07-29：连续工况的一维分桶各自充分不能证明组合工况已覆盖；影子验收至少需要显式保留速度 × 生产角度交叉矩阵中的空单元和少样本单元。

- 2026-07-29：工况桶样本不足属于验收覆盖盲区，不等同于算法失败；无标签统计应保留充分桶结果并结构化列出待补采的空桶/少样本桶。

- 2026-07-29：影子工况空桶必须保留且接受率为 `null`，不能用 0% 混淆“无覆盖”和“有样本但全部拒绝”。

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
| 2026-08-02 | Rust Node-API 上旋热点 PoC 与默认关闭的 Worker 影子集成；TS 仍为唯一输出，Native 端到端加速 15.48–19.59×     |
| 2026-08-03 | Rust shadow 增加确定性采样、100 次默认上限、连续异常熔断与可选有序 NDJSON；实际 Worker 离线观测 3/3 等价     |

## Rust 上旋影子模式

- mise 固定 Node 24.18.0、pnpm 10.18.3、Rust 1.88.0；Windows x64 Native 位于 `packages/AirRingNative`。
- `AIR_RING_RUST_SHADOW=1` 显式开启，默认关闭；`AIR_RING_RUST_SHADOW_THREADS` 限制 1–32，默认最多 4。
- 受控观测默认每次采样、每 Worker 最多 100 次、连续 3 次失败/不可比/超差后熔断；采样间隔、次数、阈值与可选绝对日志路径均由 `AIR_RING_RUST_SHADOW_*` 环境变量显式配置。
- NDJSON 只包含观测状态与既有 telemetry，不包含原始测点；Worker shutdown/ack 前刷新，离线汇总只输出聚合统计。
- 安装包从 `resources/native/air-ring-native.win32-x64-msvc.node` 动态加载；失败只写 telemetry，不影响 TypeScript `maxAngle`。
- DS01–DS05 Rust 主搜索与 TypeScript base theta 等价；DS02 生产领域误差 10.452° 仍是切换阻断项。
- 2026-08-03 阶段 6 预检确认：完整 Electron 应用启动会自动初始化 ADBox 并尝试连接上旋 S7，不能当作无副作用观测命令；联机 shadow 必须经过现场人工门禁。
- 阶段 6 技术预检在 mise 固定版本、构建产物、无活动应用进程、无残留 shadow 环境变量和绝对日志路径五项门槛上通过；该结论仅表示可进入人工确认，不表示允许启动设备连接。
- 2026-08-05 本机阶段 6 验收范围调整为 SQLite 历史数据只读回放；历史 Native 路径需要至少 3 个真实方向状态边界来闭合 2 个有效行程。当前 `jjsk.db` 只有一次 reverse→forward 变化，回放只能形成 1 个有效行程，尚未触发 Native telemetry；不得用 `rotation_trip.end_ts` 伪造换向。
- 2026-08-05 更换为 1.26 GB 旧历史库后，697,811 事件只读回放成功触发 Rust Native：角度差 0°，Native 92.1361 ms、shadow 总耗时 125.6758 ms。非 WAL 历史库的只读连接必须沿用现有 journal mode 并设置 `query_only=ON`，不得尝试切换 WAL；复测后数据库文件元数据和 `delete` 模式未变化。

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

## 2026-08-09 Phase 8B 历史 Bubble Shadow

- 1.26 GB 旧历史库按生产 `bubbleQueryWorker → sweepProfileBuilder → persistent bubbleWorker` 链路完成只读 Bubble shadow；13 个有效 48-bin profile 的 Rust/TypeScript 最大差异为 0，Native failure 为 0，Worker 创建数为 1。
- Rust Cholesky 不得在回代过程中提前截断负分量；必须先完成无约束回代再统一做非负约束。提前截断在历史病态矩阵上曾造成最高 11.56μm 差异，现有 Rust 回归测试覆盖此顺序。
- 旧历史库可能缺少 `thickness_raw.pos1`，方向列可能为驼峰或下划线命名；离线只读查询只选择稳定必要列，并用 `PRAGMA table_info` 识别方向列，禁止依赖 `select(*)`。
- 真实完整重建中位耗时 TypeScript/Rust 为 0.2642/0.0869ms（3.0403 倍），求解中位加速 1.5798 倍；数据库与 rollback journal 格式、主文件及 sidecar 哈希均未变化。
- Phase 8B 判定 `go-primary-candidate`，但 Bubble primary 尚未启用。下一步必须先实现默认关闭且与 shadow 互斥的 primary、TypeScript 完整回退、历史双跑和 300 次持久 Worker 长跑；RLS 与安装包继续使用 TypeScript。

## 2026-08-09 Phase 8C Bubble Batch Primary

- Bubble Batch Rust primary 已通过同一历史窗口 30 趟双跑：13 个有效 profile 哈希全部精确匹配，拒绝/失败语义一致，Native 13/13 success、0 fallback，历史中位重建加速 1.2992 倍。
- 300 次持久 Worker 长跑（另 5 次预热）全部走 Rust、0 fallback、单 Worker、最大 profile 差异 0；事件循环 P95 15.3846ms，RSS 未呈线性增长。
- 仅 mise 开发环境设置 `AIR_RING_BUBBLE_RUST_PRIMARY=1`；`AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 禁用优先。非 mise、安装包和 RLS 继续走 TypeScript。
- primary 与 shadow 互斥；Native 加载、执行、返回校验或领域后处理失败必须在同一请求内完整重跑 TypeScript。

## 2026-08-09 Phase 9 Bubble 历史长跑与查询内存

- 单个历史库的 13 个唯一有效 profile 经 77 次回放产生 1001 次 Rust primary success，0 fallback、0 hash 漂移、单持久 Worker；事件循环 P95 16.0809ms。
- 历史 Query Worker 不得先 `.all()` 物化完整扫描行再跨线程复制。当前在同一只读事务中 COUNT + iterator，按 `floor(i*N/target)` 最多保留 2000 点，并单独返回 `sourceRowCount`。
- 有界查询保持优化前后 13/13 profile 哈希一致，长跑峰值 RSS 从 4,122,468,352 降至 149,807,104 bytes；结束 RSS 增量约 4.1MiB，趋势约 94KiB/pass。
- 重复稳定性与数据集广度必须分开验收；安装包候选至少需要 3 个独立历史数据库，当前只有 1 个。mise primary 保持启用，安装包和 RLS 保持 TypeScript。

## 2026-08-09 Phase 10 现场发布方式

- mise 仅是个人开发环境管理工具；团队现场构建不得调用 mise，Node/pnpm/Cargo 从 PATH 获取，版本管理器不限。
- `pnpm build:field` 在开发机生成 Windows x64 `win-unpacked`、electron-builder 原生 7z 和 SHA-256 manifest；工控机无需 Node、pnpm、Rust、Visual Studio 或 mise。
- `better-sqlite3` 使用 `prebuild-install` 下载当前 Electron ABI 的预编译 addon，electron-builder 设置 `npmRebuild=false`，预编译缺失时构建失败而非本地编译。
- 打包态默认启用上旋与 Bubble Batch Rust primary，线程默认 4；两个 disable 环境变量优先，Native 故障继续完整回退 TypeScript，RLS 不迁移。
