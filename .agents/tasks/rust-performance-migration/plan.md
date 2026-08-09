# Plan: Rust 性能迁移

## 先写计划再动手

### 阶段 0 步骤

1. [x] 盘点现有进程边界、性能诊断、数据集和测试入口。
2. [x] 建立可复用的基准统计工具和结果 schema。
3. [x] 建立上旋 DS01–DS05 生产入口基准，记录构段和估算耗时。
4. [x] 建立膜泡 Batch/RLS 重建基准，记录求解耗时和正确性摘要。
5. [x] 记录 Node/V8、CPU、内存、提交版本和基准配置。
6. [x] 将基准结果写入 task 的 `scripts/outputs/`，并保留控制台摘要。
7. [x] 串行执行阶段 0 基准、上旋回归、类型检查和 lint。
8. [x] 根据实测结果确定阶段 1 Rust PoC 的第一个迁移热点。

### 验收标准

- [x] 一条命令可以重复运行阶段 0 基准。
- [x] 输出为机器可读 JSON，包含环境、配置和逐场景统计。
- [ ] 上旋基准覆盖 DS01–DS05，并验证每组误差小于 5°。DS02 当前偏差 10.452°，既有回归测试同步失败。
- [x] 膜泡基准同时覆盖 Batch 和 RLS，结果均为有限数值。
- [x] 每个计时场景至少支持 warmup 和 repeat 配置。
- [x] 基准默认不包含在现有上旋通配测试矩阵中。
- [x] 没有修改生产运行路径和设备控制代码。

### 预期产出

- 阶段 0 基准测试文件和统计工具。
- `scripts/outputs/performance-baseline-*.json` 基线结果。
- 阶段 1 Rust PoC 热点选择及量化依据。

## 阶段 1：上旋 Rust Node-API PoC

### 步骤

1. [x] 复核阶段 0 基线、上旋目标函数边界与本机工具链。
2. [x] 通过 mise 固定并安装满足 napi-rs v3 要求的 Rust 1.88.0。
3. [x] 建立仅用于 PoC 的 napi-rs 原生模块，不接入生产估算入口。
4. [x] 定义连续 TypedArray DTO，并对长度、segmentOffsets、duration、accelRatio、bin 数做边界校验。
5. [x] 在 Rust 中实现 `evaluateDirect`、`evaluateExpanded` 和批量候选角度搜索。
6. [x] 添加 TypeScript/Rust 数值等价测试，覆盖合成边界和 DS01–DS05 真实输入。
7. [x] 扩展性能基准，分别记录 DTO 构建、TypeScript 核心、Rust 边界+核心和端到端耗时。
8. [x] 运行 Rust 测试、原生模块测试、阶段 0 回归、lint、格式和 typecheck。
9. [x] 根据核心 3 倍、端到端 2 倍门槛决定是否进入阶段 2。

### 验收标准

- [x] PoC 不修改生产算法选择、Electron 主入口、设备连接和控制器。
- [x] Rust API 对所有数组长度和数值边界进行验证，非法输入返回错误而非 panic。
- [x] Rust 与 TypeScript 目标函数在相同输入上的误差满足显式绝对/相对容差。
- [x] Rust 搜索返回的 theta/loss 与 TypeScript 参考实现满足显式容差。
- [x] DS02 的领域精度失败继续单独报告，不被数值等价测试掩盖。
- [x] 核心计算加速至少 3 倍，端到端加速至少 2 倍，否则停止扩大迁移范围。
- [x] 原生二进制和 Cargo `target/` 不作为源码提交。

### 预期产出

- 可由 mise + pnpm 一键构建的 Windows x64 napi-rs PoC。
- TypedArray DTO、Rust 目标函数/搜索实现及数值等价测试。
- 阶段 1 性能报告和是否进入阶段 2的量化决策。

## 阶段 2：标定 Worker 受控影子集成

### 步骤

1. [x] 抽取共用的 Native 输入归一化与 TypedArray DTO 构建模块。
2. [x] 为 Rayon 增加显式线程池配置，并在影子 Worker 中设置 1–32 的保守上限。
3. [x] 实现 Rust 主搜索与 TypeScript `baseThetaDeg` 的结构化影子比较。
4. [x] 在 `calibrationWorker.ts` 增加默认关闭的环境特性开关、动态加载和错误隔离。
5. [x] 将 Windows x64 `.node` 作为 Electron extra resource 打包，不静态 bundle。
6. [x] 添加影子禁用、成功、不可比较、异常回退及真实数据等价测试。
7. [x] 运行 Native 构建、Rust 检查、Worker 构建和阶段回归矩阵。

