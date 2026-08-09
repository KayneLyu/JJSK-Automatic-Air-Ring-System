# Decisions: Rust 性能迁移

## 2026-08-02 12:06 阶段 0 使用生产入口的离线基准

**背景**: 后续 Rust PoC 必须与当前 TypeScript 实现进行端到端比较，单独测试人工微循环无法反映数据构建、跨边界复制和算法正确性。

**选择**: 阶段 0 使用 Vitest 执行离线串行基准，直接调用现有生产算法入口，并将结果写为机器可读 JSON。

**理由**: Vitest 已是项目依赖并能直接加载 TypeScript 和真实 JSON 数据，无需引入新运行时依赖；串行执行能够减少文件并行和 Worker 调度对计时的干扰。

**影响**: 后续 Rust 实现必须复用相同输入、统计方法和正确性门槛；历史 SQLite 回放和 Electron IPC 将作为后续独立基准补充，避免阶段 0 首次实现修改生产 Electron 路径。

## 2026-08-02 12:19 阶段 1 优先迁移上旋目标函数与搜索循环

**背景**: 阶段 0 正式基线显示，上旋 DS01–DS05 估算中位数为 105.057–338.005ms，全部高于项目 100ms 目标；膜泡 Batch/RLS 重建仅为 7.163/1.988ms。

**选择**: 阶段 1 Rust PoC 首先覆盖 `evaluateExpanded`、`evaluateDirect` 及其候选角度搜索循环，暂不迁移膜泡重建、SQLite 和设备协议。

**理由**: 上旋是当前已量化的最大 CPU 热点，且迁移边界可保持为纯函数；膜泡重建当前没有形成实时性能瓶颈。

**影响**: Rust PoC 以端到端至少 2 倍、核心计算至少 3 倍为继续扩大迁移的性能门槛。

## 2026-08-02 12:19 Rust 边界使用 TypedArray 批量数据

**背景**: 100,000 点一次性 Worker 创建与往返基准中，对象数组结构化克隆中位数为 82.435ms，TypedArray transfer 为 17.501ms。

**选择**: Rust PoC 不接受逐点 JS 对象调用；在进入 Node-API 前先定义连续 TypedArray 批量 DTO。

**理由**: 当前数据表明对象克隆足以消耗大部分 100ms 预算，而 TypedArray transfer 的端到端成本约为前者的 21%。

**影响**: 阶段 1 需要分别报告 DTO 构建、边界传输和 Rust 核心计算耗时，避免只呈现 Rust 内部微基准。

## 2026-08-02 12:19 性能等价与领域精度采用双门槛

**背景**: DS02 当前 TypeScript 生产入口误差为 10.452°，既有回归测试也失败。仅要求 Rust 输出与 TypeScript 一致会继承该质量问题。

**选择**: Rust PoC 同时检查与 TypeScript 的数值等价以及相对数据集标称值的领域精度；DS02 失败明确保留，不在性能迁移中静默修改算法结果。

**理由**: 性能迁移应保持算法语义，精度回归需要单独诊断和决策。

**影响**: PoC 可以完成性能验证，但在 DS02 恢复到小于 5°前不能宣称满足完整生产切换条件。

## 2026-08-02 14:14 使用 Rayon 并行候选角度 loss

**背景**: 第一版单线程 Rust 搜索在 DS01–DS05 上仅获得 1.53–1.60 倍核心加速，未达到 3 倍门槛。候选角度之间没有数据依赖，生产路径目前又以单个 Worker 串行执行整次估算。

**选择**: 引入 Rayon 1.12.0，将去重后的粗搜和精搜候选 loss 并行计算；结果仍按 TypeScript 的原始候选顺序归约，保持相同的严格 `<` 决胜语义和确定性。

**理由**: Rayon 是成熟的 MIT/Apache-2.0 工作窃取并行库，Rust 1.80 起可用，满足项目 Rust 1.88 下限；并行维度天然独立，不改变目标函数。

