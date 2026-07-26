# Plan: 纵向单层膜厚重建

## 先写计划再动手

### Phase 1 — 验证可行性（已完成 2026-06-11）
1. [x] 理解仿真器正模型（blowFilm.mock.ts:774-787）
2. [x] 设计线性系统求解器（bubbleThicknessReconstruction.ts）
3. [x] 编写测试：用仿真器 ground truth 验证求解精度
4. [x] 调优参数（默认即可，无需调优）
5. [x] 确认重构误差 < 2μm（达成：无噪声 0.000μm，噪声 0.284μm）

### Phase 2 — 接入真实数据（已完成 2026-06-11）
1. [x] 从原始测厚/上旋日志直接构建测量三元组
2. [x] 用行程边界检测 + 梯形速度曲线映射上旋角度
3. [x] May 22 ModBus 日志验证通过（147K 三元组，RMS 43.5%）
4. [x] June 10 ADBox 日志验证通过（2.7M 三元组，RMS 70.1%）
5. [x] Profile CSV 文件输出

**已知限制**：使用原始 AD 计数而非 µm、无出界过滤、thetaMax 为启发式估算

### Phase 2.5 — 真实数据对齐验证（已完成 2026-06-24）
1. [x] 添加 `predictMeasuredThickness` 公共函数（用 profile + α 计算预测 T）
2. [x] 新建 `bubbleThicknessAlignment.test.ts`，输出 CSV + HTML 可视化
3. [x] 揭示物理约束：180° 反对称分量在数学上不可观测
4. [x] 实测数据中 92-97% 方差位于不可恢复子空间（May 22: 3.33%，June 10: 8.35%）
5. [x] 在可恢复子空间内，模型捕获了 64-72% 的方差
6. [x] 参数扫描确认 25 组 (lambda, mu) 极差仅 0.028%，算法已达 LSTSQ 理论上限
7. [x] numBins 扫描确认 24→96 bins 仅提升 1.4 个百分点

**关键结论**：
- 当前算法对该数据是最优的，**调 lambda/mu 无效**
- 63.51% (May 22) / 71.65% (June 10) 捕获率是 LSTSQ 框架的理论上限
- 想突破必须跳出 LSTSQ 框架：时间模型 / Bayesian 先验 / 多传感器

**关键产物**：
- `bubbleThicknessReconstruction.ts:predictMeasuredThickness`
- `algorithms/bubbleThicknessAlignment.test.ts`（5 个测试）
- `tasks/.../outputs/alignment-{dataset}.{csv,html}`
- `tasks/.../outputs/alignment-summary.csv`
- `tasks/.../outputs/lambda-mu-sweep.csv`（25 组参数）
- `tasks/.../outputs/numbins-sweep.csv`（5 组 bin 数）

### Phase 3 — 实时化（进行中）
1. [ ] 增量更新：每完成一个扫描仪行程追加方程
2. [ ] 滑动窗口：仅用最近 N 个行程
3. [x] 置信度评估：分箱样本覆盖率（由 `binCoverage` + bridgeShortGaps 实现）
4. [ ] 在 Worker 线程运行（避免阻塞主进程）
5. [x] 接入真实 calibrated µm 数据 + 出界过滤（降低 RMS 至合理范围）
6. [x] 前端展示：双层膜上下层厚度独立显示
   - 极坐标图 → 笛卡尔上下双子图折线图（`useBubblePolarChart.ts`）
   - 上层（b1/φ1）/ 下层（b2/φ2）分别分箱取中位数
   - `axisPointer.link` 联动两图 tooltip，下图 y 轴 inverse + position: top

### Phase 4 — 工程化
1. [ ] 集成到 calibration session（与 maxAngle 并行）
2. [ ] 设备/配方级参数配置
3. [ ] 替换现有 thicknessReversal.ts

### 验收标准
- [x] 仿真器验证：重构误差 < 2μm（标称 100μm） → 达成 0.000~0.284μm
- [x] 真实数据回归：5-22 和 6-10 日志可输出合理的膜泡厚度分布 → 达成
- [ ] 性能：单次求解 < 100ms

### 预期产出
新算法模块 + 测试套件 + 集成到标定流程
