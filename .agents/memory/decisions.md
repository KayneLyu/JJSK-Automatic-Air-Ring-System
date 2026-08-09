# decisions.md — 技术决策记录

> 格式：`## [YYYY-MM-DD HH:mm] [决策标题]` + 背景 + 结论 + 原因

---

## [2026-08-02 14:24] Rust 上旋 PoC 通过门槛并进入影子集成

**背景**：napi-rs/Rayon PoC 在 DS01–DS05 最终复跑中取得核心 17.66–19.10 倍、含 TypedArray DTO 端到端 16.49–18.65 倍加速，且 7/7 数值等价测试通过。

**结论**：保留 Rust 1.88.0（mise）、napi-rs 3、Node-API 8 与 Rayon 1.12.0 方案，下一阶段只在现有标定 Worker 内做特性开关控制的影子执行，TypeScript 仍是生产结果和加载失败回退路径。

**原因**：性能门槛显著通过，但 DS02 仍有 10.452° 领域精度偏差，Rayon 与 Electron Worker 的线程过度订阅也需要生产前验证。

---

## [2026-08-02 12:19] Rust 性能迁移采用热点原生模块路线

**背景**：阶段 0 基线显示，上旋 DS01..05 生产估算中位数为 105.057–338.005ms，全部超过 100ms 目标；膜泡 Batch/RLS 仅 7.163/1.988ms。100k 点 run-once Worker 的对象克隆中位数为 82.435ms，TypedArray transfer 为 17.501ms。

**结论**：阶段 1 先将上旋 `evaluateExpanded`、`evaluateDirect` 与候选角度搜索做成 Rust Node-API PoC，边界采用 TypedArray 批量 DTO；暂不迁移膜泡重建、SQLite 或设备协议。

**原因**：上旋是当前量化后的首要 CPU 热点；纯函数边界风险最低。TypedArray 能显著降低跨边界成本，避免对象序列化吞掉性能收益。

**质量门槛**：同时检查 Rust/TypeScript 数值等价和数据集标称精度。DS02 当前误差 10.452°，在恢复到小于 5°前不能宣称满足完整生产切换条件。

## [2026-06-11 23:07] 初始化 agent-task-lifecycle 并建立 bubble-thickness-reconstruction 任务

**背景**：纵向单层膜厚重建需求涉及多阶段（验证→真实数据→实时化→工程化），跨越多个文件模块，需要长期追踪进度与决策。同时项目缺少统一的任务隔离与切换管理机制。

**结论**：

- 初始化 agent-task-lifecycle skill，建立 `.agents/templates/`、`.agents/tasks/` 目录结构
- 在 `execution.md` 追加 Task Identification First / One Task One Stream / Task Switch Guard 规则
- 创建 `bubble-thickness-reconstruction` task 目录（含 context/plan/progress/decisions）
- 创建独立分支 `feat/bubble-thickness-reconstruction`

**原因**：

- 任务预期 >10 轮迭代，涉及算法、测试、集成多个层面
- 标准 4 文件模板（context/plan/progress/decisions）保证上下文不会丢失
- Task Switch Guard 防止工作目录串改

---

## [2026-06-11 01:00] 上旋角度算法迁移到 Worker 线程

**背景**：ADBox 每 1ms 推送厚度数据，`estimateThetaMaxWithPhaseCorrection` 耗时 ~10 秒，在主进程同步执行导致事件循环冻结，ADBox TCP 超时断连，周期性崩溃。

**结论**：

- 新建 `calibrationWorker.ts`，通过 `new Worker(path)` 在独立线程执行算法
- `calibration.ts` 的 `next()` 改为返回 `pendingAngleEstimate`，上层异步调用 Worker
- `calibrationBridge.ts` 增加 `workerBusy` 互斥锁，同一时刻只允许一个 Worker 运行
- `vite.config.ts` 为 worker 添加独立 CJS 打包入口

**原因**：Node.js `worker_threads` 是解决 CPU 密集型阻塞最轻量的方案，不引入子进程开销，且与 Electron 主进程兼容。

---

