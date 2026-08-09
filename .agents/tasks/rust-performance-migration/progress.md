# Progress: Rust 性能迁移

## 2026-08-02 12:06

- 识别为前一轮 Rust server 可行性评估的继续任务，当前工作区由用户明确指定。
- 完成阶段 0 初步探索：确认生产架构已使用 Electron utilityProcess、Worker Threads、SQLite WAL 和批量写入。
- 确认主要候选热点为上旋角度搜索/目标函数与膜泡重建矩阵求解。
- 开始建立不修改生产路径的离线性能基线。

## 2026-08-02 12:19

- 新增通用基准统计工具，记录 warmup/repeat、min/median/p95/max/mean/标准差以及进程内存快照。
- 新增阶段 0 离线基准，覆盖上旋 DS01–DS05、膜泡 Batch/RLS 和 100,000 点 Worker 对象克隆/TypedArray transfer。
- 正式配置为 1 次预热、3 次采样；报告写入 `scripts/outputs/performance-baseline.json`。
- 上旋估算中位数为 105.057–338.005ms，5 组均高于 100ms 实时目标；膜泡 Batch/RLS 为 7.163/1.988ms。
- Worker 一次性创建 + 100,000 点载荷端到端中位数：对象结构化克隆 82.435ms，TypedArray transfer 17.501ms。
- DS02 得到 309.748°，相对标称 320.2° 偏差 10.452°；既有真实数据回归确认同样失败（其余 4 组通过）。
- 基准测试通过；lint 通过但保留仓库既有 warnings；AirRingServer typecheck 被仓库既有错误阻断，本次新增文件不在错误列表中。

## 2026-08-02 13:52

- 用户要求继续下一步，识别为当前 `rust-performance-migration` 任务的阶段 1，不发生任务切换。
- 复核热点边界：`evaluateDirect` 与 `evaluateExpanded` 接收已展开片段，内部为候选角度 × 数据点的 bin 方差计算；`searchBest` 对同一 DTO 重复调用目标函数。
- 本机使用 mise 2026.7.12 管理 Node/pnpm，目前未安装 Rust；阶段 1 改为通过 mise 固定 Rust 1.88.0，不使用独立 rustup 安装流程。
- 阶段 1 保持影子 PoC，不修改生产估算、Electron 或设备控制路径。

## 2026-08-02 14:24

- 根目录新增 `mise.toml`，固定 Node 24.18.0、pnpm 10.18.3 与 Rust 1.88.0；安装并验证 Visual Studio Build Tools 2022 C++ 工具链。
- 新增私有 workspace 包 `packages/AirRingNative`，使用 napi-rs 3、Node-API 8 和 Rayon 1.12.0；原生二进制与 Cargo `target/` 已忽略。
- 实现 TypedArray 批量 DTO、完整边界校验、`evaluateDirect`、`evaluateExpanded` 和保持 TypeScript 决胜顺序的并行候选搜索。
- 数值等价测试覆盖合成边界与 DS01–DS05：7/7 通过；阶段 0 + 阶段 1 串行矩阵 9/9 通过。
- 最终正式复跑中位数显示 Rust 核心加速 17.66–19.10 倍，包含 DTO 的端到端加速 16.49–18.65 倍，阶段门槛全部通过。
- 既有真实数据回归仍为 DS01/03/04/05 通过、DS02 偏差 10.452° 失败；性能迁移未改变或掩盖该结果。
- Rust 单测 2/2、Clippy、Rust fmt 和仓库 lint 通过；AirRingServer typecheck 仍被既有 fft-js 类型、import assertions、confirmCount 与归档路径错误阻断，新增文件不在错误列表。
- 阶段 1 验收完成，允许进入阶段 2 影子集成；上线前仍需限制 Rayon 线程池并解决 DS02 领域精度。
- Native 包构建最终采用 Cargo release + `.node` 复制，不引入 npm 构建依赖；根 `pnpm-lock.yaml` 只新增空 workspace importer，未重解析既有依赖。

## 2026-08-02 15:02

