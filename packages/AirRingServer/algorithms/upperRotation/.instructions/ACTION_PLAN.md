# 迭代 #5 行动计划 - 诊断与验证清单

## 📋 任务概览

**目标**：在 RC-1（Offset 映射）改进前，先通过 Phase 1 诊断来确认假设。

**工期**：0.5-1 天

**输出物**：
- ✅ 5 个根因假设的验证报告
- ✅ 数据特征对比表
- ✅ 优先级调整（如有必要）

---

## Phase 1：诊断验证

### 任务 1.1：运行诊断测试

**命令**：
```bash
cd /Users/zane/WebstormProjects/JJSK-Automatic-Air-Ring-System/packages/AirRingServer

# 运行诊断测试，输出数据特征
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts --reporter=verbose 2>&1 | tee diag_output.log
```

**预期输出**：
```
=== Dataset 01 (expected 335.6°) ===
  Total segments: X
  Seg0: total=Y nan=Z(XX%) inBounds=K dur=XXs fwd=true
    pulseRange=[min,max] (range=R) yMean=M yStd=S DC/AC=ratio
  ...
  Result: expected=335.6° got=XYZ.AB° error=EE.FF°
```

**检查项**：
- [ ] DS01：NaN 比例 (期望 < 30%)
- [ ] DS02：脉冲范围覆盖 (期望 > 500)
- [ ] DS03：片段数 (期望 2-4 个完整片段)
- [ ] DS04：平均片段时长 (期望 > 300s)
- [ ] DS05：DC/AC 比 (期望 > 2.0)

---

### 任务 1.2：对比 evaluateExpanded vs evaluateDirect

**目的**：验证 H4（仲裁逻辑）对不同数据集的影响

**方法**：暂时修改算法，强制使用单一目标函数

**临时改动**：
```typescript
// 在 estimateWithScannerExpansion 中（约第 545 行）
// 替换：
// const evaluateFn = objectiveMode === 'direct' ? evaluateDirect : ...

// 临时改为：
const evaluateFn = evaluateDirect  // 强制使用 direct
// 或
const evaluateFn = evaluateExpanded // 强制使用 expanded
```

**运行两次测试**：

```bash
# 测试 A：仅 evaluateDirect
# （临时改为 evaluateDirect）
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts > direct_only.log 2>&1

# 测试 B：仅 evaluateExpanded
# （临时改为 evaluateExpanded）
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts > expanded_only.log 2>&1

# 测试 C：auto（恢复原代码）
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts > auto.log 2>&1
```

**记录对比**：
```
DS01: 期望 335.6°
  - evaluateDirect: XXX.XX° (error XX.XX°)
  - evaluateExpanded: XXX.XX° (error XX.XX°)
  - auto: XXX.XX° (error XX.XX°) ← 当前

结论：
  [ ] Direct 更准
  [ ] Expanded 更准
  [ ] 相差不大
  [ ] Auto 仲裁逻辑需要改进
```

**重复 DS02、DS03、DS04、DS05**。

---

### 任务 1.3：验证 Offset 映射的非线性性

**目的**：验证 H1（Offset 映射）是否存在非线性误差

**方法**：分析损失函数景观

**运行**：
```bash
# 风景诊断测试（如果存在）
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.landscape.test.ts > landscape.log 2>&1
```

**手工分析**（若诊断测试不可用）：
```javascript
// 在测试中临时添加诊断代码
const analyzeOffsetMapping = (tripSegments, min, max) => {
  const samples = []
  for (let theta = min; theta <= max; theta += 5) {
    const loss = evaluateExpanded(normalized, theta, 36)
    samples.push({ theta, loss })
  }
  
  // 输出 loss 曲线
  console.log('Loss Landscape:')
  for (const s of samples) {
    console.log(`θ=${s.theta.toFixed(0)}°: loss=${s.loss.toFixed(6)}`)
  }
}
```

**检查项**：
- [ ] 损失曲线是否存在多个局部最小值？
- [ ] 高角度范围（330-345°）的损失形状？
- [ ] 低角度范围（180-250°）的损失形状？

---

### 任务 1.4：汇总数据特征表

**收集**：
```
数据集  | 期望  | 脉冲范围 | NaN比例 | 片段数 | 平均时长 | DC/AC | 当前error
--------|-------|---------|--------|--------|---------|-------|----------
DS01    | 335.6 | [?,?]   | ??%    | ?      | ???s    | ?     | 25.15°
DS02    | 320.2 | [?,?]   | ??%    | ?      | ???s    | ?     | 10.45°
DS03    | 333.5 | [?,?]   | ??%    | ?      | ???s    | ?     | 4.44°  ✅
DS04    | 320.5 | [?,?]   | ??%    | ?      | ???s    | ?     | 9.03°
DS05    | 321.8 | [?,?]   | ??%    | ?      | ???s    | ?     | 13.19°
```