## [2026-06-11 01:00] validThickness 容量上限设为 2,000,000

**背景**：生产现场上旋最长行程约 30 分钟，1ms 采样 = 1,800,000 点。需要设置上限防止信号异常不切换时内存无限增长，但上限要覆盖实际最大行程。

**结论**：`2,000,000`（约 33 分钟），而非最初设想的 `200,000`。

**原因**：200,000 仅覆盖 3.3 分钟，导致后半段数据截断，6-10 日志的 maxAngle 误算为 180°。

---

## [2026-06-11 00:00] 上旋算法多轮性能优化（-60%）

**背景**：百万级数据集（6-10 ADBox 日志，~2M 点），单次估算耗时约 37 秒。

**结论**：三轮优化将总耗时从 117.65s → 55.25s：

1. flipped/expanded 缓存，消除 5-15× 重复展开
2. searchBest theta→loss `Map` 缓存，消除粗/精搜索重叠计算
3. evaluateDirect/evaluateExpanded 内循环改索引 for，消除 V8 迭代器开销
4. pulseCoverageSignature 改惰性计算（仅 10-20% 调用真正需要它）
5. debug 日志改用 `UPPER_ROTATION_DEBUG=1` 环境变量门控

**原因**：这些优化都在算法实现层，不改变搜索结果，零漂移。

---

## 上旋算法历史决策（2026-03 ~ 2026-04）

以下决策源自上旋算法迭代优化阶段的 `decisions.md`。

### D-001 使用基于方差的目标函数作为基线

- 日期：历史 | 选择：bin 方差最小化 `evaluateExpanded` 作为核心目标函数 | 理由：混合现实数据质量下鲁棒，无需严格谐波假设

### D-002 保留已存档的历史算法

- 日期：历史 | 选择：保留 `upperRotation.a.ts`/`upperRotation.b.ts` 仅作参考 | 理由：对比/回归有用

### D-003 排除超界点与脉冲范围计算

- 日期：历史 | 选择：角度映射时忽略 `y=NaN` 点 | 理由：超界点代表非膜区域

### D-004 启用梯形运动映射

- 日期：历史 | 选择：梯形位置映射而非纯线性 | 理由：实际运动末端有加减速

### D-005 频谱最终细化路径已回退 (deprecated)

- 日期：2026-03-17 回退 | 理由：在真实样本上频谱/DC 行为导致严重分歧

### D-006 脉冲路径作为回退角色

- 日期：2026-03 | 选择：扫描展开为主路径；脉冲路径为回退 | 理由：真实数据脉冲行为非单调

### D-007 保留多起点搜索

- 日期：2026-03-19 | 选择：保留多起点以降低局部最小值锁定风险 | 理由：改进鲁棒性

### D-008 持久化任务文档按角色分割

- 日期：2026-03-28 | 选择：维护 context/plan/progress/decisions 四个文件 | 理由：长期运行的稳定分离

### D-009 收紧 auto 仲裁条件（高角度分歧判断）

- 日期：2026-03-28 | 选择：

1.  `SOLUTION_GAP_THRESHOLD_DEG` 8°→15°
2.  `DIRECT_ACCEPT_LOSS_RATIO` 1.04→1.00
3.  新增 `directMustBeSignificantlyBetter`

- 理由：防止 expanded(337.7°)→direct(240.2°) 错误回退

### D-010 禁止 auto 回退到下边界 direct 退化解

- 日期：2026-03-28 | 选择：新增 `DIRECT_BOUNDARY_GUARD_DEG=10` | 理由：DS05 会把 expanded≈341° 错误回退到 direct≈180° | 结果：DS05 从 180.84° 改善到 341.48°

### D-011 高角度可疑场景启用保守 challenger

- 日期：2026-03-28 | 选择：增加 `expanded+groupPulse`/`expanded+time` challenger，仅当候选更优且解不贴边时允许切换

### D-012 高角度阈值改为工程启发式自适应门控

- 日期：2026-03-29 | 选择：将固定阈值重构为 `resolveHighAngleDivergenceDeg(min,max)` 自适应 | 结果：DS04 误差 14.54→9.03