**影响**: PoC 会使用本机 Rayon 全局线程池。进入生产前必须评估与 Electron Worker 并发的 CPU 过度订阅，并提供线程数上限配置。

## 2026-08-02 14:24 采用 napi-rs 原生热点模块而非 Rust sidecar

**背景**: 上旋目标函数是纯 CPU 热点，现有执行边界位于 Node/Electron Worker 内。独立 sidecar 会增加进程生命周期、序列化和部署复杂度，WASM 对本项目 Windows/Electron 下的原生多线程与 TypedArray 借用收益有限。

**选择**: 使用 napi-rs 3、Node-API 8 和 Rust 1.88.0 构建 Windows x64 原生模块；同步 API 借用 `Float64Array`/`Uint32Array` 输入，不逐点创建 JS 对象。工具链由 mise 固定，包级脚本负责初始化 MSVC 环境。

**理由**: Node-API 能直接复用现有 Worker 边界，并保持 JavaScript 调用面稳定；正式基准中 DTO 开销没有吞掉 Rust/Rayon 的计算收益。

**影响**: 构建机需要 Visual Studio 2022 C++ Build Tools；后续打包必须覆盖 Electron ABI/目标平台矩阵，并保留加载失败时的 TypeScript 回退。

## 2026-08-02 14:24 阶段 1 通过性能门槛，进入受控影子集成

**背景**: DS01–DS05 最终正式复跑中，Rust 核心加速为 17.66–19.10 倍，含 DTO 的端到端加速为 16.49–18.65 倍，超过核心 3 倍和端到端 2 倍门槛；7 个数值等价测试全部通过。

**选择**: 允许进入阶段 2，但仅接入现有标定 Worker 的影子路径，由特性开关控制并保留 TypeScript 生产结果与自动回退。

**理由**: PoC 已证明热点迁移具有显著收益，但 DS02 仍存在 10.452° 领域精度偏差，且 Rayon 与 Electron Worker 的并发过度订阅尚未评估。

**影响**: 阶段 2 不得让 Rust 结果直接控制设备；必须增加差异、耗时、错误与回退遥测，并配置原生线程数上限。

## 2026-08-02 17:05 在校准 Worker 内采用默认关闭的 Rust 影子路径

**背景**: 阶段 1 已证明 Native 搜索具有显著性能收益，但 DS02 领域精度仍未达标，且不能让性能迁移改变设备控制结果。

**选择**: 仅在 `calibrationWorker.ts` 中通过 `AIR_RING_RUST_SHADOW=1` 启用影子计算；TypeScript 详细估算先执行并继续提供唯一 `maxAngle`，Rust 只与 `baseThetaDeg` 比较并写入结构化 telemetry。Native 加载、线程配置与执行错误全部隔离。

**理由**: Worker 已是现有 CPU 隔离边界，可在不改标定控制器、Bridge、主进程或设备连接的情况下收集真实负载下的等价性和耗时数据。

**影响**: 生产默认行为不变；只有显式开启时才加载 `.node` 和构建 DTO。后续生产切换必须另行决策，且 DS02 小于 5°、长时间影子稳定性和 CPU 预算均为前置条件。

## 2026-08-02 17:05 限制 Rayon 并将 Native 作为 Electron extra resource

**背景**: Rayon 默认使用所有逻辑核可能与 Electron Worker 过度订阅，`.node` 也不能被静态打入 JavaScript bundle。

**选择**: Native 暴露一次性全局线程池配置，接受 1–32，Worker 默认 `min(4, availableParallelism)`；Windows Builder 将 `.node` 复制到 `resources/native`，运行时优先使用显式路径，其次安装资源路径和开发路径。

**理由**: 显式线程上限提供可预测的 CPU 占用；extra resource 保留原生二进制形态并让开发、安装和诊断路径清晰可验证。

**影响**: 同一进程中线程数一旦配置不可更改，配置冲突会降级为影子 telemetry，不影响 TypeScript 结果。当前打包目标验证为 Windows x64；其他平台需要独立产物与规则。

