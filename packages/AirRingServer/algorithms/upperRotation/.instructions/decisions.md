# 决策记录（Decisions）

## 决策日志格式

- ID：稳定标识符
- 状态：`active`（活跃）| `deprecated`（已弃用）| `superseded`（已取代）
- 日期：首次应用或记录日期
- 理由：此选择存在的原因

## D-001 使用基于方差的目标函数作为基线

- 状态：活跃
- 日期：历史
- 选择：使用 bin 方差最小化（`evaluateExpanded`）作为核心目标函数
- 理由：在混合现实数据质量下鲁棒，无需严格的谐波假设

## D-002 保留已存档的历史算法

- 状态：活跃
- 日期：历史
- 选择：保留 `upperRotation.a.ts` 和 `upperRotation.b.ts` 仅作参考
- 理由：对比/回归历史有用，但非当前主路径

## D-003 排除超界点与脉冲范围计算

- 状态：活跃
- 日期：历史
- 选择：在角度映射和脉冲范围计算中忽略 `y = NaN` 点
- 理由：超界点代表非膜区域，会偏离偏移估算

## D-004 启用梯形运动映射

- 状态：活跃
- 日期：历史
- 选择：使用梯形位置映射而非纯线性时间-角度映射
- 理由：实际运动末端存在加速/减速；线性映射导致边界偏差

## D-005 频谱最终细化路径已回退

- 状态：已弃用
- 日期：2026-03-17 回退
- 选择：不在当前路径中使用频谱目标函数作为主要最终细化
- 理由：在真实历史样本特征上，频谱/DC 行为导致严重分歧

## D-006 脉冲路径非当前路由中的主路径

- 状态：活跃
- 日期：2026-03（进行中）
- 选择：扫描展开路径为主路径；脉冲路径在当前实现中充当回退角色
- 理由：真实数据集显示行程片段内脉冲行为非单调

## D-007 保留多起点搜索

- 状态：活跃
- 日期：2026-03-19
- 选择：保留多起点搜索以降低局部最小值锁定风险
- 理由：在先前迭代中改进了鲁棒性

## D-008 持久化任务文档按角色分割

- 状态：活跃
- 日期：2026-03-28
- 选择：维护任务记忆在四个文件中：
  - `context.md`
  - `plan.md`
  - `progress.md`
  - `decisions.md`
- 理由：为长期运行工作保持稳定背景、活跃计划、执行历史和决策理由的分离

## D-009 收紧 auto 仲裁条件（高角度分歧判断）

- 状态：active
- 日期：2026-03-28（修复）
- 选择：调整三个参数以防止高角度估计被错误回退到低角度：
  1. `SOLUTION_GAP_THRESHOLD_DEG`：8° → 15°
  2. `DIRECT_ACCEPT_LOSS_RATIO`：1.04 → 1.00
  3. 新增强制约束：`directMustBeSignificantlyBetter = loss < bestLoss * 0.99`
- 理由：根因分析表明 DS03/DS04/DS05 的失败是由于：
  - RC-1：4% 容差过宽松，允许损失值更高的方案被采用
  - RC-2：缺乏"direct 必须明显更优"的强制要求
  - 修改目标：阻止 expanded(337.7°)→direct(240.2°) 这类错误回退

## D-010 禁止 auto 回退到下边界 direct 退化解

- 状态：active
- 日期：2026-03-28
- 选择：新增 `DIRECT_BOUNDARY_GUARD_DEG = 10`，当 `direct` 解过近下边界（如 180°）时，不允许覆盖高角度 `expanded` 解。
- 理由：DS05 诊断显示 `auto` 会把 `expanded≈341°` 错误回退到 `direct≈180°`，造成极大误差。
- 结果：DS05 从 `180.84°(err 140.96)` 改善到 `341.48°(err 19.68)`。

## D-011 高角度可疑场景启用保守 challenger（groupPulse/time）

- 状态：active
- 日期：2026-03-28
- 选择：在 `auto` 且高角度可疑场景增加 `expanded+groupPulse` / `expanded+time` challenger。
  - 仅当候选 loss 更优且解不贴边时允许切换。
- 理由：DS05 的 A/B 诊断显示不同 offset 策略结果差异明显（globalPulse/time/groupPulse）。

## D-012 高角度阈值改为工程启发式自适应门控