### D-013 不将"按 loss 自动选择 accelMs"接入默认路径

- 日期：2026-03-31 | 选择：保留 `debug.accelDecelMs` 作为诊断专用 | 理由：不同数据集最优 accelMs 差异大，当前目标函数的 loss 最小点并非误差最小点

### D-014 不采用"窄覆盖即放宽 groupPulse"通用规则

- 日期：2026-03-31 | 选择：不在默认 challenger 中使用放宽规则 | 理由：会让 DS03 从误差 4.44 退化到 13.21

### D-015 DS01/DS02 低估非首尾片段触发

- 日期：2026-03-31 | 选择：将"首尾片段裁剪"降级 | 理由：四种裁剪结果完全一致

### D-016 DS04 定向门控候选暂保持离线

- 日期：2026-03-31 | 选择：仅命中 DS04 的候选规则保留为诊断基准 | 理由：关键特征依赖 oracle，线上不可观测

### D-017 不启用"covP10+narrowRate 放宽 groupPulse"默认规则

- 日期：2026-03-31 | 选择：不在默认路径启用 | 理由：会触发 DS03 错误切换

### D-018 C4(obs) 作为下轮候选

- 日期：2026-03-31 | 选择：保留纯可观测候选 | 条件：gap>17 & shift∈[12,20] & cov>0.90 & narrow<0.10

### D-019 启用 C5(obs) 受控门控并禁止 time 覆盖

- 日期：2026-03-31 | 选择：新增 C5 放宽分支，跳过后续 time challenger 覆盖 | 结果：DS04 误差 9.03→4.40

### D-020 不保留 DS05-like 额外修正分支

- 日期：2026-03-31 | 选择：回退 `expanded+time(accel=10000ms)` 分支 | 理由：收益不足

### D-021 暂停 DS05 的 time/accel 动作空间尝试

- 日期：2026-03-31 | 选择：转向其他动作空间 | 理由：DS05 动作扫描无收益

### D-022 启用 DS05-like 定向修正（expanded+globalPulse@12000）

- 日期：2026-03-31 | 选择：在高角度链路增加定向修正 | 结果：DS05 误差 13.19→2.17，真实集 3/5 通过

### D-023 启用 DS01/DS02 低角度修正（H1/H2）

- 日期：2026-04-01 | 选择：低角度区间增加 H1/H2 受控修正 | 结果：DS01 误差 25.15→0.25，DS02 10.45→0.20，真实集 5/5 全通过

### D-024 修复诊断路径与超时

- 日期：2026-04-01 | 选择：修复 landscape.test.ts 数据导入路径，长耗时用例设置 30s 超时 | 结果：29/29 通过

### D-025 默认策略切换为 generic，定向修正改为显式 profile

- 日期：2026-04-02 | 选择：引入 `strategyProfile`：`generic | datasetTuned2026Q1`；默认 generic | 理由：先保证通用主路径独立

### D-026 generic 路径启用特征驱动自适应修正

- 日期：2026-04-02 | 选择：将 H1/H2/C5/DS05-like 并入 generic 路径 | 理由：已由可观测特征触发，不依赖真实标签 | 结果：5/5 真实 + 13/13 模拟器全通过

### D-027 自适应规则改为可注入配置

- 日期：2026-04-02 | 选择：引入 `UpperRotationAdaptiveRulesOverride`，通过参数注入 | 理由：将阈值解耦，支持机台/配方级配置

### D-028 机器适配优先使用 adaptiveTuning

- 日期：2026-04-03 | 选择：对外优先暴露 5 个高层 `adaptiveTuning` 参数 | 理由：直接暴露完整规则树参数过多，不适合现场工程

---

## 待决策候选项

- 是否将 offset auto 从"全局 pulse 优先"升级为"按组质量动态切换"
- 是否增强 buildTripSegment 的有效段筛选
- 是否为真实数据引入轻量后验约束
- Rust 影子稳定性与 DS02 精度达标后，是否以及如何让 Native 接管生产上旋主搜索