**分析**：
- 是否存在相关性：脉冲范围窄 → 误差大？
- 是否存在相关性：NaN 多 → 误差大？
- 是否存在相关性：片段少 → 误差大？

---

## Phase 2：根因确认与优先级调整

**基于诊断结果，填充下表**：

### 根因确认表

| 根因 | 假设 | 诊断结果 | 置信度 | 优先级调整 |
|------|------|---------|--------|-----------|
| RC-1 | Offset 非线性 | `[ ] 确认 [ ] 反驳 [ ] 不确定` | `??%` | ↑ / ↔ / ↓ |
| RC-2 | 加速度比不准 | `[ ] 确认 [ ] 反驳 [ ] 不确定` | `??%` | ↑ / ↔ / ↓ |
| RC-3 | 权重不均 | `[ ] 确认 [ ] 反驳 [ ] 不确定` | `??%` | ↑ / ↔ / ↓ |
| RC-4 | 仲裁逻辑不当 | `[ ] 确认 [ ] 反驳 [ ] 不确定` | `??%` | ↑ / ↔ / ↓ |
| RC-5 | 采集质量差 | `[ ] 确认 [ ] 反驳 [ ] 不确定` | `??%` | ↑ / ↔ / ↓ |

### 例子分析

**假设诊断结果**：
```
RC-1（Offset）：
  - DS04/DS05 的损失曲线在高角度存在双峰 → 确认
  - 评估不同 offset 策略结果差异 30-50° → 确认
  - 置信度：90%
  - 优先级：维持最高

RC-2（加速度比）：
  - 不同数据集的平均时长差异不大（360s ± 20s） → 反驳
  - 梯形映射敏感度分析 → 显示 ±0.1 变化仅导致 ±2-3° 偏差 → 反驳
  - 置信度：20%
  - 优先级：降低，改为次要

RC-4（仲裁逻辑）：
  - evaluateDirect 结果对 DS01/02 明显更准 → 确认
  - auto 逻辑在低角度未充分考虑 direct → 确认
  - 置信度：85%
  - 优先级：升级为次高
```

---

## Phase 3：下阶段计划

**基于诊断结果，生成实施计划**：

```
✅ Phase 1 完成 → 5 个根因已验证
↓
根据优先级排序：
  1. RC-1: Offset 映射 (工期 1-2 天)
  2. RC-??: ??? (工期 ?)
  3. RC-??: ??? (工期 ?)
  ...

每个改进后：
  1. 运行真实数据集测试 → 记录结果
  2. 运行模拟器回归测试 → 确保无回归
  3. 更新 progress.md
```

---

## 诊断输出模板

**运行诊断后，填充以下报告**：

```markdown
# 诊断报告 - 迭代 #5 Phase 1

执行日期：2026-03-30

## 1. 数据特征汇总

[填充上述数据特征表]

## 2. evaluateDirect vs evaluateExpanded 对比

DS01:
  - Direct: X.XX° (error XXX.XX°)
  - Expanded: YYY.YY° (error YYY.YY°)
  - Auto: ZZZ.ZZ° (error ZZZ.ZZ°)
  结论：[Direct/Expanded/都不好]

[重复 DS02-05]

## 3. 损失函数景观分析

[贴出 loss 曲线趋势图或数值]

## 4. 根因假设验证结果

| RC | 结果 | 置信度 | 证据 |
|----|----- |--------|------|
| RC-1 | [确认/反驳/不确定] | XX% | [具体证据] |
| ... | ... | ... | ... |

## 5. 优先级调整

新的实施顺序：
1. RC-?: [改进方案]
2. RC-?: [改进方案]
3. ...

## 6. 下一步建议

[基于诊断结果的具体建议]
```

---

## 执行清单

- [ ] 运行诊断测试（命令 1.1）
- [ ] 对比 Direct vs Expanded（命令 1.2）
- [ ] 分析损失景观（命令 1.3）
- [ ] 汇总数据特征（命令 1.4）
- [ ] 填充根因确认表
- [ ] 生成诊断报告
- [ ] 更新 progress.md → Phase 1 完成
- [ ] 提交诊断结果 → 开始 Phase 2（实施改进）

---

## 预期时间表

| 任务 | 预计工时 | 完成日期 |
|------|---------|---------|
| 诊断测试执行 | 0.5h | 2026-03-30 下午 |
| 数据分析 | 1h | 2026-03-30 下午 |
| 根因确认 | 0.5h | 2026-03-30 下午 |
| **Phase 1 总计** | **2h** | **2026-03-30 下午** |
| RC-1 实施 | 1-2 天 | 2026-04-01 |
| RC-2 实施 | 1 天 | 2026-04-02 |
| ... | ... | ... |