## 2026-08-02 17:43 每次搜索使用局部 Rayon 线程池

**背景**: 实际 Worker 耐久测试发现，一次性 Worker 在完成 Native 搜索后立即被强制终止时会非确定性触发 Windows `0xC0000005`。全局 Rayon 线程池的生命周期超出 Worker 调用，是首个需要排除的风险。

**选择**: `configureThreadPool` 只锁定线程数；每次 `searchBest` 创建固定大小的局部 Rayon 线程池，通过 `install` 完成搜索，并在返回 JavaScript 前等待线程池销毁。

**理由**: 让 Native 搜索线程的生命周期严格包含在同步 Node-API 调用内，避免后台 Rayon 线程跨越 Worker 卸载边界，同时保持 1–32 的线程上限和确定性归约。

**影响**: 性能仍超过门槛，但访问冲突仍可复现；局部线程池不是完整修复，且加速由阶段 2 的约 15–20 倍下降到约 8–14 倍。

## 2026-08-02 17:43 阶段 3 no-go，禁止扩大 Rust shadow

**背景**: 15 请求短跑和一次 60 请求长跑可通过，但相同长跑及 2 路并发复跑会以进程级访问冲突崩溃。当前 Bridge 每个请求创建 Worker，并在收到消息后立即 `terminate()`；JavaScript 回退无法捕获 Native 卸载崩溃。

**选择**: 阶段 3 判定 no-go，保持 `AIR_RING_RUST_SHADOW` 默认关闭；在完成 Worker 生命周期修复和重新耐久验收前，不扩大影子观测，不允许 Rust 接管生产结果。

**理由**: 非确定性的进程崩溃优先级高于性能收益，且当前证据指向一次性 Worker 强制终止与 Native addon 卸载边界。

**影响**: 下一步推荐修改高风险 `calibrationBridge.ts` 为持久 Worker + 串行队列，或实现显式 graceful-shutdown 握手。根据项目安全规则，必须先获得用户明确确认。

## 2026-08-02 19:09 Calibration Worker 采用持久单 Worker + FIFO

**背景**: 用户明确授权修改 `calibrationBridge.ts`。阶段 3 证明每请求创建 Worker 并在 Native 响应后立即强制终止会非确定性触发 Windows `0xC0000005`，JavaScript 回退无法捕获进程级崩溃。

**选择**: 每个父进程惰性创建并复用一个 Calibration Worker；Promise 请求按 FIFO 串行，实时请求在忙时仍跳过。正常响应只解除当前请求，不终止 Worker；超时、发送失败或 Worker 异常才强制回收并重建。

**理由**: 保留既有业务背压语义，同时把 Native addon 生命周期从每个请求提升到父进程级，避免高频加载/卸载并将 CPU 预算限制在一个 Worker 的 4 个 Rayon 线程内。

**影响**: 2/4 路并发表示并发提交而非并行执行，排队请求的端到端延迟会增加；吞吐保持约 4.5–4.8 次/秒，但 CPU 核等效占用约 1.1–1.2，避免阶段 3 并行 Worker 的约 4.2 核峰值。

## 2026-08-02 19:09 使用 shutdown/ack 优雅关闭短生命周期子 Worker

**背景**: 历史标定本身运行在一次性 Worker 中；仅对空闲子 Worker 调用 `unref()`，父 Worker 退出时仍可能强制销毁子 Worker 和 Native addon。

**选择**: Calibration Worker 增加 shutdown/ack 消息，确认无活动或排队请求后关闭 `parentPort` 并自然退出；历史标定在清理数据库连接后显式等待该流程。

**理由**: 将 Native 卸载放到 Worker 自身正常事件循环退出路径，而不是由父环境强制终止。异常或 5 秒关闭超时仍保留强制回收作为故障兜底。