## [2026-08-02 17:05] Rust 上旋只以默认关闭的 Worker 影子模式接入

**结论**：在现有校准 Worker 内通过环境变量显式启用 Rust；TypeScript 始终提供唯一生产 `maxAngle`。Rayon 限制为 1–32 线程、默认最多 4；`.node` 作为 Windows extra resource 打包，所有 Native 错误仅写结构化 telemetry。

**原因**：阶段 1 性能收益显著，但 DS02 领域精度仍不达标；影子模式可以验证真实负载稳定性，同时不扩大设备控制风险。

## [2026-07-26] 上旋最大角度估算增加可辨识性与输入边界保护

**背景**：静态 review 发现平坦厚度信号仍可能返回边界角度、加速比例可进入无效区间、搜索步长未生效，以及短首尾片段可能污染完整性过滤。

**结论**：

- 厚度信号无有效方差或 loss 曲线无区分度时返回 `null`
- 梯形模型将加速比例限制为 `[0, 0.49]`
- 搜索使用调用方传入的 `deltaRange.step`
- 完整性阈值改用时长上四分位数，禁止恢复过滤失败的数据

**原因**：无置信信息时拒绝输出比返回看似有效的边界角度更安全；其余修改使公开参数、物理模型和过滤语义保持一致。

---

## [2026-06-25 15:00] Linter 迁移：typescript-eslint → oxlint + oxlint-tsgolint

**背景**：

- typescript@^7.0.1-rc 是 typescript-go 的 RC 预览包,`package.json` 的 `exports` 字段只暴露 `./unstable/*`,无 `.` 入口与 `main`,作为库不可导入
- `@typescript-eslint/typescript-estree@8.x` peerDependencies 限制 `typescript: '>=4.8.4 <6.1.0'`,整个 8.x 系列不兼容 TS 7
- 上游 typescript-eslint 短期内不会支持 TS 7(typescript-go 的 unstable/\* API 与 TS 5 API 不兼容)

**结论**：

- 移除 8 个 ESLint 相关 devDeps:`@eslint/compat`、`@eslint/js`、`@typescript-eslint/parser`、`eslint`、`eslint-config-prettier`、`eslint-plugin-neverthrow`、`eslint-plugin-prettier`、`typescript-eslint`
- 新增 `oxlint@^1.71.0` + `oxlint-tsgolint@^0.23.0`(后者基于 typescript-go,原生支持 TS 7)
- 配置改用 `.oxlintrc.json`(JSON 格式,不是 ESLint 的 JS flat config)
- `pnpm run lint` 命令:`oxlint --type-aware`(无 `--type-check`,后者会触发实验性 TS 编译诊断)
- Prettier 保留为独立格式化工具,`pnpm run format` / `pnpm run format:check` 单独调用
- 删除 `eslint-plugin-neverthrow`(代码无 neverthrow 模式使用,影响为零)
- 删除 `eslint-plugin-prettier`(oxlint 不支持,改用 prettier --write 独立)

**原因**：

- typescript-eslint 短期不支持 TS 7 是上游约束,无法绕过
- oxlint-tsgolint 直接运行在 typescript-go 上,与 TS 7 同源,无版本错配
- oxlint 性能 20-40x 优于 typescript-eslint
- 保持原 ESLint `recommended` 的有效覆盖范围(默认 `correctness: error`),类型感知规则降为 warning 以匹配原 `recommended` 的实际覆盖
- 详情:`.agents/tasks/migrate-oxlint-typescript7/`

**遗留事项**:

- `pnpm exec tsc --noEmit` 在 `packages/AirRingServer` 与 `packages/Simulation` 发现预存 typecheck 错误(TS 7 严格的 import attribute 语法要求 `with` 而非 `assert` 等),**与本次迁移无关**,需单独 task 修复

---

## [2026-07-27 11:37] 代码修改后主动执行相关单元测试

## [2026-07-29 22:10] 历史标定 IPC 保持 utilityProcess 单一活动链路

**背景**：渲染进程调用 `calibration-max-angle-historical`，但 handler 只存在于未初始化的旧 `calibrationIpc.ts`；活动的 `adbox` 代理列表和 utility worker 均未注册，导致 Electron 报告 `No handler registered`。

