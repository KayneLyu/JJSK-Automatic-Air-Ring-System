# 上旋长期任务操作指南

## 文件结构与导航

本任务的持久化文档已迁移到模块化结构：

**核心文档**（`.instructions/` 目录）：

- `context.md` - 稳定背景：物理模型、算法结构、数据集、约束条件
- `plan.md` - 当前阶段计划与执行清单
- `progress.md` - 时序记录与里程碑更新
- `decisions.md` - 架构和策略决策与其实现理由

**任务工作区文件**：

- `README.md` - 任务概览与使用说明
- `testMatrix.md` - 测试场景矩阵与命令参考
- `scripts/runUpperRotationTests.sh` - 运行测试的便捷脚本（支持 `all|real|sim|ab`）
- `scripts/collectUpperRotationEvidence.sh` - 采集并存档证据日志的脚本
- `artifacts/` - 每次测试运行的详细日志（按时间戳归档）

## 每次迭代的最小工作流

按以下 5 步循环执行：

1. **读取**：快速浏览上述四个核心文档（尤其是 `progress.md` 最新状态）
2. **总结**：用 3-5 条要点总结当前状况
3. **执行**：实施仅一项最小高收益动作（算法改动 / 测试 / 分析）
4. **验证**：使用 `testMatrix.md` 或脚本目录的脚本进行测试
5. **更新**：
   - 每次有意义的运行都要更新 `progress.md`
   - 做出重要决策时更新 `decisions.md`

## 脚本快速参考

运行测试集的三种方式：

```bash
# 所有主用例（按当前 package.json，运行 upperRotation/tests 下全部 *.test.ts）
scripts/runUpperRotationTests.sh

# 等价命令（推荐显式写法）
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts

# 仅真实数据集测试（DS01..DS05）
scripts/runUpperRotationTests.sh real

# 仅模拟器数据集测试（simulator 子目录）
scripts/runUpperRotationTests.sh sim

# 仅模拟器 A/B 对照测试（simulatorAB 子目录）
scripts/runUpperRotationTests.sh ab

# 采集完整日志 → 自动存档到 artifacts/ 目录
scripts/collectUpperRotationEvidence.sh
```

## 当前任务目标（持续进行）

1. **保持模拟器数据集通过**（当前状态：✓ 全部通过）
2. **优化真实数据集**（当前状态：✗ DS01-DS05 全部失败）
   - 目标：所有真实数据集误差 `< 5 deg`
   - 若无法全部通过，提供证据支撑的根因分析与下一步计划
3. **更新与维护**：
   - 每个迭代后更新 `progress.md`
   - 关键抉择通过 `decisions.md` 持久化
   - `plan.md` 保持聚焦在下一个最高收益的动作

## 当前状态快照（2026-03-29）

- 真实数据：0/5 通过（DS01: 25.15°, DS02: 10.45°, DS03: 93.29°, DS04: 139.52°, DS05: 140.96°）
- 模拟器组：已切换到 `algorithms/upperRotation/tests/*.test.ts` 的分组用例
- 证据日志：归档于 `artifacts/`（由 `collectUpperRotationEvidence.sh` 生成）

## 相关代码文件

**主要算法**：

- `packages/AirRingServer/algorithms/upperRotation/upperRotation.ts` - 核心估算函数
- 历史版本备档：`upperRotation.a.ts`, `upperRotation.b.ts`

**测试与诊断**：

- `packages/AirRingServer/algorithms/upperRotation/tests/*.test.ts` - 主测试套件入口
- `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.test.ts` - 真实数据集主测试
- `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.diag.test.ts` - 诊断测试
- `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.landscape.test.ts` - 损失函数景观诊断
- `packages/AirRingServer/algorithms/upperRotation/tests/simulator/*.test.ts` - 模拟器分组用例
- `packages/AirRingServer/algorithms/upperRotation/tests/simulatorAB/*.test.ts` - 模拟器 A/B 对照用例

**模拟器**：

- `packages/Simulation/mocks/upperRotation.mock.ts`
- `packages/Simulation/mocks/blowFilm.mock.ts`

**类型定义**：

- `packages/AirRingServer/types/index.ts`