**影响**: 历史回放在返回后会多一次很短的关闭握手；生命周期测试和 420 次实际请求均未再出现访问冲突。

## 2026-08-03 00:40 Shadow 观测使用确定性限流和进程内熔断

**背景**: 阶段 4 已消除高频 Worker 卸载竞态，但直接扩大 shadow 仍缺少次数上限、异常自动停止和可审计的聚合日志边界。

**选择**: 在每个持久 Calibration Worker 内从首个请求开始按固定间隔采样；默认最多运行 100 次，连续 3 次失败、不可比或角度差超过 `1e-9°` 后熔断。策略只决定是否执行 Rust shadow，不改变 TypeScript `maxAngle`。

**理由**: 确定性采样便于复现和审计；Worker 级上限限制 CPU 与日志规模；连续异常熔断可在不依赖主进程控制面的情况下停止有风险的 Native 观测。

**影响**: 所有配置均通过显式环境变量启用并有严格边界，重建 Worker 会重置本 Worker 的观测预算；Rust 仍默认关闭且不能接管生产输出。

## 2026-08-03 00:40 Shadow telemetry 使用有序 NDJSON 与关闭前刷新

**背景**: 仅使用控制台日志难以形成稳定的受控观测报告，但写文件不能阻塞或破坏标定响应，也不能泄露原始厚度数据。

**选择**: 只有配置绝对日志路径时才按序追加 schemaVersion 1 NDJSON；记录仅包含时间、进程、观测状态和既有聚合 telemetry，不包含原始测点。写入错误被隔离，shutdown/ack 前等待队列刷新；离线工具只输出计数与延迟/差值聚合。

**理由**: 追加式 NDJSON 适合崩溃恢复和离线流式处理，有序 Promise 链提供低复杂度的 flush 语义；聚合输出降低数据暴露和报告体积。

**影响**: 未配置路径时保持控制台 telemetry；真实设备或生产环境采集仍需另行授权和 runbook 值守。

## 2026-08-03 20:30 真实环境观测采用技术预检与人工联机双门禁

**背景**: 阶段 5 已完成离线观测能力，但阶段 6 源码预检确认完整 Electron 应用启动会初始化 ADBox，并尝试连接上旋 S7；启动本身会改变外部设备连接状态。

**选择**: 将阶段 6 分为两道门禁。技术预检只检查 mise 工具版本、构建产物、活动进程、shadow 环境清洁度和绝对日志路径，不启动 Electron；技术通过后仍必须由现场人员确认值守、急停、设备窗口、自动控制停用和回滚责任人，用户再次授权后才可联机。

**理由**: “shadow 不覆盖 TypeScript 输出”只隔离算法结果，不能消除应用启动和设备连接副作用。双门禁能把可自动验证的本地条件与必须由现场承担的设备安全责任分开。

**影响**: 技术预检通过仅代表 `technicalReadyForOperatorConfirmation=true`，阶段 6 真实观测保持待确认；在人工门禁完成前不得自动启动应用。

## 2026-08-02 19:09 阶段 4 允许扩大串行 shadow 观测

**背景**: 正式 120 请求矩阵和追加 300 请求长跑全部成功，结果/telemetry/线程上限无差异，事件循环 P95 低于 100ms，且每场景只创建一个 Worker。

**选择**: 阶段 4 通过，后续可在显式环境开关下扩大串行 shadow 观测；`AIR_RING_RUST_SHADOW` 继续默认关闭，不允许并行 Native Worker，不允许 Rust 覆盖 TypeScript `maxAngle`。

**理由**: 新拓扑消除了已知卸载竞态并满足 CPU 与稳定性门槛，但 DS02 领域精度仍偏差 10.452°，且尚未完成部署环境的实际观测。

**影响**: 下一阶段应收集受控部署 telemetry 或单独修复 DS02；任何生产接管仍需新的明确决策。

## 2026-08-05 22:28 只读历史连接沿用数据库现有日志模式