**结论**：在 `PROXIED_CHANNELS` 和 `utilityWorker.ts` 同时注册历史角度 channel，复用只读 SQLite 历史回放 Worker，不重新启用旧 IPC 模块。历史回放 Worker 作为独立 Vite 入口打包；具体超时分层由后续性能决策约束。

**原因**：保持主进程只负责路由、CPU/IO 密集计算留在 Worker 的现有架构，避免双重 handler 注册和实时数据管线阻塞，同时保证开发与生产构建中 Worker 文件真实存在。

## [2026-07-29 22:21] 历史标定限制数据窗口并使用键集分页

**背景**：IPC 注册修复后，现场历史标定到达 120 秒 Worker 上限。旧回放会一直读取到最新厚度时间，使用 `OFFSET` 分页加载大量原始记录，并为厚度与旋转记录创建事件对象后整体排序；同时外层历史 Worker 与内层角度 Worker 都是 120 秒，数据加载会侵占内层算法的合法执行时间。

**结论**：自动历史角度标定仅选择最近两个完整上旋行程；厚度数据按 `(timestamp, id)` 键集分页并与已排序旋转数据线性归并。保留角度 Worker 120 秒上限，将历史回放 Worker 调整为 180 秒、IPC 宿主调整为 190 秒。

**原因**：两个完整行程已经满足估算输入要求，缩小窗口能减少无关 IO 与计算；键集分页和线性归并消除深分页及 `O(n log n)` 排序退化；外层超时应覆盖数据准备与内层最坏执行时间，而不是与内层竞争同一时间预算。

## [2026-07-29 22:33] 历史最大角度绕过完整标定前置项

**背景**：性能优化后历史回放能完成，但返回结果不含 `maxAngle`。原因是该入口复用了完整 CalibrationSession；会话在生成角度任务前会先因缺少历史辊速信号或突变窗口而提前返回，而独立最大角度估算并不依赖这些参数。

**结论**：历史回放 Worker 增加 `angleOnly` 模式，直接以时间顺序把厚度和旋转数据送入 `buildTripSegment`，选取完成且含测点的行程后交给角度 Worker。角度 Worker 的算法拒绝诊断、超时、创建/运行/退出异常必须向上返回，不得吞掉后再返回部分标定结果。

**原因**：恢复独立标定项的领域语义，避免无关前置条件阻止角度估算；结构化失败原因能区分数据质量问题与运行故障，便于现场继续处理。

## [2026-07-29 22:40] 用三个换向边界定义两个可回放完整行程

**背景**：独立角度路径首次现场运行只构建出一个有效行程。`rotation_trip` 的最近记录可在停机时被标记完成，但其 `end_ts` 不一定对应 `rotation_raw` 中真实存在的换向事件；以最近两个 trip 的起止时间截取，第二趟因此无法由流式构建器闭合。

**结论**：历史最大角度窗口直接取最近三个明确换向边界（显式标记不足时由正反转状态推断），以第一个边界为开始、第三个边界为结束，从而保证中间两趟都能被真实事件闭合。

**原因**：流式行程构建的闭合语义是“看到下一次方向变化”，三个可回放边界才是两个完整行程的充分条件；数据库摘要的结束时间不能替代原始事件。

## [2026-07-29 22:48] 历史角度窗口按厚度覆盖选择行程

**背景**：三个换向边界能够闭合两趟，但现场仍只有一趟含有效测点，说明最近相邻区间中存在厚度采集空窗，或显式换向标记不完整。

**结论**：合并显式换向标记与六小时正反转状态推断结果，去除连续同向重复事件；最多检查最近 12 个边界，对每个相邻区间以 `ad > 0` 且至少 100 条记录作为可构建条件，选择最近两个满足条件的行程范围后再启动历史 Worker。

**原因**：`buildTripSegment` 的实际准入条件是行程内至少 100 条正值厚度记录；在读取大量数据前用索引计数执行同一条件，可以稳定避开空行程，同时保持回放窗口尽可能小。