### 验收标准

- [x] TypeScript 始终是唯一生产结果，Rust 不覆盖 `maxAngle`。
- [x] 影子默认关闭；关闭时不加载 Native、不构建 DTO。
- [x] Native 加载、线程配置或搜索失败不会使标定 Worker 失败。
- [x] 遥测包含状态、theta 差异、耗时、点数、评估次数与线程上限，不包含原始测点。
- [x] DS01–DS05 Rust theta 与 TypeScript base theta 数值等价。
- [x] Rayon 线程数限制为 1–32，默认不超过 4。
- [x] 不修改标定控制器、Bridge、设备连接和设备控制代码。
- [x] DS02 领域精度失败继续独立报告。

### 预期产出

- Worker 内默认关闭的 Rust 影子路径与结构化遥测。
- 可复用 Native DTO 适配层及异常回退测试。
- Windows x64 Electron Native 资源打包规则与阶段 2 验收报告。

## 阶段 3：实际 Worker 离线耐久与并发预算

### 步骤

1. [x] 使用生产构建的 Calibration Worker 建立可重复的离线影子耐久 benchmark。
2. [x] 覆盖影子关闭串行、影子开启串行、2 路并发和 4 路并发；2 路场景触发进程级访问冲突，作为阻断证据保留。
3. [x] 记录延迟、吞吐、CPU 核等效占用、RSS 与事件循环延迟。
4. [x] 验证成功请求的 TypeScript 生产结果不变、Rust/base theta 等价与线程上限稳定，并识别进程级错误率不为零。
5. [x] 将成功样本和机器可读阻断结果写入 task `scripts/outputs/`，不保存原始测点。
6. [x] 运行 Native/Worker 构建、阶段回归、lint、格式和 typecheck；typecheck 仅保留仓库既有错误。
7. [x] 根据 CPU 和稳定性结果作出 no-go 决策，不允许扩大影子观测。

### 验收标准

- [ ] 四个离线场景全部完成，所有 Worker 请求成功。
- [x] 影子开关不改变 TypeScript `maxAngle`。
- [x] 成功请求中 Rust theta 与 TypeScript `baseThetaDeg` 的绝对差异不超过 `1e-9°`。
- [x] 成功请求的 Rayon telemetry 始终报告 4 线程，且并发最多 4 路。
- [x] 成功场景主线程事件循环 P95 小于 100ms。
- [x] JSON 报告包含延迟、吞吐、CPU 和内存聚合，不包含原始测点。
- [x] 不修改设备、标定控制器、Bridge 和生产上旋算法逻辑。
- [x] DS02 领域精度失败继续独立报告。

> 阻断：60 请求耐久测试存在非确定性的 Windows `0xC0000005` 访问冲突，因此“所有 Worker 请求成功”未通过，阶段 3 判定为 no-go。

### 预期产出

- 实际 Calibration Worker 离线耐久与并发 benchmark。
- `native-shadow-soak.json` 机器可读报告。
- 阶段 3 CPU/稳定性验收摘要和下一阶段决策。

## 阶段 4：持久 Calibration Worker 生命周期修复

### 步骤

1. [x] 抽取惰性创建、单 Worker 复用、FIFO 队列和异常重建的客户端。
2. [x] 将 Bridge 实时入口接入“忙时跳过”，Promise 入口接入显式排队，移除轮询和成功后的强制终止。
3. [x] 增加 Worker shutdown/ack 协议和自然退出等待。
4. [x] 历史标定 Worker 完成后优雅关闭嵌套 Calibration Worker。
5. [x] 将实际 Worker soak 改为持久客户端和并发提交/单 Worker 执行拓扑。
6. [x] 运行 60+ 串行、2/4 路提交耐久以及阶段回归矩阵；另追加 300 请求串行耐久。
7. [x] 根据稳定性与 CPU 预算允许后续扩大串行 shadow 观测，继续禁止并行 Native Worker 和生产接管。