- 用户要求继续下一步，识别为当前 `rust-performance-migration` 的阶段 2，不发生任务切换；目标语言按用户消息与现有 task 文档确定为中文。
- 探索确认最小接入点为 `apps/AirRingSys/electron/calibrationWorker.ts`；无需修改高风险的 `calibration.ts`、`calibrationBridge.ts` 或设备连接代码。
- 生产详细诊断已提供 `baseThetaDeg`、`objectiveUsed`、点数和最终结果，可用 Rust 对同一 DTO 的主搜索结果做影子比较，TypeScript `thetaMaxDeg` 继续作为唯一返回值。
- 阶段 2 计划落档，开始抽取共用 Native DTO、限制 Rayon 线程并实现默认关闭的影子遥测。

## 2026-08-02 17:05

- 抽取生产/benchmark 共用的 Native 片段归一化与 TypedArray DTO；Rust 新增幂等的 Rayon 全局线程池配置，限制为 1–32，Worker 默认最多 4 线程。
- `calibrationWorker.ts` 已接入默认关闭的 Rust 影子路径：TypeScript 始终提供唯一 `maxAngle`，Native 加载、配置和搜索异常只写结构化 telemetry。
- telemetry 记录目标函数、生产最终/base theta、Native theta/差值/loss、片段/点数、评估次数、线程上限和耗时，不包含原始测点。
- DS01–DS05 Rust 主搜索与 TypeScript `baseThetaDeg` 等价；相关 TypeScript 测试 20/20、Rust 单测 3/3 通过，Clippy、Rust fmt、Prettier 和仓库 lint 通过。
- 最新性能回归：Rust 核心加速 17.15–19.89 倍，含 DTO 端到端加速 15.48–19.59 倍，继续满足阶段门槛。
- Vite 生产构建通过；Windows unpacked 包已验证 `.node` 位于 `resources/native`，可由 Node 加载并导出阶段 2 的 5 个 API。
- 全量 Server/App typecheck 仍被仓库既有 `fft-js` 声明、旧 import assertion、历史无效导入/未使用变量等问题阻断，本阶段文件不在错误列表。
- 真实数据回归保持 4/5：DS02 仍偏差 10.452°，确认没有被 Rust 数值等价或影子集成掩盖。

## 2026-08-02 17:14

- 用户要求继续下一步，识别为当前 `rust-performance-migration` 的阶段 3，不发生任务切换；目标语言继续使用中文。
- 阶段 3 聚焦实际 Calibration Worker 的离线影子耐久和并发 CPU 预算，使用 DS01–DS05，不连接设备、不启动控制链路。
- 计划覆盖影子关闭串行、影子开启串行、2 路和 4 路并发，记录 P95、吞吐、CPU 核等效占用、RSS 与事件循环延迟。
- DS02 精度修复与性能稳定性验收保持分离，本阶段不修改生产上旋算法语义。

## 2026-08-02 17:43

- 新增实际构建 Worker 的离线耐久 benchmark 与 mise/pnpm 可复用执行脚本，覆盖关闭串行、开启串行、2 路和 4 路并发，报告不保存原始测点。
- 成功短跑场景的生产输出、Native/base theta、telemetry 和 4 线程上限均一致；事件循环 P95 最大 18.792ms，4 路并发吞吐 6.239 次/秒、CPU 核等效占用 4.244。
- 60 请求影子串行曾完整通过一次，但正式复跑以 Windows `0xC0000005` 非确定性崩溃；2 路场景也出现同类访问冲突。
- Rust 改为每次搜索使用局部 Rayon 线程池并等待退出，新增并发配置单测；访问冲突仍可复现，说明不能仅靠 Rayon 生命周期修复。
- 回归矩阵 20/20、Rust 单测 4/4、Clippy、Rust fmt、Native release build、Prettier 与 lint 通过；typecheck 仅保留仓库既有错误。
- 最新 Rust 核心加速 8.85–13.95 倍、含 DTO 端到端加速 7.91–14.19 倍，性能门槛仍通过；DS02 领域精度仍独立失败 10.452°。
- 阶段 3 稳定性验收判定 no-go，Rust shadow 必须继续默认关闭。下一步需用户明确授权修改高风险 `calibrationBridge.ts`，消除每请求创建 Worker 后立即强制终止的 Native 卸载竞态。

## 2026-08-02 18:54