**背景**: 更换后的旧历史库使用 `delete` journal mode；`readonly: true` 连接仍执行 `PRAGMA journal_mode=WAL` 会被 SQLite 视为写入并拒绝，导致历史回放在 Native 之前失败。

**选择**: `createReadOnlyConnection` 不再切换 `journal_mode`，改为显式设置 `query_only=ON` 并沿用数据库现有模式；主写连接的 WAL 初始化逻辑保持不变。

**理由**: 历史 Worker 的职责是只读查询，不应改变数据库持久化属性；WAL 数据库仍可按其现有模式并发读取，旧的非 WAL 样本也可安全回放。

**影响**: 只读 Worker 兼容 WAL 与非 WAL 历史库；本次只读复测确认数据库文件时间、长度和 journal mode 均未变化。

## 2026-08-05 Phase 7 迁移计算热点而保留 TypeScript 领域编排

**背景**: 现有 Rust shadow 只复现 `baseThetaDeg`，生产最终角度还依赖 loss landscape、direct fallback、H1/H2、group/time/global pulse challenger 和黄金分割收敛。一次性重写全部领域规则会放大回归风险。

**选择**: 定义可插拔搜索后端，将 direct/expanded 目标函数、粗/细搜索及最终收敛所需 loss 计算委托给 Rust；TypeScript 暂时保留输入清洗、扫描偏移展开、脉冲特征和已验证规则编排。Rust 同时返回与 TypeScript 顺序一致的 coarse loss 采样。

**理由**: 候选角度 × 测点计算是已量化的 CPU 热点；规则编排本身开销低但领域风险高。该边界取得主要性能收益，同时能逐数据集比较最终结果而非只比较初始搜索。

**影响**: Phase 7 获得 3.726 倍 Worker 中位加速且最终角度等价；未来若继续将规则编排迁入 Rust，必须继续保留相同诊断和逐规则等价门槛。

## 2026-08-05 Phase 7 mise 开发环境启用 primary，运行时保留回退

**背景**: DS01–DS05、历史样本、15+15 性能矩阵和 300 次持久 Worker 长跑均通过；用户使用 mise 管理开发环境并要求实际启用 Rust Native。

**选择**: Worker 仅在 `AIR_RING_RUST_PRIMARY=1` 时接管最终角度，任何 Native 加载、配置、执行、非有限/越界结果或扫描估算失败都重跑 TypeScript；primary 与 shadow 互斥。`mise.toml` 为项目开发环境设置 primary=1、4 线程和 Native 路径，非 mise/安装包环境仍默认关闭。

**理由**: 显式环境开关保留快速回滚和部署隔离；自动回退避免 Native 故障中断标定；mise 配置满足本机实际启用而不擅自改变安装包部署策略。

**影响**: 通过 mise 启动开发应用时默认走 Rust primary；设置 `AIR_RING_RUST_PRIMARY_DISABLE=1` 可在不修改 `mise.toml` 的情况下临时回滚。设备连接、角度边界和控制指令逻辑未修改。

## 2026-08-09 11:32 Phase 8A 采用 CSR Native Batch Shadow

**背景**: 膜泡 Batch 已有 CSR TypedArray 边界，但生产默认 48 bins 的 TypeScript 求解耗时很低；原 Bubble Worker 又采用每请求创建并强制终止的拓扑，不适合直接加载 Native addon。

**选择**: 先将 Bubble Worker 改为持久单 Worker + FIFO + shutdown/ack；Rust 直接接收 CSR 并在 Native 内完成正规方程、圆周 Tikhonov 和 Cholesky。仅通过 `AIR_RING_BUBBLE_RUST_SHADOW=1` 显式启用影子对比，TypeScript profile 保持唯一生产结果，RLS 不迁移。

**理由**: CSR 边界避免逐点调用和 N×N 稠密矩阵跨边界；持久 Worker 消除高频 addon 加载/卸载风险。48/96/180/360 bins 最终 profile 差异均为 0，300 次真实构建 Worker 稳定性通过。