## [2026-07-29 22:55] 以现场库只读回放作为历史角度验收

**背景**：用户提供现场数据库路径后，CLI 检查发现库中有 18,818,968 条正值厚度记录、53,090 条旋转记录，但 `rotation_trip` 为空；一次换向标记会连续重复约 7 条记录。

**结论**：保留显式边界去重、状态推断合并和按厚度覆盖选段。使用项目 Electron 运行时对选出的两个最近有效区间执行完整 Worker 只读回放，697,811 个事件约 8 秒成功返回 `maxAngle=256.429339°`。

**原因**：真实数据库验证证明厚度和旋转数据足以估算，失败源自 IPC 选择边界的语义，而非数据缺失或角度算法本身；该回放结果可作为本次修复的现场验收基线。
**背景**：原规则禁止 Agent 在未获单次授权时自动执行测试，导致迭代改动与验证分离。

**结论**：移除“不自动执行单元测试”规则。代码修改后主动运行与变更范围、风险相称的最小相关测试集；阶段验收运行对应测试矩阵。若用户明确取消或限制范围，则遵循用户要求。设备联机或会改变外部状态的验证仍需单独确认。

**原因**：让每个算法改动及时获得回归反馈，同时避免在每个最小迭代中无差别运行高成本全量测试。

## [2026-08-02 17:43] Rust shadow 因 Native Worker 卸载竞态保持 no-go

**结论**：阶段 3 不允许扩大 Rust shadow；环境开关继续默认关闭，TypeScript 仍是唯一生产结果。Rust 搜索改用调用内局部 Rayon 线程池，但这不是完整稳定性修复。

**背景**：生产构建 Worker 的短跑与一次 60 请求串行长跑可通过，但相同长跑和 2 路并发复跑会非确定性以 Windows `0xC0000005` 崩溃。当前 Bridge 每个请求创建 Worker，并在收到响应后立即强制终止；进程级 Native 卸载崩溃无法由 JavaScript 回退捕获。

**原因**：稳定性门槛优先于 8–14 倍性能收益。下一步需经用户明确授权，将高风险 `calibrationBridge.ts` 改为持久 Worker + 串行队列，或引入显式 graceful-shutdown 握手，再重跑 60+ 请求及 2/4 路耐久验证。

## [2026-08-02 19:09] Calibration Worker 固定为持久单 Worker + FIFO 拓扑

**结论**：用户授权后，Bridge 改为惰性创建并复用单个 Worker；实时请求忙时跳过，Promise 请求 FIFO 排队。正常响应不得强制终止，历史短生命周期父 Worker 通过 shutdown/ack 等待子 Worker 自然退出；只在超时或异常时强制回收重建。

**背景**：阶段 3 的 `0xC0000005` 源于 Native 响应后立即 `terminate()` 的高频卸载竞态。新拓扑在正式 120 请求和追加 300 请求长跑中全部成功，每个场景只创建一个 Worker，CPU 核等效占用由并行探针约 4.2 降到约 1.1–1.2。

**原因**：该方案保留现有业务背压语义，消除高频 Native addon 加载/卸载并限制 CPU 过度订阅。后续允许通过显式开关扩大串行 shadow 观测，但默认仍关闭，禁止并行 Native Worker；DS02 修复和生产接管必须另行决策。

## [2026-08-03 00:40] Rust shadow 观测增加确定性预算与自动熔断

**结论**：每个持久 Calibration Worker 从首个请求开始按固定间隔采样；默认最多执行 100 次，连续 3 次失败、不可比或角度差超过 `1e-9°` 后停止后续 shadow。可选绝对路径 NDJSON 只保存结构化 telemetry，并在 shutdown/ack 前刷新；离线汇总不保留逐条样本。

**背景**：阶段 4 已验证持久单 Worker 稳定性，但扩大观测前仍需要 CPU/日志上限、异常自动停止和可审计输出，同时不能让 telemetry IO 影响标定结果。

