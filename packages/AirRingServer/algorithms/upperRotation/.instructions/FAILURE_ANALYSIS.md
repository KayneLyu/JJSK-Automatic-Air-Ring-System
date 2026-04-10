# 真实数据集测试失败根因分析

**分析日期**：2026-03-30  
**分析版本**：基于迭代#4（2026-03-29）的测试结果  

---

## 执行摘要

### 当前测试结果

| 数据集 | 期望值 (°) | 估算值 (°) | 误差 (°) | 状态 | 偏向 |
|--------|-----------|----------|---------|------|------|
| DS01   | 335.6     | ~310.45  | 25.15   | ❌   | **低偏** |
| DS02   | 320.2     | ~309.75  | 10.45   | ❌   | **低偏** |
| DS03   | 333.5     | ~337.94  | 4.44    | ✅   | 略高 |
| DS04   | 320.5     | ~335.04  | 9.03    | ❌   | **高偏** |
| DS05   | 321.8     | ~341.48  | 13.19   | ❌   | **高偏** |

### 关键观察

1. **双重失败模式**：
   - DS01/DS02：**过低**（-10° ~ -26°）
   - DS04/DS05：**过高**（+13° ~ +21°）
   - DS03：成功在可接受范围内

2. **收敛趋势**（vs 迭代#3）：
   - DS04：14.54° → 9.03° ✓ 改善
   - DS05：19.68° → 13.19° ✓ 改善
   - DS01/DS02：未见改善或恶化

3. **根本症状**：
   - **高角度系统偏高**（DS04/DS05）：当真实 θ_max ≈ 320-335° 时，估算倾向于 335-341°
   - **低-中角度系统偏低**（DS01/DS02）：当真实 θ_max ≈ 320-335° 时，估算倾向于 310° 以下

---

## 根因分析（按优先级）

### RC-1：Offset 映射系统误差（高优先级）

**症状**：
- DS04/DS05 的估算过高 13-21°
- 迭代#3 诊断表明不同 offset 策略差异大（globalPulse vs time vs groupPulse）

**假设**：
脉冲→角度的映射（`offsetDeg = ((pulse - min) / range - 0.5) * 180`）存在系统偏差：
```
实际角度 θ = θ_base + offset_correction(pulse)
```

若 `offset_correction` 不准确（例如缺少非线性补偿或缺少多项式拟合），会导致：
- 高角度时 offset 被**过估**（→偏高）
- 低角度时 offset 被**低估**（→偏低）

**证据**：
- 迭代#3 诊断输出显示 `groupPulse` 和 `time` 结果相差 30-50°
- 即便 `expanded+time` challenger 已启用，DS04/DS05 仍未达目标

**可能缺失的要素**：
1. 脉冲范围的非线性校正（如二次或三次多项式）
2. 脉冲到扫描仪角度的偏移量缺少温度/时间漂移补偿
3. 双向扫描（正向/反向）的不对称补偿

---

### RC-2：梯形速度映射的加速度比不准确（中高优先级）

**症状**：
- 全数据集存在系统性偏差（DS01/02 偏低，DS04/05 偏高）
- 暗示时间→角度映射在边界处存在偏差

**当前实现**：
```typescript
const accelMs = accelDecelMs ?? Math.min(20000, seg.duration * 0.45)
const accelRatio = Math.max(0, Math.min(1, accelMs / seg.duration))
```

**问题**：
- 固定的 `0.45` 倍数可能不适用所有真实样本
- 不同的真实数据可能有不同的 `accelRatio`（如 0.3-0.6 范围）
- 若 `accelRatio` 误差为 ±0.1，会导致边界角度映射偏差 ±5-10°

**证据**：
- 误差分布缺乏对称性，暗示映射曲线弯曲度不匹配

---

### RC-3：多片段融合的权重不均（中优先级）

**症状**：
- 不同数据集的片段结构差异（片段数、每段时长、脉冲覆盖范围）
- 算法使用朴素的逐点评估，未加权重

**问题**：
```typescript
// 当前：所有点均等权重
const loss = evaluateExpanded(normalized, theta, segments)
```

若某些片段：
- 脉冲覆盖范围过窄（低信息量）
- 出界点（NaN）过多（数据质量差）
- 时长过短（采样稀疏）

这些片段不应等权与高质量片段混合。

**假设的改进**：
为每个片段加权，基于：
- 脉冲覆盖范围（范围越广，权重越高）
- 有效测点数占比（NaN 比例越低，权重越高）
- 片段时长（时长越长，权重越高）

---

### RC-4：evaluateExpanded vs evaluateDirect 的仲裁逻辑仍需微调（中优先级）

**症状**：
- 高角度分歧判断机制已改进（迭代#4），但 DS01/02 的低偏差未见改善
- 暗示 `auto` 仲裁在低-中角度范围可能仍存在子优选择

**可能的失误**：
1. 当 `hasValidOffset = true` 时，总是优先选择 `evaluateExpanded`
   - 但对 DS01/02，`evaluateExpanded` 可能被脉冲噪声误导
   - 应在低-中角度也加入 `evaluateDirect` 竞争

2. 高角度分歧保护（D-010/D-011）聚焦于 `expanded→direct` 回退
   - 未考虑 `direct→expanded` 的过度采纳

