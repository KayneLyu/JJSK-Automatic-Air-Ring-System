# decisions.md — 技术决策记录

> 格式：`## [YYYY-MM-DD HH:mm] [决策标题]` + 背景 + 结论 + 原因

---

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
 1. `SOLUTION_GAP_THRESHOLD_DEG` 8°→15°
 2. `DIRECT_ACCEPT_LOSS_RATIO` 1.04→1.00
 3. 新增 `directMustBeSignificantlyBetter`
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
- 上游 typescript-eslint 短期内不会支持 TS 7(typescript-go 的 unstable/* API 与 TS 5 API 不兼容)

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