- 用户要求继续下一步，视为明确授权修改高风险 `calibrationBridge.ts`，进入当前 `rust-performance-migration` 任务阶段 4，不发生任务切换。
- 复核现有语义：实时标定入口在 Worker 忙时跳过，历史 Promise 入口通过 100ms 轮询等待；两者目前均为每请求创建 Worker 并在响应后立即强制终止。
- 阶段 4 计划采用进程内持久单 Worker + FIFO 队列，保留实时忙时跳过和历史等待语义，并增加 shutdown/ack 以覆盖短生命周期的历史父 Worker。
- 目标语言依据用户消息和 task 文档继续使用中文；task 脚本与输出继续落在本任务 `scripts/` 与 `scripts/outputs/`。

## 2026-08-02 19:09

- 新增持久 Calibration Worker 客户端，统一惰性创建、FIFO、忙时跳过、超时、异常回收重建、创建计数和 shutdown/ack；Bridge 正常响应不再强制 `terminate()`。
- 历史标定 Worker 在只读连接清理后显式优雅关闭其嵌套 Calibration Worker，避免短生命周期父 Worker 强制卸载 Native addon。
- 生命周期单测覆盖单 Worker 复用、FIFO、实时忙时跳过、异常退出重建、超时重建和优雅关闭，3/3 通过。
- 正式耐久矩阵 120/120、追加影子串行 300/300 全部成功，各进程只创建 1 个 Worker；未再出现 Windows `0xC0000005`。
- 300 请求场景吞吐 4.788 次/秒，Native P95 10.793ms、shadow 总耗时 P95 11.644ms、事件循环 P95 26.755ms、CPU 核等效占用 1.136。
- benchmark 报告已移除逐次 `samplesMs` 并增加硬门槛，只保存聚合统计且不包含原始厚度测点。
- 完整回归 23/23、Rust 单测 4/4、Clippy、cargo fmt、Prettier、lint、Electron Node typecheck、Native/Vite build 通过；Server typecheck 仅剩仓库既有错误。
- 最新 Rust 核心/端到端加速为 11.30–14.67/10.15–14.53 倍；DS02 仍独立偏差 10.452°。
- 阶段 4 验收通过，允许后续在显式开关下扩大串行 shadow 观测；默认仍关闭，禁止并行 Native Worker 和生产接管。

## 2026-08-02 22:45

- 用户要求继续下一步，识别为继续当前 `rust-performance-migration` 任务，不发生任务切换。
- 阶段 5 进入“受控串行 shadow 观测”：增加确定性采样、单 Worker 次数上限、连续异常熔断、可选 NDJSON 和离线聚合。
- 保持 Rust 默认关闭、TypeScript 结果唯一生效；不修改设备控制、`calibrationBridge.ts`、`main.ts` 或部署环境。
- 目标语言依据用户消息与既有 task 文档继续使用中文；脚本与输出继续位于 task 的 `scripts/` 和 `scripts/outputs/`。

## 2026-08-03 00:40

- 新增受控观测模块：确定性每 N 次采样、单 Worker 默认 100 次上限、连续 3 次失败/不可比/超差熔断，以及严格环境变量边界。
- Calibration Worker 使用单个 stateful runtime；采样和熔断只控制 Rust shadow，TypeScript `maxAngle` 始终不变；shutdown/ack 前等待 telemetry flush。
- 可选 NDJSON 仅包含时间、进程、观测状态和既有 telemetry；写入错误隔离。新增离线聚合脚本、runbook 和不含原始样本的集成汇总。
- 策略/隔离/Worker 回归 28/28；实际 Worker 7 请求按 1/3/5 采样并在 3 次上限停止，3 条日志完整写入，单 Worker 复用。
- 实际 Worker shadow 3/3 success，角度差最大 0，Native P95 5.559ms、总耗时 P95 7.633ms；追加 15 请求耐久 15/15 通过。
- Rust 4/4、Clippy、fmt、Native/Vite build、Prettier、lint 和阶段文件独立 strict typecheck 通过；全量 typecheck 仅保留仓库既有错误。
- 最新 Rust 核心/端到端加速 11.44–16.78/11.98–16.78 倍，性能门槛继续通过。
- 完整上旋树当前 162/175：既有 DS02 10.452°，另有 9 个模拟器和 3 个 A/B 用例失败；本阶段未修改算法语义，作为独立生产接管阻断项保留。
- 阶段 5 离线验收完成；未执行真实设备/生产观测，Rust 默认关闭且生产接管继续 no-go。