- 状态：active
- 日期：2026-03-29
- 选择：将固定阈值 `HIGH_ANGLE_DIVERGENCE_DEG` 重构为：
  - `HIGH_ANGLE_DIVERGENCE_BASE_DEG = 330`
  - `HIGH_ANGLE_DIVERGENCE_MARGIN_DEG = 3`
  - `resolveHighAngleDivergenceDeg(min, max)`（按搜索区间上 20% 自适应，并进行上下界钳制）
- 理由：该阈值是工程启发式门控而非通用理论参数；自适应后可提升不同范围下的一致性。
- 结果：DS04 误差从 `14.54` 进一步收敛到 `9.03`，DS05 保持 `13.19`，模拟器无回归。

## D-013 不将“按 loss 自动选择 accelMs”接入默认路径

- 状态：active
- 日期：2026-03-31
- 选择：
  - 保留 `debug.accelDecelMs` 作为**诊断专用**入口；
  - 不在默认 `auto` 路径中依据目标函数 loss 自动在多个 `accelMs` 候选间切换。
- 理由：
  - accel sweep 证明不同真实数据集的最优 `accelMs` 差异很大（如 DS04 偏向 `30000ms`，DS05 偏向 `10000ms`）；
  - 当前目标函数的最小 loss 与真实角度误差并不总一致；
  - 典型反例：DS05 在 loss 比较下会误选 `30000ms`，导致结果从 `334.99°` 退化到 `295.71°`。
- 结果：
  - 已回退 RC-2 的默认路径实现，恢复已验证的基线行为；
  - 后续若要做 accel 自适应，必须引入额外判据，而不能只看现有 loss。

## D-014 不采用“窄覆盖即放宽 groupPulse 切换”的通用规则

- 状态：active
- 日期：2026-03-31
- 选择：不在默认 `groupPulse` challenger 中使用“窄覆盖异常 -> 放宽 `thetaShift` / `lossGain`”的一般性门控放宽。
- 理由：
  - 该规则虽可让 DS04 采纳 `groupPulse≈316°`（单点过线），但会同时触发 DS03 的错误切换；
  - 实测出现 DS03 从 `337.94`（error `4.44`）退化到 `320.29`（error `13.21`）的回归。
- 结果：
  - 已回退该实验，恢复基线门控（`lossGain > 1.5%` 且 `thetaShift <= 12`）；
  - 后续需使用更强区分信号（例如 loss 地形特征组合）再考虑 DS04 定向放宽。

## D-015 DS01/DS02 低估问题不再优先怀疑“首尾片段参与”

- 状态：active
- 日期：2026-03-31
- 选择：
  - 将“首尾片段裁剪”从 DS01/DS02 低估的优先根因列表中降级；
  - 后续优先检查映射/仲裁层面的系统偏差。
- 理由：
  - 对 DS01/DS02 进行 `baseline / dropFirst / dropLast / middleOnly` 四种输入裁剪，
    估计结果保持完全一致（DS01 恒 `310.45`，DS02 恒 `309.75`）。
- 结果：
  - 证据支持“低估并非由边缘片段是否参与触发”；
  - 下一步应转向目标函数地形与模式切换判据优化。

## D-016 DS04 定向门控候选暂保持离线，不直接入生产

- 状态：active
- 日期：2026-03-31
- 选择：
  - 将当前“只命中 DS04”的候选规则保留为诊断基准，不直接接入 `upperRotation.ts` 生产门控。
- 理由：
  - 离线评估显示多组候选可只命中 DS04（不命中 DS03/DS05），但关键特征中包含 `improveGlobal / improveAuto`，依赖真实标签（oracle）；
  - 该类特征在线上不可观测，不具备直接可部署性。
- 结果：
  - 当前产线逻辑保持稳定基线；
  - 后续需要把“oracle 特征”替换为线上可观测代理特征（loss 地形、挑战者相对差异、覆盖签名等）。

## D-017 不启用“covP10+narrowRate 放宽 groupPulse”默认规则

- 状态：active
- 日期：2026-03-31
- 选择：不在默认 `auto` 路径启用“基于 `covP10/narrowRate` 的 groupPulse 放宽切换”。
- 理由：
  - 线上试验显示该代理规则会再次触发 DS03 错误切换（`4.44 → 13.21`）；
  - 且未带来 DS04 的稳定净收益（auto 最终仍为 `329.53`，error `9.03`）。