---

### RC-5：数据采集质量差异（可能外因）

**症状**：
- DS01 误差最大（25.15°）
- 可能反映真实采集条件差（噪声、丢包、不稳定）

**检查清单**：
- [ ] DS01 的脉冲范围是否过窄（低分辨率）？
- [ ] DS01 的 NaN 比例是否过高（大量出界）？
- [ ] DS01 的片段数是否过少（不完整采集）？

---

## 分层改进方案

### 优先级 1：修复 Offset 映射（预期改善 ±10-15°）

**方案 A：多项式拟合 offset 映射**
```typescript
// 替代线性映射
const offsetDeg = polynomialOffsetMap(pulse, min, max, calibration)

// 其中 calibration 包含样条或多项式系数
```

**方案 B：启用 evaluateDirect 在全角度范围竞争**
- 修改 auto 逻辑，使 `evaluateDirect` 也能在低-中角度被考虑
- 降低 `SOLUTION_GAP_THRESHOLD_DEG` 以允许更多竞争

**预期**：
- DS04/05 可望降低至 < 5°
- DS01/02 可望改善 3-5°（需联合方案 C）

---

### 优先级 2：自适应加速度比校准（预期改善 ±3-8°）

**方案**：在片段过滤后，基于多片段的脉冲跨度推断 accelRatio
```typescript
// 粗估：脉冲跨度越广，说明扫描越充分，accelRatio 越接近真实
const estimatedAccelRatio = calibrateAccelRatio(pulseRange, segments)
```

**预期**：
- 减少边界映射偏差
- DS01/02 可望改善 2-4°

---

### 优先级 3：加权片段融合（预期改善 ±2-5°）

**方案**：
```typescript
const weight = (seg) => {
  const nanRatio = seg.measurements.filter(m => isNaN(m.y)).length / seg.measurements.length
  const pulseSpan = maxPulse - minPulse
  const durationScore = seg.duration / maxDuration
  return (1 - nanRatio) * Math.log1p(pulseSpan) * durationScore
}
```

**预期**：
- 对数据质量差的样本（如 DS01）改善明显
- 全数据集可望改善 1-3°

---

### 优先级 4：扩展高角度分歧保护至低角度（预期改善 ±1-3°）

**方案**：
- 对低-中角度范围（180-250°）也启用 `evaluateDirect` vs `evaluateExpanded` 仲裁
- 参数：`LOW_ANGLE_DIVERGENCE_THRESHOLD_DEG = 250`

**预期**：
- 对 DS01/02 可能有边际改善

---

## 建议执行路径

### Phase 1（立即）：根因确认
1. 运行诊断测试，输出每个数据集的：
   - 脉冲范围与分布
   - NaN 比例和出界阈值
   - 多片段的加速度比差异
   - evaluateExpanded vs evaluateDirect 的并排对比

2. 绘制真实 θ_max vs 估算误差的散点图，判断是否存在系统性非线性

### Phase 2（短期 1-2 天）：实施 RC-1（Offset 映射优化）
- 尝试多项式拟合或扩展 challenger 机制
- 预期改善 10-15°

### Phase 3（短期 2-3 天）：实施 RC-2（加速度比自适应）
- 基于片段特征推断 accelRatio
- 预期改善 3-8°

### Phase 4（后续）：RC-3~RC-5 按需执行

---

## 验证计划

每个修改后：
1. 运行真实数据集测试（`-t="真实数据集测试"`）
2. 运行模拟器套件回归（`-t="模拟器数据集测试"`）
3. 记录增量改善 vs 基线
4. 仅在净改进且无回归时保留修改

**目标**：将所有真实数据集误差降低至 < 5°

---

## 附录：当前算法概览

### 输入流水
```
TripSegment[] 
  ↓ [过滤不完整] 
  ↓ [buildTripSegment 处理]
  ↓ [filterPartialSegments]
  ↓ [estimateWithScannerExpansion]
  ↓ [expandWithScannerOffset: auto|globalPulse|groupPulse|time]
  ↓ [searchBest: 粗搜(0.5°) + 精搜(0.1°)]
  ↓ [高角度分歧仲裁: evaluateExpanded vs evaluateDirect]
  ↓ [challenger 选项: groupPulse/time]
  ↓ [goldenSectionSearch: 黄金分割细化(0.01°)]
  ↓
θ_max
```

### 关键参数（当前值）
- `HIGH_ANGLE_DIVERGENCE_BASE_DEG = 330`
- `HIGH_ANGLE_DIVERGENCE_MARGIN_DEG = 3`
- `SOLUTION_GAP_THRESHOLD_DEG = 15`
- `DIRECT_ACCEPT_LOSS_RATIO = 1.0`
- `DIRECT_BOUNDARY_GUARD_DEG = 10`
- `CHALLENGER_MAX_POINTS = 40000`

### 已知的改进点（未实施）
- Offset 映射多项式校正
- 加速度比自适应校准
- 多片段权重融合
- 低角度分歧仲裁扩展

---

## 后续交付物

- [ ] 完整的诊断日志（包含 evaluateExpanded vs evaluateDirect 对比）
- [ ] 多项式 offset 映射的初步实现
- [ ] 自适应加速度比校准的初步实现
- [ ] 修正后的全数据集测试结果