## 2026-08-03 20:11

- 用户要求继续下一步，识别为继续当前 `rust-performance-migration` 任务，进入阶段 6 受控环境观测门禁与联机前预检，不发生任务切换。
- 只读预检确认当前没有 AirRing/Electron 进程、没有残留 `AIR_RING_RUST_SHADOW_*` 环境变量；Native addon、Calibration Worker 和主进程构建产物存在。
- 默认 `%LOCALAPPDATA%\JJSK\logs\rust-shadow.ndjson` 尚不存在，未读取或修改任何运行日志。
- 源码检索确认完整应用启动会初始化 ADBox，并尝试连接上旋 S7；直接启动应用会产生外部设备连接状态，不属于自动离线验证。
- 阶段 6 先建立无设备副作用的技术预检和人工门禁；真实联机观测需现场值守、设备状态与用户再次明确授权。
- 目标语言依据用户消息和既有 task 文档继续使用中文；task 脚本与报告继续写入本任务 `scripts/` 与 `scripts/outputs/`。

## 2026-08-03 20:30

- 新增阶段 6 技术预检脚本，只检查 mise 工具版本、构建产物哈希、活动应用进程、shadow 环境变量和日志元数据，不启动 Electron 或连接设备。
- 默认预检通过：Node 24.18.0、pnpm 10.18.3、Rust 1.88.0 匹配；三个必需构建产物存在；没有活动 AirRing/Electron 进程或残留 shadow 环境。
- 预检 JSON 数据最小化检查通过，不包含原始测点、设备地址、凭据或逐次样本字段；相对日志路径负向测试按预期被拒绝。
- 新增现场人工门禁，明确完整应用会自动初始化 ADBox/上旋 S7，并要求值守、急停、生产窗口、自动控制停用、停止条件与回滚责任人。
- 阶段 6 当前状态为“技术可进入人工确认”；尚未启动应用、建立设备连接或执行真实环境观测，等待用户在现场条件满足后再次明确授权。

## 2026-08-03 21:33

- 用户明确确认现场门禁已满足并授权启动真实环境观测；任务继续为 `rust-performance-migration` 阶段 6，不发生切换。
- 启动前技术预检再次通过，且未发现已有 AirRing/Electron 实例或残留 shadow 环境。
- 用户报告扫描重建 `reconstructForBaseline` 发生 `Maximum call stack size exceeded`，因此暂停启动新实例并先处理阻断异常。
- 根因是对大数组使用 `Math.min(...deltas)` / `Math.max(...deltas)`；同函数还存在脉冲范围展开和 `push(...pts)` 两处同类风险。
- 最小修复改为标量迭代范围统计和逐项追加，不修改算法公式、设备连接或运动控制逻辑。
- Prettier、Vite production build 和 lint 通过；App typecheck 未出现该文件错误，仅保留仓库既有类型错误。

## 2026-08-05 22:12

- 用户要求启用 Rust Native，识别为继续当前 `rust-performance-migration` 阶段 6，不发生任务切换；目标语言依据用户消息和既有 task 文档继续使用中文。
- 按既有现场授权和双门禁执行受控启动器，仅向本次 Electron 子进程注入 `AIR_RING_RUST_SHADOW=1`、Native 绝对路径及观测预算，没有修改 `mise.toml` 或系统/用户环境变量。
- 会话 `stage-6-live-session.json` 已生成，Electron 主进程 PID 36420 正在运行；配置为单持久 Worker + FIFO、4 线程、每 5 次采样、最多 100 次、连续 3 次异常或超差熔断。
- 启动后上旋 S7 与 ADBox 连接均超时/失败；应用未立即退出。Rust 只做影子比较，TypeScript `maxAngle` 仍是唯一生产结果。
- Native 在首个被采样的标定请求中惰性加载；截至记录时 shadow 样本数为 0，因此阶段 6 的真实观测验收仍保持未完成。
- task 启动脚本及会话输出继续位于 `.agents/tasks/rust-performance-migration/scripts/` 与 `scripts/outputs/`，任务未完成，不归档。

## 2026-08-05 22:19