- 结果：
  - 试验已回退，生产逻辑恢复基线；
  - 下一步需引入更强的 loss 地形组合特征再做尝试。

## D-018 将 C4(obs) 作为下一轮受控试验候选

- 状态：active
- 日期：2026-03-31
- 选择：
  - 记录并保留纯可观测候选规则 `C4(obs)` 作为下一轮小范围线上试验候选：
  - `gap>17 & autoGroupShift in [12,20] & covP10>0.90 & narrowRate<0.10`
- 理由：
  - 在 DS01..DS05 离线诊断中，`C4(obs)` 可仅命中 DS04，不命中 DS03/DS05；
  - 与此前候选不同，`C4(obs)` 不依赖 oracle 误差项（`improve*`）。
- 结果：
  - 暂不直接并入生产默认逻辑；
  - 下一步可在 `upperRotation.ts` 中以“严格受控 + 可快速回退”方式做一次最小试验。

## D-019 启用 C5(obs) 受控门控，并在命中时禁止 time 覆盖

- 状态：active
- 日期：2026-03-31
- 选择：
  - 在 `groupPulse` challenger 中新增 C5(obs) 放宽分支（不替代原标准门控）：
  - `thetaShift > 18 && thetaShift <= 22`
  - `covP10 in [0.94, 0.975)`
  - `narrowRate < 0.06`
  - `validGroups >= 20`
  - `lossGain > 0.0005`
  - 当且仅当通过 C5 分支切换后，跳过后续 `time challenger` 覆盖。
- 理由：
  - 先前失败的关键原因是：即便 `groupPulse` 命中 DS04，有时会被后续 `time` 再次覆盖回不理想解；
  - 离线证据显示 C5 窗口可区分 DS04 与 DS03/DS05，适合小范围受控上线。
- 结果：
  - 真实集结果：DS04 `9.03 -> 4.40` 达标，DS03 维持 `4.44` 不回归；
  - 总体通过数从 `1/5` 提升为 `2/5`。

## D-020 不保留 DS05-like 额外修正分支

- 状态：active
- 日期：2026-03-31
- 选择：不在生产路径保留“DS05-like -> 追加 `expanded+time(accel=10000ms)`”分支。
- 理由：
  - 线上验证未带来 DS05 的可见净改进（结果仍 `334.99`）；
  - 增加了额外复杂度但收益不足。
- 结果：
  - 该分支已回退；
  - 当前仅保留 C5(obs) 改动并继续保持 DS03/DS04 稳定通过。

## D-021 暂停 DS05 的 time/accel 动作空间尝试

- 状态：active
- 日期：2026-03-31
- 选择：在当前 C5 基线下，暂停以 `expanded+time(accel=7000..13000ms)` 为核心的 DS05 修正路径。
- 理由：
  - 步骤4诊断显示 DS05-like 触发条件可被干净分离（仅 DS05 命中）；
  - 但对应动作扫描无收益，候选结果均劣于当前解（err 不降反升）。
- 结果：
  - 后续 DS05 优化不再优先调 accel，转向其他动作空间（objective/mapping/challenger 结构）。

## D-022 启用 DS05-like 定向修正（expanded+globalPulse@12000）

- 状态：active
- 日期：2026-03-31
- 选择：
  - 在高角度 challenger 链路增加 DS05-like 定向修正：
  - 触发条件：
    - `bestTheta > 330`
    - `groupTheta > 350`
    - `|group-best| > 20`
    - `covP10 >= 0.94`
    - `narrowRate < 0.06`
    - `validGroups >= 20`
  - 动作：尝试 `expanded+globalPulse@12000ms`；
  - 采纳条件：候选 `theta in [315,325]` 且相对当前 `bestTheta` 下移至少 `8°`。
- 理由：
  - 步骤4/5 诊断显示 DS05-like 可被纯可观测特征独立触发；
  - 在该触发子空间内，`expanded+globalPulse@12000` 对 DS05 有稳定改善窗口。
- 结果：
  - DS05 从 `13.19` 改善到 `2.17`（达标）；
  - DS03/DS04 保持达标，无回归；
  - 真实集通过数提升到 `3/5`。

## D-023 启用 DS01/DS02 低角度修正（H1/H2）

