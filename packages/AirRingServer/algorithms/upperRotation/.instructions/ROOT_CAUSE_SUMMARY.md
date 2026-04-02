# 根因分析补充（Phase 1）- 诊断清单

## 执行摘要

根据 progress.md（迭代#4，2026-03-29），真实数据集测试结果为：

- **DS01**: error 25.15° (期望 335.6°, 估算 ~310°) - **严重过低**
- **DS02**: error 10.45° (期望 320.2°, 估算 ~310°) - **过低**
- **DS03**: error 4.44°  (期望 333.5°, 估算 ~338°) - **通过** ✅
- **DS04**: error 9.03°  (期望 320.5°, 估算 ~335°) - **过高**
- **DS05**: error 13.19° (期望 321.8°, 估算 ~341°) - **过高**

## 问题分类

### A. 双峰失败模式
```
DS01/02: θ_estimated ≈ 310° (无论期望是否为 335° 或 320°)
      → 症状：系统低偏 10-25°，聚集在同一点

DS04/05: θ_estimated ≈ 335-341° (尽管期望仅 320-321°)
      → 症状：系统高偏 13-21°，聚集在 335-341° 范围
```

这表明**不是随机噪声**，而是**系统性的映射偏差**。

---

## 关键假设验证清单

### H1：Offset 映射存在非线性误差
- **证据来源**：迭代#3 诊断显示不同 offset 策略（globalPulse/time/groupPulse）结果相差 30-50°
- **验证方法**：
  1. 输出每个数据集的脉冲范围 `[pulseMin, pulseMax]`
  2. 在此范围内比对 `evaluateExpanded` 的最优角度
  3. 检查：是否在高脉冲值时 offset 被过度解释（→低估角度）

### H2：梯形加速度比不准确
- **证据来源**：固定的 `accelRatio = min(20000ms, dur*0.45) / dur` 可能不适用所有数据
- **验证方法**：
  1. 计算每个数据集的实际扫描时长分布
  2. 推断真实的 accelRatio 范围（通常 0.2-0.5）
  3. 对比：若 accelRatio 差 ±0.1，边界角度映射误差多少？

### H3：多片段质量差异导致权重不均
- **证据来源**：不同数据集的片段结构差异（数量、时长、脉冲覆盖）
- **验证方法**：
  1. 统计每个数据集的：
     - 片段总数
     - 平均片段时长
     - 脉冲范围覆盖（最小、最大、中位数）
     - NaN 比例（出界点）
  2. 假设：低质量片段（NaN多、覆盖窄）不应等权融合

### H4：evaluateExpanded vs evaluateDirect 的仲裁在低角度不均衡
- **证据来源**：DS01/02 的过低偏差可能来自 evaluateExpanded 被脉冲噪声误导
- **验证方法**：
  1. 禁用 challenger，对 DS01/02 分别运行：
     - 纯 evaluateExpanded
     - 纯 evaluateDirect
     - 对比结果与期望的距离

---

## 优先级改进计划

### Priority 1：Offset 映射优化（期望改善 ±10-15°）

**根据**：RC-1（Offset 系统误差）是四个根因中最直接的

**方案**：
```typescript
// 当前（线性）：
offsetDeg = ((pulse - min) / range - 0.5) * 180

// 改进选项 1：多项式补偿
offsetDeg = linearTerm + quadraticTerm * (pulse - centerPulse)^2

// 改进选项 2：分段映射
offsetDeg = lookupTable[discretize(pulse)]

// 改进选项 3：扩展 offset 策略竞争
// 在所有 offset 模式上都尝试 evaluateDirect vs evaluateExpanded 仲裁
```

**预期效果**：
- DS04/05 应降低至 < 5°
- DS01/02 可边际改善 2-5°

### Priority 2：加速度比自适应（期望改善 ±3-8°）

**方案**：
```typescript
// 基于片段特征推断 accelRatio
const estimateAccelRatio = (segments) => {
  const durations = segments.map(s => s.duration)
  const avgDuration = durations.reduce((a,b)=>a+b) / durations.length
  
  // 保守估计：避免过度拟合
  const baseRatio = 0.35
  const adjustment = 0.15 * (avgDuration / 360000 - 1) // 360s 为基准
  return Math.max(0.2, Math.min(0.5, baseRatio + adjustment))
}
```