- 用户补充本机全部测试均基于历史数据，识别为继续当前 `rust-performance-migration` 阶段 6，不发生任务切换；本机验收口径由设备联机观测调整为 SQLite 历史数据只读回放。
- 确认历史调用链为 `utilityWorker → historicalCalibrationWorker(angleOnly) → calibrationWorker → Rust Native`，子进程和 Worker 会继承显式 shadow 环境。
- 新增 `runRustShadowHistoricalObservation.ps1`，通过 Electron Node 运行时和只读历史 Worker 执行独立回放；不启动完整应用、不初始化 ADBox/S7，telemetry 仍不包含原始测点。
- 当前 `jjsk.db` 只读检查显示两条有厚度数据的 `rotation_trip` 摘要，但 `rotation_raw` 仅包含 reverse→forward 一次真实方向变化；回放 821,254 条厚度、2,029 条旋转记录后只能闭合 1 个有效行程。
- 历史 Worker 按预期返回“未能构建至少 2 个有效上旋行程”，请求未进入 Calibration Worker，因此本次没有 Native telemetry；这不是 Native 加载或执行失败。
- 根据既有领域决策，不使用可能是停机估算的 `rotation_trip.end_ts` 伪造换向；需要包含至少 3 个真实方向状态边界、可闭合 2 个有效行程的历史数据后重跑。
- 目标语言依据用户消息与既有 task 文档继续使用中文；任务脚本和输出位于本 task 的 `scripts/`、`scripts/outputs/`，任务保持 active，不归档。

## 2026-08-05 22:28

- 用户更换历史样本后要求复测，识别为继续当前 `rust-performance-migration` 阶段 6，不发生任务切换；目标语言继续使用中文。
- 新 `jjsk.db` 为 1.26 GB，包含 18,818,968 条有效厚度记录、53,090 条旋转记录和 230 条显式换向；选取最近两个可闭合行程，共回放 697,811 个事件。
- 首次复测发现旧库处于 `delete` journal mode，只读连接执行 `PRAGMA journal_mode=WAL` 导致 `attempt to write a readonly database`；最小修复为沿用现有日志模式并设置 `query_only=ON`。
- 重新构建 Electron Workers 后历史回放成功，生产 `maxAngle=256.42933913413344°`；Rust 使用 `expanded` 目标，Native 与 TypeScript `baseThetaDeg=256.36666666666645°` 完全一致，绝对差为 0°。
- Native 搜索 100,000 个降采样点、380 次评估、4 线程，耗时 92.1361 ms；含归一化/DTO 的 shadow 总耗时 125.6758 ms。核心低于 100 ms，总路径在该大样本上超过 100 ms，保留为后续优化项。
- 单条 telemetry 状态为 `success`，观测按一次预算进入 `maxRunsReached`；聚合报告数据最小化检查通过，不含 `measurements`、`tripSegments` 或 `samplesMs`。
- 数据库文件时间与长度未变化，journal mode 仍为 `delete`；Vite build、Electron Node typecheck 和 lint 通过，lint 仅有仓库既有 warnings。整文件 Prettier 扩大差异已撤回，最终 `service.ts` 保持 4 行增删的最小补丁。
- task 脚本与报告继续位于 `.agents/tasks/rust-performance-migration/scripts/` 和 `scripts/outputs/`；阶段 6 历史数据观测验收完成，生产接管仍保持 no-go，任务暂不归档。

## 2026-08-05 Phase 7 启动

- 用户要求将上旋角度相关逻辑迁移到 Rust Native，识别为继续当前 `rust-performance-migration` 任务，不发生任务切换；目标语言继续使用中文。
- 代码复核确认现有 Native shadow 仅复现初始 `baseThetaDeg`，生产 `maxAngle` 仍经过 TypeScript 自适应候选选择和黄金分割收敛。
- Phase 7 采用可插拔搜索后端：把候选角度目标函数、粗/细搜索和最终 loss 计算迁移到 Rust，暂时保留输入清洗、偏移展开、脉冲特征和领域规则编排。
- Calibration Worker 将增加默认关闭的显式 primary 开关；Native 加载、执行或无有效结果时自动回退 TypeScript，且不修改设备连接、控制器或控制指令边界。

## 2026-08-05 Phase 7 完成