### 验收标准

- [x] 连续 60+ 次影子请求无 Windows `0xC0000005` 或其他 Worker 异常退出；扩展长跑为 300/300。
- [x] 2/4 路并发提交全部成功，实际 Native Worker 数始终为 1。
- [x] 实时入口保留忙时跳过，Promise 入口按 FIFO 排队。
- [x] 正常响应不强制终止 Worker；显式 shutdown 自然以 code 0 退出。
- [x] TypeScript `maxAngle` 不变，Rust/base theta 绝对差异不超过 `1e-9°`。
- [x] telemetry 线程上限保持 4，事件循环 P95 小于 100ms。
- [x] 不修改设备控制、标定算法选择和 DS02 领域规则。
- [x] 构建、回归、Rust 检查、lint 和格式通过，typecheck 不新增错误。

### 预期产出

- 可复用的持久 Calibration Worker 客户端与关闭协议。
- 更新后的 Bridge/历史回放生命周期集成。
- 阶段 4 耐久聚合报告、验收摘要和 shadow 下一步决策。

## 阶段 5：受控串行 Shadow 观测

### 步骤

1. [x] 增加确定性采样、单 Worker 最大运行次数、连续异常熔断和角度差阈值。
2. [x] 接入 Calibration Worker stateful runtime，并在 shutdown/ack 前刷新日志。
3. [x] 增加不含原始测点的可选 NDJSON 记录与仅输出聚合统计的离线工具。
4. [x] 覆盖策略、采样、熔断、日志隔离和实际构建 Worker 集成测试。
5. [x] 运行阶段回归矩阵并形成受控观测 runbook 与验收摘要。

### 验收标准

- [x] Rust shadow 默认关闭，TypeScript `maxAngle` 始终是唯一生产结果。
- [x] 默认最多 100 次，确定性采样与配置边界生效。
- [x] 连续 3 次失败或角度差超阈值后自动停止 shadow。
- [x] NDJSON 可选、可刷新、不含原始测点，写入失败不影响请求。
- [x] 汇总报告只含聚合统计，实际 Worker 集成测试通过。
- [x] 不修改设备控制、标定 Bridge、主进程入口和部署配置。

### 预期产出

- Shadow 观测策略、日志 writer 和 Worker 生命周期接入。
- 单元/集成测试、聚合脚本、runbook 与阶段 5 验收摘要。

## 阶段 6：受控环境观测门禁与联机前预检

### 步骤

1. [x] 只读检查活动进程、shadow 环境变量、构建产物和默认日志路径。
2. [x] 新增不启动 Electron、不连接设备的技术预检脚本与 JSON 报告。
3. [x] 使用 mise 验证工具链、构建产物、进程和环境清洁度门槛。
4. [x] 记录应用启动会自动连接 ADBox/S7 的风险和人工门禁清单。
5. [x] 修复现场启动前暴露的扫描重建大数组展开栈溢出，并完成回归构建。
6. [x] 用户确认本机验收仅使用历史数据，不在本机执行设备联机观测；部署前现场门禁继续保留。
7. [x] 按用户补充的本机测试口径，使用 SQLite 历史数据只读回放验证 Rust Native shadow，不依赖设备连接。
8. [x] 兼容非 WAL 历史库的只读连接，避免只读 Worker 尝试切换数据库日志模式。

### 验收标准

- [x] 技术预检通过且报告不包含原始测点或敏感配置。
- [x] 预检过程无 Electron 启动、网络连接或设备控制副作用。
- [x] 真实观测前必须确认现场值守、急停、设备空闲、观测窗口和回滚责任人。
- [x] Rust shadow 继续默认关闭，生产接管继续 no-go。
- [x] 历史回放生成至少 1 条成功 telemetry，且不包含原始测点。

## 阶段 7：上旋角度 Rust Native 主路径迁移

### 步骤

1. [x] 定义可插拔搜索后端，保持 TypeScript 策略编排不变。
2. [x] 扩展 Native 搜索结果以提供等价 loss 采样。
3. [x] 将粗/细搜索和最终目标函数计算接入 Rust 后端。
4. [x] 在 Calibration Worker 增加默认关闭的 primary 开关和 TypeScript 自动回退。
5. [x] 覆盖 Native 数值、DS01–DS05 最终结果和 Worker 故障回退测试。
6. [x] 使用 mise 构建、测试并以历史样本完成 primary 验收。