### Priority 3：多片段加权（期望改善 ±1-3°）

**方案**：
```typescript
const segmentWeight = (seg, pulseMin, pulseMax) => {
  const pulseSpan = Math.max(...seg.measurements.map(m=>m.pulse)) 
                  - Math.min(...seg.measurements.map(m=>m.pulse))
  const validPoints = seg.measurements.filter(m => !isNaN(m.y)).length
  const validRatio = validPoints / seg.measurements.length
  
  // 权重：脉冲覆盖 × 有效比例 × 时长
  return (pulseSpan / (pulseMax - pulseMin)) 
       * validRatio 
       * Math.min(1, seg.duration / 360000)
}

// 在 evaluateExpanded 中应用权重而非等权
```

---

## 立即行动清单（Phase 1 诊断）

- [ ] **从现有日志提取**：查阅历史运行日志，对比 evaluateExpanded vs evaluateDirect
  - 路径：`.artifacts/` 或 test 输出日志
  
- [ ] **运行诊断测试**：
  ```bash
  cd packages/AirRingServer
  pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts
  ```
  输出应包含：每个数据集的片段结构、脉冲范围、NaN比例

- [ ] **数据可视化**（可选但有帮助）：
  - 绘制真实 θ_max vs 估算误差，观察是否存在系统性曲线
  - 绘制脉冲范围 vs 误差，检查是否相关

- [ ] **微小实验**：
  - 对 DS01 禁用所有 offset 复杂性，仅使用 evaluateDirect，记录结果
  - 对 DS05 同样测试
  - 对比：若 evaluateDirect 更准，说明 offset 是根本问题

---

## Phase 2 实施路线（假设 Phase 1 确认）

### 若 H1 确认（Offset 是主因）
→ **优先实施 Priority 1**

**步骤**：
1. 在 `upperRotation.ts` 中新增 `polynomialOffsetMap()` 函数
2. 修改 `expandWithScannerOffset()` 支持参数化映射
3. 添加 A/B 测试：线性 vs 多项式，对比 DS01-DS05
4. 若改善 > 50%，保留该改进并进入 Priority 2

### 若 H2 确认（加速度比是主因）
→ **优先实施 Priority 2**

**步骤**：
1. 新增 `calibrateAccelRatio()` 函数
2. 在 `estimateWithScannerExpansion` 中应用
3. A/B 测试：固定 vs 自适应 accelRatio
4. 若改善 > 30%，保留并联合 Priority 3

### 若 H3/H4 确认（质量不均 或 仲裁不当）
→ **次要改进**

---

## 成功标准

### 最优目标
✅ 全部真实数据集误差 < 5° 且保持模拟器无回归

### 可接受目标（备选交付）
✅ DS01-DS05 中至少 4 个 < 5°，且剩余 1 个有明确改进路线

### 最低目标（必须交付）
✅ 清晰的根因排序 + 实施路线 + 预期改善量

---

## 相关代码位置

```
核心算法: packages/AirRingServer/algorithms/upperRotation/upperRotation.ts
├─ expandWithScannerOffset()        ← H1 影响区（offset 映射）
├─ estimateWithScannerExpansion()   ← H2 影响区（accelRatio）
├─ evaluateExpanded()               ← H3/H4 影响区（片段融合）
└─ evaluateDirect()

测试入口: packages/AirRingServer/algorithms/upperRotation/tests/*.test.ts
├─ upperRotation.test.ts            ← 真实数据集测试
├─ upperRotation.diag.test.ts       ← 诊断测试（特征提取）
└─ upperRotation.landscape.test.ts  ← 损失函数景观诊断
```

---

## 后续步骤

1. **确认本文档已交付** → Copilot 完成根因分析
2. **执行 Phase 1 诊断** → 收集具体数据支持或否定 H1-H4
3. **根据诊断结果选择 Priority** → 实施改进并验证
4. **更新 progress.md** → 记录改进结果