- 新增可插拔上旋搜索后端；TypeScript 保留数据准备、脉冲特征和领域规则编排，所有候选角度粗/细搜索及最终收敛 loss 计算由 Rust Native 执行。
- Rust 搜索新增有序 coarse loss 采样，保持 landscape、direct fallback、H1/H2 和高角度 challenger 的输入语义；DS01–DS05 最终 theta、规则列表、拒绝状态与 TypeScript 等价。
- Calibration Worker 增加 `AIR_RING_RUST_PRIMARY=1`、1–32 线程边界、结构化成功/回退 telemetry，以及 Native 加载、执行、越界或无扫描结果时的 TypeScript 重算；primary 与 shadow 互斥。
- 15+15 同拓扑性能对比全部通过：TypeScript 中位 227.071ms，Rust primary 中位 60.940ms，加速 3.726 倍，2 倍硬门槛通过。
- 300 次持久单 Worker 长跑 300/300 成功、0 fallback、0 角度差；请求 P95 95.053ms，事件循环 P95 17.498ms，RSS 峰值约 327MiB、结束增量约 55MiB，未呈线性增长。
- 新历史窗口只读双跑通过：TypeScript 与 Rust primary 均为 `256.42933913413344°`，差值 0°；primary 状态 success、4 线程、未连接设备或修改数据库。
- `mise.toml` 在本项目开发环境启用 Rust primary、4 线程和 Native 绝对路径；`AIR_RING_RUST_PRIMARY_DISABLE=1` 可临时回滚，Worker 代码在非 mise 环境仍默认关闭，并始终保留 TypeScript 回退。
- Rust 5/5、关键 Vitest 28/28、Electron Node typecheck、Native/Vite build、Clippy、fmt 和 lint 通过；Server 全量 typecheck 仅保留既有错误，lint 仅保留既有 warnings。

## 2026-08-09 11:32 Phase 8A 完成

- 用户要求继续 Phase 8，识别为当前 `rust-performance-migration` 的延续，不发生任务切换；目标语言继续使用中文。
- 膜泡 Worker 从每请求创建/立即终止改为惰性持久单 Worker + FIFO；正常响应只解除请求，超时、发送失败和异常退出才强制回收，并增加 shutdown/ack 自然退出协议。
- Rust Native 新增 CSR Batch 求解，完整校验 M/N、offset、列索引、TypedArray 长度、有限数值和正则参数，并在 Native 内构建正规方程、圆周 Tikhonov 和 Cholesky。
- Worker 增加默认关闭的 `AIR_RING_BUBBLE_RUST_SHADOW=1` 路径；TypeScript 保持唯一生产结果，Native 加载或执行失败仅返回结构化 telemetry，RLS 保持 TypeScript。
- 48/96/180/360 bins 的 solver 与最终 profile 最大差异均为 0；端到端中位加速分别约 1.13/1.13/1.33/1.57 倍。
- 真实构建 Worker 连续 300/300 成功、shadow 300/300、只创建 1 个 Worker、最大 profile 差异 0；请求 P95 1.464ms，事件循环 P95 14.631ms。
- 收口复跑 Rust 7/7、关键 Vitest 33/33、Clippy、fmt、Native build、Electron Node typecheck 和 Phase 8 文件 Prettier 检查全部通过。
- Phase 8A 完成但默认 48 bins primary 暂不启用；下一步进入本机历史数据 Bubble Shadow，只读验证真实生产规模。

## 2026-08-09 12:07 Phase 8B 完成