### 验收标准

- [x] Worker 代码 primary 默认关闭，关闭时不加载 Native；mise 项目开发环境在验收后显式启用。
- [x] Native 异常或结果被拒绝时自动回退 TypeScript。
- [x] DS01–DS05 最终角度、规则诊断和拒绝状态等价。
- [x] 历史样本 Rust/TypeScript 最终角度差异不超过 `1e-9°`。
- [x] 不修改设备连接、控制器和控制指令边界。
- [x] 构建、Rust 检查和相关回归不新增失败。

## 阶段 8：膜泡厚度 Batch Rust Native 接入

### Phase 8A 步骤

1. [x] 将膜泡重建改为惰性常驻单 Worker + FIFO，正常响应不再强制终止。
2. [x] 增加 shutdown/ack 优雅关闭协议，并保留超时、发送失败和异常退出后的强制回收兜底。
3. [x] 在 Rust 中实现 CSR 输入校验、正规方程构建、圆周 Tikhonov 正则和 Cholesky 求解。
4. [x] 增加 TypeScript Native 适配层与默认关闭的 Batch shadow；TypeScript 结果继续作为唯一生产输出。
5. [x] 对 48/96/180/360 bins 运行 TypeScript/Rust 数值等价和分段性能基准。
6. [x] 运行持久 Worker 连续调用、优雅关闭、Native 构建、Rust 检查、类型检查和相关回归。
7. [x] 根据真实规模端到端收益决定是否进入 Phase 8B 主路径；RLS 暂不迁移。

### Phase 8A 验收标准

- [x] Native 对 M/N、CSR offsets、列索引、数组长度、lambda/mu 和有限数值做边界校验，非法输入返回错误而非 panic。
- [x] Batch Rust 与 TypeScript profile 长度一致、无非有限值，并满足明确的绝对/相对误差门槛。
- [x] Shadow 默认关闭；关闭时不加载 Native、不构建额外 DTO，且绝不覆盖 TypeScript profile。
- [x] 常驻 Worker 串行处理排队请求，正常响应不调用 `terminate()`，shutdown/ack 后自然 code 0 退出。
- [x] Native 加载或执行失败只产生结构化 shadow telemetry，不影响膜泡重建结果。
- [x] 48 bins 不因 Rust 接入产生明显端到端回退；180/360 bins 单独报告加速比。
- [x] 连续 300 次 Worker 请求无崩溃、无请求丢失，Worker 创建数保持 1。
- [x] 不修改设备连接、设备控制、Electron 主进程入口和膜泡领域后处理规则。

## Phase 8B：本机历史数据 Bubble Shadow 验证

### 步骤

1. [x] 只读定位历史 SQLite 样本、膜泡 sweep 查询入口和必需工艺参数。
2. [x] 建立不启动完整 Electron、不连接设备的历史膜泡 Shadow 脚本。
3. [x] 通过真实 `sweepProfileBuilder → Bubble Worker` 路径执行默认 48 bins 对照。
4. [x] 聚合 TypeScript/Rust profile 差异、求解耗时、端到端耗时和 Worker 生命周期指标，不保存原始测点。
5. [x] 验证数据库文件长度、修改时间和 journal mode 均未变化。
6. [x] 根据真实历史结果决定默认 primary、按 bins 动态路由或停止扩大迁移。

### 验收标准

- [x] 全程只读，不启动完整 Electron，不初始化 ADBox/S7，不修改数据库。
- [x] 至少获得 10 个有效 sweep；不足时明确记录数据门槛而不伪造样本。
- [x] Rust shadow 不改变 TypeScript profile，所有可比结果最大差异不超过 `1e-8μm`。
- [x] Native 加载/执行失败不会导致生产 TypeScript 重建失败。
- [x] 报告仅包含聚合指标和时间范围，不包含原始测厚点。
- [x] 默认 48 bins 是否进入 primary 使用真实端到端收益作出显式 go/no-go 决策。

## Phase 8C：膜泡 Batch Rust Primary 候选