**影响**: Phase 8A 可进入本机历史数据 shadow，但不自动启用。默认 48 bins 端到端中位加速约 1.13 倍，尚不足以成为默认主路径；180/360 bins 约 1.33/1.57 倍，可作为后续按规模动态路由候选。

## 2026-08-09 12:07 Phase 8B 通过，进入默认关闭的 Primary 候选阶段

**背景**: 合成数据没有覆盖历史病态矩阵；首次真实 shadow 因 Rust 在 Cholesky 回代中提前做非负截断，出现 5.82–11.56μm profile 差异。同时旧历史库缺少后续新增的 `thickness_raw.pos1`，且方向列命名存在版本差异。

**选择**: Cholesky 必须先完成完整无约束回代，再与 TypeScript 一致地统一截断负值；历史查询只读取稳定必要列并动态识别方向列名。修复后以 13 个有效 48-bin 历史 profile、零 Native failure、零 profile 差异和 3.04 倍完整重建中位加速作为 Phase 8C primary 候选门槛，但本阶段不修改 mise 或安装包默认值。

**理由**: 真实数据暴露了合成矩阵无法发现的算法顺序错误，说明 primary 前的历史 shadow 必不可少。修复后数值、性能、只读边界和 Worker 生命周期均通过；先进入带回退的候选阶段可继续隔离部署风险。

**影响**: Phase 8C 应增加与 shadow 互斥的默认关闭 primary 开关，任何 Native 或后处理异常都完整重跑 TypeScript，并完成历史双跑与 300 次长跑后才允许仅在 mise 开发环境启用。RLS 和安装包继续保持 TypeScript。

## 2026-08-09 13:17 Bubble Batch primary 仅在 mise 开发环境启用

**背景**: 默认 48-bin 合成收益较小，但同一历史窗口的 13 个有效 profile 全部精确等价，历史中位重建加速 1.2992 倍；300 次持久 Worker 长跑无 fallback、无数值差异或 Worker 重建。

**选择**: Bubble Worker 仅在 `AIR_RING_BUBBLE_RUST_PRIMARY=1` 且未设置 `AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 时让 Rust Batch 接管；primary 优先于 shadow。Native 加载、执行、返回校验或领域后处理失败时完整重跑 TypeScript。`mise.toml` 为本项目开发环境启用 primary，RLS、非 mise 和安装包继续使用 TypeScript。

**理由**: 历史和长跑同时满足等价、性能、只读及生命周期门槛；显式开发环境开关与禁用优先级提供即时回滚，完整 TS 重算保证 Native 故障不使膜泡重建中断。

**影响**: mise 启动的开发应用默认走 Bubble Rust Batch primary；临时设置 `AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 即可回滚。不得在安装包配置中加入该开关，后续迁移 RLS 或扩大部署范围需重新验收。

## 2026-08-09 14:10 历史 Bubble 查询在 Worker 内有界采样

**背景**: Phase 9 首次真实历史长跑的 primary 结果稳定，但 30 趟查询先通过 `.all()` 物化数百万行、跨 Worker 复制后才在父线程降至 2000 点，进程峰值 RSS 达约 3.84GiB。

**选择**: Query Worker 在同一只读事务内先取得每趟 COUNT，再使用有序 iterator 按既有 `floor(i*N/target)` 规则最多保留 2000 行；响应额外返回 `sourceRowCount`，避免丢失诊断中的原始行数。同步 fallback 暂不改动。

**理由**: iterator 保持与原 `downsampleUniform` 完全相同的输入点和顺序，同时把 JavaScript 对象数量从每趟数十万限制到 2000；只读事务保证 COUNT 与迭代器使用同一快照。

**影响**: 13 个历史 profile 哈希优化前后全部一致，峰值 RSS 降至约 143MiB。异步生产历史查询默认获得该优化；Query Worker 失败时的同步 fallback 仍保留原行为。

## 2026-08-09 14:10 重复稳定性与安装包部署广度分开验收