- 从下载目录的 `jjsk.zip` 找回与 Phase 6 一致的 1.26 GB 历史库，解压到系统临时目录；从既有现场日志恢复 W=1016mm、θmax=256.4°、airAD=52000、gain=1.45、τ=139815ms，并按 0–17000 pulse 恢复 mmPerPulse。
- 新增 Electron-Node 历史观测入口和 mise 友好的 PowerShell 启动器；实际路径为 `bubbleQueryWorker → buildProfileAsync/sweepProfileBuilder → persistent bubbleWorker`，不启动完整 Electron、不初始化 ADBox/S7，输出不含原始测点或 profile 数组。
- 将漏构建的 `bubbleQueryWorker.js` 纳入 Vite，并使其只查询切趟/膜厚所需稳定列；通过 `PRAGMA table_info` 同时兼容驼峰和下划线方向列，避免旧库缺少 `thickness_raw.pos1` 时只读回放失败。
- 首轮历史 shadow 暴露 Rust 在 Cholesky 回代过程中提前截断负值的问题，最大 profile 差异达 11.56μm；修复为完成无约束回代后统一非负截断，并增加可复现错误结果 0.5/正确结果 1.0 的 Rust 回归测试。
- 扩展到最近 50 个换向区间后查询到 30 个有测厚覆盖的 sweep，其中 13 个形成有效 profile；13/13 Rust shadow success、0 Native failure、最大 profile 差异 0，持久 Worker 创建数 1。
- 真实 48-bin 历史输入的 TypeScript/Rust 完整重建中位耗时为 0.2642/0.0869ms，加速 3.0403 倍；求解中位加速 1.5798 倍。其余 13 趟被 TypeScript 领域门槛拒绝、4 趟无有效测量抛错，不属于 Native 失败。
- 数据库及 rollback journal 格式前后不变，主文件与 sidecar 长度、修改时间和 SHA-256 快照一致；最终聚合报告为 `phase-8b-history-20260809-120624.json`，判定 `go-primary-candidate`，但尚未启用 primary。
- Rust 8/8、Clippy、fmt、Native build、关键 Vitest 33/33、Electron Node typecheck、完整 Vite build、Phase 8 合成矩阵和 300 次持久 Worker soak 全部通过；合成 48-bin 端到端中位加速更新为 1.1547 倍。

## 2026-08-09 13:17 Phase 8C 完成

- 用户要求继续既定内容，识别为继续当前 `rust-performance-migration`，不发生任务切换；目标语言继续使用中文。
- Bubble Worker 增加默认关闭的 `AIR_RING_BUBBLE_RUST_PRIMARY=1`，`AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 具有禁用优先级；primary 与 shadow 互斥，RLS 保持 TypeScript。
- Native 加载、执行、结果长度/有限值及领域后处理任一失败时，同一请求完整重跑 TypeScript 并返回结构化 fallback telemetry；聚焦测试覆盖成功、加载失败、非法结果、禁用和 RLS 路径。
- 同一历史窗口双跑 30 趟，13 个有效 profile 的 SHA-256 指纹全部精确匹配，拒绝/失败语义一致；Rust primary 13/13 success、0 fallback，两边 Worker 创建数均为 1。
- 历史重建中位耗时由 3.6264ms 降至 2.7912ms，加速 1.2992 倍；数据库、sidecar 哈希和 rollback journal 格式保持不变。聚合报告为 `phase-8c-history-20260809-131552.json`。
- 300 次持久 Worker primary 长跑通过（另有 5 次预热）：305/305 Rust success、0 fallback、单 Worker、最大 profile 差异 0；中位耗时 0.8634ms，较 TS 基线 1.0686 倍，事件循环 P95 15.3846ms，RSS 未呈线性增长。
- `mise.toml` 仅在项目开发环境启用 Bubble primary；设置 `AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 可即时回滚。安装包/非 mise 环境未设置开关，继续默认 TypeScript。
- Electron Node typecheck、Vite build、Phase 8 完整 Vitest 38/38、Prettier 和 Rust 8/8 通过；完整 Electron 与 ADBox/S7 均未启动。

## 2026-08-09 14:10 Phase 9 本机历史稳定性完成

