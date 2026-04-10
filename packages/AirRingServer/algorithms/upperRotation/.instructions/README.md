# 上旋任务工作区

本目录是上旋算法优化长期任务的持久工作空间。

## 文件

- `context.md` - 稳定背景（物理模型、算法结构、数据集、约束）
- `plan.md` - 当前阶段的活跃执行计划
- `progress.md` - 时序运行日志和里程碑更新
- `decisions.md` - 架构和策略决策及其理由
- `instructions.md` - 每次迭代的操作规范

## 任务范围

- 核心目标：优化 `upperRotation` 估算，使行为符合预期
- 当前阶段目标：保持模拟器测试通过，推进真实数据集（DS01-DS05）全部通过
- 若无法全部通过，提供证据支撑的根因分析

## 相关代码和测试

- 算法：`packages/AirRingServer/algorithms/upperRotation/upperRotation.ts`
- 主测试目录：`packages/AirRingServer/algorithms/upperRotation/tests/`
- 根测试文件：
  - `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.test.ts`
  - `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.diag.test.ts`
  - `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.landscape.test.ts`
- 模拟器分组：
  - `packages/AirRingServer/algorithms/upperRotation/tests/simulator/`
  - `packages/AirRingServer/algorithms/upperRotation/tests/simulatorAB/`
- 模拟器组件：
  - `packages/Simulation/mocks/upperRotation.mock.ts`
  - `packages/Simulation/mocks/blowFilm.mock.ts`

## 推荐测试命令

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts
```

## 本目录的脚本

- `scripts/runUpperRotationTests.sh` - 运行 upperRotation 测试套件
- `scripts/collectUpperRotationEvidence.sh` - 运行测试并采集简洁证据日志

## 更新规则

- 每次有意义的测试运行或代码迭代后更新 `progress.md`
- 实现任何策略变更前或直后记录到 `decisions.md`
- 保持 `plan.md` 聚焦于下一个具体动作和验收标准