**背景**: 当前唯一历史数据库提供 13 个唯一有效 profile，77 次回放已证明 1001 次 primary 请求稳定，但重复执行不能替代跨设备、跨工艺或跨版本的数据广度。

**选择**: 将本机历史稳定性判定为通过，同时保持安装包默认关闭。安装包候选至少需要 3 个独立历史数据库，每个满足既有只读、等价和 Native fallback 门槛；RLS 继续留在 TypeScript。

**理由**: 长跑主要验证生命周期、确定性与资源趋势，独立数据集主要验证领域覆盖，两者风险不同，不能以请求总数互相替代。

**影响**: mise 开发环境继续启用 Bubble primary且保留单变量回滚；在获得至少 2 个额外独立样本前，不修改 electron-builder 或安装包环境。

## 2026-08-09 22:05 Phase 10 使用免开发环境目录包并默认启用 Native

**背景**: 现场工控机没有 Node/Rust/Visual Studio/mise，但应用需要从源码构建产物运行；用户明确要求 unpacked 默认生成 7z 并启用 Rust Native，同时指出 mise 不应成为团队构建依赖。

**选择**: 开发机通过 `pnpm build:field` 构建 Windows x64；Cargo 只从 PATH 解析，版本管理器不限。`better-sqlite3` 直接用 `prebuild-install` 下载当前 Electron ABI 的预编译 addon，electron-builder 禁止 npm rebuild，并用原生 `dir` + `7z` target 生成产物。打包主进程在创建 Worker 前设置两个 Rust primary 默认值和 4 线程；disable 开关优先。

**理由**: 工控机只解压运行完整目录可消除现场工具链和源码依赖；显式预编译下载避免 SQLite 本地 C++ 构建；electron-builder 自带 7z target，无需声明其内部压缩依赖。无设备自检与 sidecar 哈希在交付前验证 Native、SQLite 和文件完整性。

**影响**: Phase 9 的“三个独立历史库后再默认启用”保守门槛被用户的明确部署授权覆盖，但仍作为风险记录；Native 任一失败继续回退 TypeScript，并可通过 `AIR_RING_RUST_PRIMARY_DISABLE=1` 或 `AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 单独回滚。RLS 保持 TypeScript。

## 2026-08-09 Phase 11 采用基础运行时 + 原子 resources 内容包

**背景**: 调试和后续小版本发布会频繁构建、传输，但 Electron 运行时通常不变；重复传输完整 7z 成本高。只替换 `app.asar` 又会让 JavaScript、Rust addon、`app.asar.unpacked` 中的 Electron ABI SQLite 产物失去一致性。

**选择**: 将 Windows x64 Electron 目录作为低频基础层，将完整 `resources` 作为高频原子内容层。`pnpm build:content` 仍通过 electron-builder `dir` 形成权威 resources，但只用通用 7-Zip CLI 归档该内容和更新工具；完整现场包继续使用 electron-builder 原生 7z target。更新脚本直接用目标 `JJSK.exe` 在 `ELECTRON_RUN_AS_NODE=1` 下探测 Electron 精确版本和 modules ABI，逐文件校验 SHA-256，并采用同卷暂存、旧目录备份和失败恢复。

**理由**: electron-builder 的 7z target 面向完整应用目录，不能指定任意 resources 子树；因此 `7zip-bin` 在 Phase 11 具有独立的自定义内容归档职责，不再是完整包链路中的重复依赖。完整 resources 交换同时保持代码、Rust Native 和 SQLite ABI 一致，又避免触碰 `JJSK.exe`、DLL、pak 与 locale。

**影响**: Electron 36.9.5 / modules ABI 135 下，内容归档约 24 MiB，可直接更新已有完整目录且现场不需要开发环境。Electron、平台、架构或 ABI 改变时必须重新下发完整基础包。当前 SHA-256 只保证完整性；正式生产渠道仍必须增加发布签名/可信分发门禁。