- 用户要求继续既定内容，识别为继续当前 `rust-performance-migration`，不发生任务切换；目标语言依据用户消息和现有 task 文档继续使用中文。
- 历史观测入口增加 1–200 次有界重复回放，输出聚合 attempted/valid/rejected/failed、唯一 profile 哈希、hash 漂移、事件循环和 RSS 趋势；默认 repeat=1，Phase 8C 行为保持兼容。
- 首次 77 次长跑虽通过 1001/1001 primary、0 fallback、0 hash 漂移，但暴露 Query Worker 先物化完整扫描行再降采样，峰值 RSS 达 4,122,468,352 bytes。
- Query Worker 改为同一只读事务内先 COUNT，再通过 iterator 按既有 `floor(i*N/target)` 索引规则最多保留 2000 行；增加 `sourceRowCount`，历史报告仍保留原始行数，最终 profile 哈希与优化前 13/13 完全一致。
- 优化后最终长跑覆盖 30 趟、13 个唯一有效 profile（forward 7/reverse 6），77 次回放共 2310 次尝试、1001 次 Rust primary success、0 fallback、0 hash 漂移、单 Worker。
- Rust 重建中位/P95 为 0.0871/0.3853ms，生产链中位/P95 为 1.0842/1.8563ms，事件循环 P95 16.0809ms。
- 峰值 RSS 降至 149,807,104 bytes（较首次约下降 96.4%），低于 512MiB 门槛；结束较 replay 起点仅增加 4,333,568 bytes，趋势约 96,491 bytes/pass。
- 数据库、sidecar 哈希与 rollback journal 格式前后不变；完整 Electron、ADBox/S7 均未启动。最终报告为 `phase-9-history-soak-20260809-140836.json`。
- Phase 9 本机重复稳定性判定 `pass`；独立历史数据库仅 1 个，安装包部署判定继续为 `keep-installer-default-off-insufficient-independent-datasets`，mise primary 配置不变，RLS 不迁移。
- Phase 9 Vitest 41/41、Rust 8/8、Electron Node typecheck、Prettier 和 Vite build 通过。

## 2026-08-09 22:05 Phase 10 现场免开发环境发布包完成

- 用户明确要求 mise 仅作为个人开发环境管理工具；Native PowerShell 构建改为从 PATH 查找 Cargo，其他开发者可使用任意版本管理方式。
- 根目录新增 `pnpm build:field`：构建 Rust release，直接以 `prebuild-install` 下载当前 Electron ABI 的 `better-sqlite3` addon，并禁止 electron-builder 本地 rebuild。
- electron-builder 原生 `dir` + `7z` target 同时生成 `win-unpacked` 与约 99MiB 的 7z；不再直接依赖或调用 `7zip-bin`。
- 打包态默认启用上旋 Rust primary、4 线程和 Bubble Batch Rust primary；两个 disable 开关仍可单独回滚，Native 故障继续完整回退 TypeScript，RLS 不迁移。
- 打包自检不加载 `main.ts`、不初始化 ADBox/S7；实际验证上旋导出、Bubble 求解、SQLite 内存查询、7 个入口文件和 Native 源/包哈希。
- 最终相关 Vitest 52/52、Rust 8/8、严格生产文件 typecheck、Electron Node typecheck、Prettier、Vite/packaging、自检及 7z 签名/哈希门禁通过。

## 2026-08-09 Phase 11 内容分层发布完成

- 用户要求在 Electron 不变时仅传输应用内容；识别为继续当前 `rust-performance-migration`，不发生任务切换，目标语言继续使用中文。
- 新增根目录 `pnpm build:content`，构建 Rust Native、使用 `prebuild-install` 准备 Electron ABI SQLite、执行 Vite 与 electron-builder `dir`，但只归档完整 `resources`、清单和更新工具。
- 内容版本独立于应用版本；默认包含 Git/dirty/UTC，正式候选可用 `AIR_RING_CONTENT_VERSION` 显式指定。清单记录 Electron 36.9.5、modules ABI 135、51 个 payload 文件及逐文件 SHA-256。
- 完整包仍使用 electron-builder 原生 7z；内容子目录无法由该 target 单独归档，因此 `7zip-bin` 仅承担 Phase 11 自定义 resources 7z 与 `7z t`，职责不重复。
- PowerShell 5.1 更新脚本拒绝运行中的 JJSK，使用真实目标 `JJSK.exe` 探测 Electron/ABI，内置 .NET SHA-256 与路径逃逸/重解析点检查，并以同卷暂存、旧 resources 备份、失败恢复完成交换。
- `pnpm verify:content` 在系统临时目录复制完整基础包并真实应用内容，确认 Electron 运行时哨兵哈希不变、备份存在、更新后 Rust/SQLite 自检通过，同时错误 Electron 版本在写入前被拒绝。
- 最终内容 7z 为 24,286,956 bytes，完整包为 103,169,923 bytes，传输量为 23.54%，减少 76.46%；内容 SHA-256 为 `3d6585e9ca63f4115936058240d11f428553ae941f09054dcab3d94380ea7b97`。
- 当前 SHA-256 只提供完整性，不提供发布身份认证；正式内容发布沿用该分层，但必须增加签名/可信分发门禁。任务继续 active，RLS、DS02 与独立样本风险未归档。