1. [x] 增加默认关闭、与 shadow 互斥的 Bubble Rust primary 开关。
2. [x] Native 加载、执行、结果长度、有限值或领域后处理失败时完整回退 TypeScript。
3. [x] 对相同历史窗口运行 TypeScript/primary 双跑，验证最终 profile 与拒绝语义等价。
4. [x] 运行 300 次持久 Worker primary 长跑及事件循环、内存和生命周期门槛。
5. [x] 通过后仅在 mise 开发环境启用，并提供单变量即时回滚；安装包继续默认关闭。

## Phase 9：Bubble Primary 历史长周期与部署准备度

1. [x] 扩展只读历史观测入口，支持同一查询结果的有界重复回放，并聚合事件循环、RSS、总尝试数和唯一 profile 指纹数。
2. [x] 新增 Phase 9 启动器，在单持久 Worker 中完成至少 1000 次真实历史 primary success，要求 0 fallback、0 hash 漂移和 Worker 创建数 1。
3. [x] 对运行前后数据库主文件及 sidecar 做长度、时间、SHA-256 和 journal 格式快照，保持完全只读。
4. [x] 运行 Electron Node typecheck、Vite build、Phase 8/9 回归和历史长跑，报告性能、事件循环、内存与数据集覆盖度。
5. [x] 将“重复稳定性”和“独立数据集广度”分开判定；独立数据集不足时继续保持安装包默认关闭，不迁移 RLS。

## Phase 10：现场免开发环境 Unpacked 发布包

1. [x] 增加不依赖 mise 的统一 `pnpm build:field` 流程；开发者可自行选择 Node/Rust 版本管理工具。
2. [x] 打包运行时默认启用上旋与 Bubble Rust primary，保留两个 disable 环境变量的禁用优先级和 TypeScript 完整回退。
3. [x] 显式将 Rust addon 放入 `resources/native`，将 `better-sqlite3` 解出 ASAR，并增加不初始化设备的打包自检入口。
4. [x] 由 electron-builder 原生 `dir` + `7z` target 默认生成完整 `win-unpacked`、`.7z` 和包含版本、Git、文件及 SHA-256 的 sidecar manifest。
5. [x] 验证 Native 源/包哈希一致、SQLite Electron 预编译 addon 与 Native 自检通过、7z 签名/哈希有效、TypeScript/Rust 回归通过，且全过程不启动主应用或连接设备。

## Phase 11：Electron 运行时与高频内容包分层发布

1. [x] 定义 Windows x64 内容包边界，只包含 `resources` 应用内容、清单、运行时探针和安全替换脚本，不包含 Electron 可执行文件、DLL、locale 或运行时资源。
2. [x] 增加 `pnpm build:content`，复用 Native、Electron ABI SQLite、Vite、electron-builder `dir` 和无设备自检链路，仅输出内容 7z 与 sidecar manifest。
3. [x] 内容清单记录独立内容版本、Git 状态、目标 Electron 精确版本、Node modules ABI、逐文件大小与 SHA-256，并验证 7z 完整性。
4. [x] 替换脚本在覆盖前确认应用已退出、探测目标 `JJSK.exe` 的真实运行时并校验兼容性，随后同卷暂存、备份旧 `resources`、交换目录，失败时自动恢复。
5. [x] 在完整目录副本上解压并应用内容包，再执行打包态 Native/SQLite 自检；同时验证运行时不匹配会被拒绝。
6. [x] 更新现场部署文档和 Phase 11 决策，区分开发高频内容版本与正式发布签名/可信分发门禁。

### Phase 11 验收标准

- [x] 内容 7z 不包含 `JJSK.exe`、Electron DLL、locale、pak 或其他基础运行时文件。
- [x] Electron 精确版本、平台、架构或 Node modules ABI 不一致时，替换脚本在修改目标目录前失败。
- [x] 内容包内所有文件在替换前均通过 SHA-256 校验，路径不能逃逸 payload 根目录。
- [x] 应用运行时拒绝覆盖；成功更新保留可恢复的旧 `resources` 备份，交换失败自动回滚。
- [x] 应用内容、Rust Native 与 Electron ABI `better-sqlite3` 一起更新，更新后的完整目录自检通过。
- [x] 构建和应用过程不启动主应用、不初始化 ADBox/S7、不依赖现场 Node、Rust、mise 或 Visual Studio。
