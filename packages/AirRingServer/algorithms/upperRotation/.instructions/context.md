# 上下文（Context）

## 任务与物理模型

本任务估计吹膜过程中上旋系统的最大旋转角度 `thetaMax`。

- **约束条件**：`180 < thetaMax < 360` (度)
- **测量模型**：`T(t) = f(theta(t)) + f(theta(t) + pi)`
- **结论**：展平的双层膜信号中，奇次谐波相消，偶次谐波可观测。

上旋并非完全线性，行程端部存在加速/减速；算法使用梯形速度映射：

- `trapezoidalPosition(progress, accelRatio)`
- 默认加速比估计：`accelRatio = min(20000ms, duration * 0.45) / duration`

## 主要代码结构

- 主算法：`packages/AirRingServer/algorithms/upperRotation/upperRotation.ts`
- 历史存档：
  - `packages/AirRingServer/algorithms/upperRotation/upperRotation.a.ts`
  - `packages/AirRingServer/algorithms/upperRotation/upperRotation.b.ts`
- 主测试：
  - `packages/AirRingServer/algorithms/upperRotation/tests/*.test.ts`
- 诊断工具：
  - `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.diag.test.ts`
  - `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.landscape.test.ts`

入口函数：

- `estimateThetaMaxWithPhaseCorrection(tripSegments, options)`

当前算法流程：

1. 验证输入和搜索范围
2. 过滤不完整片段（`duration <= 0` 被移除）
3. 过滤部分首尾片段（使用时长阈值）
4. 运行扫描展开路径（`estimateWithScannerExpansion`）
5. 若失败，回退至脉冲展开路径（`estimateWithPulseExpansion`）

## 目标函数和搜索

当前使用的目标函数：

- `evaluateExpanded`：使用时间角度映射 + 扫描仪偏移的方差最小化
- `evaluateDirect`：仅使用时间角度映射的方差最小化

搜索策略：

- 粗搜索在配置范围内
- 在最佳粗搜索点附近进行精搜索
- 最后使用 `goldenSectionSearch` 进行精细化

## 数据与验收标准

真实数据集（`algorithms/data/01..05`）：

- DS01 期望值：335.6
- DS02 期望值：320.2
- DS03 期望值：333.5
- DS04 期望值：320.5
- DS05 期望值：321.8

真实数据验收标准：绝对误差 `< 5 deg`。

模拟器数据集：

- 主入口：`pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts`
- 角度样本由 `algorithms/upperRotation/tests/simulator/` 内分组用例维护
- 模拟器 A/B 对照由 `algorithms/upperRotation/tests/simulatorAB/` 维护
- 验收标准：绝对误差 `< 5 deg`

## 数据处理原则

- 超出界限的厚度点（`y = NaN`）在映射和评估前被排除
- 脉冲范围映射应避免超出界限的伪影
- 历史实际样本文件是类光通量信号；生产/模拟器路径提供类厚度值

## 相关模拟器和类型文件

- `packages/Simulation/mocks/blowFilm.mock.ts`
- `packages/Simulation/mocks/upperRotation.mock.ts`
- `packages/AirRingServer/types/index.ts`