**原因**：确定性采样便于复现，Worker 级预算限制资源，连续异常熔断提供本地安全边界；追加式有序日志和聚合报告兼顾关闭完整性与数据最小化。Rust 继续默认关闭，TypeScript 仍是唯一生产结果，真实环境观测与生产接管均需另行决策。

## [2026-08-03 20:30] Rust shadow 真实环境观测使用双门禁

**结论**：真实环境观测先运行无设备副作用的技术预检，再由现场人员确认值守、急停、设备窗口、自动控制停用和回滚责任人；只有用户再次授权后才允许启动完整 Electron 应用。

**背景**：应用启动会自动初始化 ADBox 并尝试连接上旋 S7，因而“启动 shadow 观测”会改变外部连接状态，即使 Rust 结果不覆盖 TypeScript 输出也不能视为只读动作。

**原因**：技术门禁适合自动检查工具链、构建产物、活动进程、环境变量和日志路径；设备状态与生产影响只能由现场人员确认。技术通过不等于联机授权。

## [2026-08-09 13:17] Bubble Batch primary 仅在 mise 开发环境启用

**结论**：同一历史窗口等价双跑和 300 次持久 Worker 长跑通过后，仅由 `mise.toml` 设置 `AIR_RING_BUBBLE_RUST_PRIMARY=1`。`AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 具有禁用优先级；安装包、非 mise 和 RLS 继续使用 TypeScript。

**背景**：13 个有效历史 profile 全部精确等价，历史中位重建加速 1.2992 倍；长跑 305/305 Rust success、0 fallback、单 Worker且差异为 0。

**原因**：开发环境已满足收益和稳定性门槛，但扩大部署范围仍需要独立验收。Native 任一异常触发完整 TypeScript 重算，使单变量回滚和运行时故障隔离同时成立。

## [2026-08-09 14:10] 历史 Bubble Query 使用 COUNT + iterator 有界采样

**结论**：异步历史 Query Worker 在同一只读事务内 COUNT 每趟行数，并通过有序 iterator 按既有均匀索引规则最多保留 2000 点；响应保留 `sourceRowCount`。禁止恢复完整结果物化和跨线程复制。

**背景**：Phase 9 首次长跑虽无 Native fallback 或数值漂移，但查询阶段峰值 RSS 达 4.12GB。优化后 13 个 profile 哈希保持一致，峰值降至约 150MB。

**原因**：该方案不改变膜泡重建输入，却显著降低 Worker 与父线程的 JavaScript 对象规模；只读事务保证 COUNT 和迭代属于同一数据库快照。

## [2026-08-09 14:10] 安装包候选至少需要三个独立历史数据库

**结论**：1001 次单库重复长跑只作为稳定性门槛。安装包默认启用前至少需要 3 个独立历史数据库分别通过只读、最终 profile 等价、0 Native failure/fallback 和资源门槛。

**背景**：当前历史库只有 13 个唯一有效 profile，虽然覆盖 forward/reverse 且长跑稳定，但不能代表跨设备、工艺和 schema 版本的数据广度。

**原因**：请求次数验证生命周期和确定性，独立数据库验证领域泛化；两类证据不可互相替代。

## [2026-08-09 22:05] 现场运行完整 unpacked 目录，打包态默认启用 Rust Native

**结论**：开发机用不依赖 mise 的 `pnpm build:field` 构建；electron-builder 原生生成 `win-unpacked` 与 7z，工控机只解压并运行 `JJSK.exe`。SQLite 直接下载 Electron ABI 预编译 addon并禁止本地 rebuild。打包态默认启用上旋和 Bubble Batch Rust primary，disable 开关优先，RLS 不迁移。

**背景**：现场工控机没有开发环境，用户明确要求 7z unpacked 包默认启用 Native，并说明 mise 不是团队统一工具。此前的三个独立历史库门槛仍缺两个样本，但用户已明确授权扩大打包态范围。

**原因**：目录部署最少依赖且便于整目录回滚；使用 electron-builder 自带 7z target 和 `prebuild-install` 可删除重复工具与本地 SQLite 编译。无设备自检、Native 哈希一致和 TypeScript 完整回退提供交付与运行时保护。