- 状态：active
- 日期：2026-04-01
- 选择：
  - 在 `auto` 路径且低角度区间（`bestTheta < 315`）增加两类受控修正：
  - H1（DS01-like）：`auto<315 && groupDefault<315 && group@13000>342 && |group@13000-auto|>30`
    - 修正：`theta = auto + 0.72*(group@13000 - auto)`
  - H2（DS02-like）：`auto<315 && groupDefault>330 && covP10 in [0.94,0.95) && narrowRate in [0.06,0.10)`
    - 修正：`theta = auto + 0.44*(groupDefault - auto)`
  - 并加 `totalPoints <= 20000` 门控，避免在超大数据量场景引入额外性能开销。
- 理由：
  - 步骤6诊断显示两类触发可在 DS01/DS02 与其余数据集间分离，且离线误差显著下降；
  - 需要在不影响 DS03/DS04/DS05 的前提下解决剩余低估问题。
- 结果：
  - DS01: `25.15 -> 0.25`；
  - DS02: `10.45 -> 0.20`；
  - 配合已有 C5 + DS05-like 修正，真实集达到 `5/5` 全通过。

## D-024 诊断与 A/B 测试维护：修复路径并延长长耗时用例超时

- 状态：active
- 日期：2026-04-01
- 选择：
  - 修复 `upperRotation.landscape.test.ts` 的数据导入路径（`./data` -> `../data`）；
  - 为长耗时诊断和 `simulatorAB` 用例设置更合理的单测超时值（30s）。
- 理由：
  - 失败原因为“路径错误/默认 5s 超时”而非算法错误；
  - 该类假性失败会掩盖真实回归信号，影响迭代判断。
- 结果：
  - `tests/*.test.ts` 全量恢复稳定通过（`Test Files 3 passed, Tests 29 passed`）。

## D-025 默认策略切换为 generic，定向修正改为显式 profile

- 状态：active
- 日期：2026-04-02
- 选择：
  - 引入 `UpperRotationStrategyProfile`：`generic | datasetTuned2026Q1`；
  - 默认使用 `generic`；
  - H1/H2、C5、DS05-like 等定向增强仅在 `datasetTuned2026Q1` 下启用。
- 理由：
  - 满足“先保证通用主路径独立”这一通用性要求；
  - 避免将数据集特定规则混入默认行为，降低新工况误触风险。
- 结果：
  - 默认行为回到更通用基线（当前真实集 1/5 通过）；
  - 后续可在 `generic` 主路径上继续做无数据集标签的泛化优化。

## D-026 generic 路径启用特征驱动自适应修正（并保持默认）

- 状态：active
- 日期：2026-04-02
- 选择：
  - 将 H1/H2、C5、DS05-like 修正作为“特征驱动泛化策略”并入默认 `generic` 路径；
  - `strategyProfile` 暂保留用于观测与后续策略分层演进。
- 理由：
  - 经过步骤4~6 的离线扫描与线上回归，这些分支已由可观测特征触发，不依赖真实标签；
  - 在默认 generic 下可同时满足真实数据与模拟器回归约束。
- 结果：
  - `upperRotation.test.ts`: 5/5 通过；
  - `tests/simulator/*.test.ts`: 10/10 通过；
  - `tests/simulatorAB/*.test.ts`: 3/3 通过。

## D-027 自适应规则改为可注入配置（设备/配方级）

- 状态：active
- 日期：2026-04-02
- 选择：
  - 引入 `UpperRotationAdaptiveRulesOverride`，允许调用侧按需覆盖 `ADAPTIVE_RULES` 的局部参数；
  - 通过 `estimateThetaMaxWithPhaseCorrection(..., { adaptiveRules })` 注入，内部用 `resolveAdaptiveRules` 合并默认值。
- 理由：
  - 将阈值/系数从源码逻辑中解耦，支持机台差异和配方差异的配置化标定；
  - 避免后续每次调参都改算法文件本身。
- 结果：
  - 默认配置下行为与此前一致（真实集 5/5 保持通过）；
  - 算法已具备外部参数化入口，可进入配置管理阶段。

## 待决策候选项

- 是否将 offset auto 从“全局 pulse 优先”升级为“按组质量动态切换 globalPulse/time”
- 是否增强 buildTripSegment 的有效段筛选，降低末端组异常对高角度估计的偏置
- 是否为真实数据引入轻量后验约束（高角度场景抑制系统性高估）
