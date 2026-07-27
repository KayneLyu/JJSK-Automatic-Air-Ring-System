# Task: 纵向单层膜厚重建

## 背景

项目需要实现从测厚仪测量的压平双层薄膜厚度（T(t) = f(θ(t)) + f(θ(t)+π)）反推膜泡圆周各角度的原始单层厚度分布 f(θ)。

现有算法 `thicknessReverseCalculation.ts` 使用旋转椭球体模型和泊松修正，物理模型不准确——它只修正总厚度，并未分离双层。需要基于线性系统求解方法重建。

## 涉及文件

### 新建
- `packages/AirRingServer/algorithms/bubbleReconstruction/` — 单层膜厚重建算法模块（线性系统求解 + 双层分解）
  - `index.ts` — 主入口 `reconstructBubbleThickness()`：从双层测厚数据求解单层膜厚剖面 B(φ)
  - `types.ts` — MeasurementTriple / BubbleReconstructionResult / SparseSystem 等核心类型
  - `measurementModel.ts` — 前向测量模型 T_k = η×(B(φ₁_k)+B(φ₂_k))，构建稀疏线性系统
  - `geometry.ts` — 几何模型：φ₁/φ₂ = θ+90°±δ
  - `matrixBuilder.ts` — 正规方程 + Cholesky 分解
  - `decompositions.ts` — 双层→单层分解（b1/b2 分离）
  - `solvers/` — Batch (Cholesky) + RLS 在线求解器
  - `simulation/` — 膜泡剖面生成器 + 测量仿真器
  - `verification/` — 验证运行器
- `packages/AirRingServer/algorithms/bubbleReconstruction/bubbleReconstruction.test.ts` — 仿真器验证测试

### UI 层（展示单层膜厚重建结果）
- `apps/AirRingSys/src/views/settings/rack/BubbleRawThickness.vue` — 膜泡单层厚度展示主页面（状态栏 + 导航栏 + 图表）
- `apps/AirRingSys/src/views/settings/rack/BubbleStatusBar.vue` — 状态栏：标定参数、单层膜厚 min/max、重建条件指标
- `apps/AirRingSys/src/views/settings/rack/BubbleNavBar.vue` — 导航栏：扫描趟方向、时间、翻页
- `apps/AirRingSys/src/views/settings/rack/BubblePolarChart.vue` — 图表容器（ECharts 挂载）
- `apps/AirRingSys/src/views/settings/rack/useBubblePolarChart.ts` — 图表 composable：单层膜厚剖面 B(φ) 折线图（x=膜泡角度 0-360°，y=单层膜厚 μm）
  - 数据源：`result.profile`（LS 重建单层剖面 B(φ)）
  - 低覆盖率 bin 由 `bridgeShortGaps` 桥接补齐
  - 支持对比模式（叠加其他扫描趟的剖面）
- `apps/AirRingSys/src/views/settings/rack/useScannerTripReconstruction.ts` — 数据加载与单层膜厚重建管线 composable
- `apps/AirRingSys/src/views/settings/rack/bubbleRawThickness.constants.ts` — 常量与辅助函数
- `apps/AirRingSys/src/types/ipc.d.ts` — BubbleSweepResult / BubbleWindowReconstructionResult 等 IPC 类型

### 读取/参考
- `packages/Simulation/mocks/blowFilm.mock.ts` — 仿真器正模型，提供 ground truth（`bubbleThicknessAtScanner`）
- `packages/AirRingServer/algorithms/upperRotation/upperRotation.a.ts` — 历史分箱方法 `evaluateDeltaTheta()`
- `packages/AirRingServer/algorithms/timeToAngle.ts` — 时间到角度映射
- `packages/AirRingServer/algorithms/buildTripSegment.ts` — 行程分割与有效数据提取
- `packages/AirRingServer/controllers/thicknessReversal.ts` — 现有反向控制器（待替换/升级）
- `packages/AirRingServer/algorithms/thicknessReverseCalculation.ts` — 现有不准确算法（待替换）

## 约束

- 单次算法执行 < 100ms（可在 Worker 线程运行）
- 输入来源：TripSegment[]（已有）+ 每个测量点的扫描仪位置 + 上旋角度
- 输出：每个角度的原始膜泡厚度（单层）
- 需要处理出界点（y = NaN）

## 物理模型

- 测量：T_k = B(φ₁_k) + B(φ₂_k)
  - φ₁_k = upperAngle_k + 90° + δ_k（前层），δ_k = (scannerPos_k / membraneWidth) × 180°
  - φ₂_k = upperAngle_k + 90° − δ_k（后层）
- 关键：φ₁−φ₂ = 2δ ≠ 180°（仅边缘 δ=±90° 时分离角=180°）
- 仿真器正模型：`blowFilm.mock.ts:774-787`
- 工艺变形因子：1.02（2% 压平变形）

## 相关测试

```bash
cd packages/AirRingServer
# 主测试命令（待创建后使用）
pnpm exec vitest run algorithms/bubbleThicknessReconstruction.test.ts

# 辅助验证
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts
```

## 相关决策

见 [decisions.md](decisions.md)
