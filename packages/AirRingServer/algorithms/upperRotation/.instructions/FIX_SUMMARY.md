# 修复总结与验证计划

**日期**：2026-03-28  
**阶段**：修复实施完成，等待验证

## 执行回顾

按照策略 **2→1→3** 推进：

### ✓ 第一步：根因诊断（已完成）

**输出文档**：`DIAGNOSTIC_REPORT.md`

**关键发现**：

| 编号 | 根因 | 影响范围 | 原因分析 |
|-----|------|--------|--------|
| **RC-1** | `DIRECT_ACCEPT_LOSS_RATIO = 1.04` 过宽松 | DS03, DS05 | 4% 容差允许损失值更高的方案被采用 |
| **RC-2** | auto 仲裁缺乏"direct 必须明显更优"约束 | DS03, DS05 | 没有强制 direct 的损失值必须明显更好 |
| **RC-3** | 梯形映射对称性虚假最优点 | DS04, DS05 | θ=180° 处的对称性结构导致搜索收敛错位 |
| **RC-4** | 搜索起点覆盖不足 | DS04, DS05 | 12 起点无法充分探索高角度区域 |

### ✓ 第二步：实施修复（已完成）

**修改文件**：`packages/AirRingServer/algorithms/upperRotation.ts`

**具体改动**：

```typescript
// 行 24-25：收紧常数
const HIGH_ANGLE_DIVERGENCE_DEG = 330
const SOLUTION_GAP_THRESHOLD_DEG = 15  // ← 从 8° 改为 15°（更严格的分歧门槛）
const DIRECT_ACCEPT_LOSS_RATIO = 1.00  // ← 从 1.04 改为 1.00（禁止更高损失值）

// 行 491-504：增加强制约束
if (directResult) {
  const thetaGap = Math.abs(bestTheta - directResult.theta)
  const expandedLeansBoundary = bestTheta >= HIGH_ANGLE_DIVERGENCE_DEG
  const directIsCompetitive = directResult.loss <= bestLoss * DIRECT_ACCEPT_LOSS_RATIO
  const directMustBeSignificantlyBetter = directResult.loss < bestLoss * 0.99  // ← 新增

  if (
    expandedLeansBoundary &&
    thetaGap >= SOLUTION_GAP_THRESHOLD_DEG &&
    directIsCompetitive &&
    directMustBeSignificantlyBetter  // ← 新增约束条件
  ) {
    // 采用 evaluateDirect...
  }
}
```

**修复目标**：

- **RC-1** ✓ 直接解决：`1.04 → 1.00` 禁止损失值更高的方案
- **RC-2** ✓ 直接解决：新增 `directMustBeSignificantlyBetter` 强制 direct 必须好 1%
- **RC-3** ⏳ 待观察：间接缓解（strict 仲裁会减少错误回退）
- **RC-4** ⏳ 待观察：暂未改动（可能需要在后续迭代中增加搜索起点）

### ⏳ 第三步：验证修复（进行中）

**验证计划**：

1. **快速验证**（单个数据集）
   - 运行 DS03 测试，检查是否成功保留 `expanded(337.7°)` 而非回退到 `direct(240.2°)`
   - 命令：`pnpm exec vitest --run algorithms/upperRotation.test.ts -t="样本数据 03"`

2. **完整验证**（全量测试）
   - 运行全部真实数据集（DS01-DS05）和模拟器数据集（6/6）
   - 命令：`pnpm test upperRotation.test --reporter=verbose`
   - 验证无模拟器回归

3. **对比分析**
   - 新结果与修复前基线对比
   - 提取关键诊断行（auto 仲裁日志）
   - 生成新的证据日志存档

---

## 预期修复效果

| 数据集 | 修复前 | 修复后预期 | 判断依据 |
|-----|------|---------|--------|
| DS01 | 310.45° (+25.15°) | ✓ 310-336° | 未涉及 auto 分歧，可能无变化或轻微改善 |
| DS02 | 309.75° (+10.45°) | ✓ 310-320° | 未涉及 auto 分歧，可能无变化或轻微改善 |
| **DS03** | 240.21° (+93.29°) | ≈ **337.7°** (+4°) ✓✓✓ | 修复 RC-1/2，阻止 expanded(337.7°)→direct(240.2°) |
| **DS04** | 180.98° (+139.52°) | ⏳ 180-320° | RC-3/4 未改，可能仍困于 180°（需后续改进） |
| **DS05** | 180.84° (+140.96°) | ≈ **341.5°** (+20°) ✓✓ | 修复 RC-1/2，但分歧可能稍减 |

---

## 修复风险评估

| 风险项 | 概率 | 影响 | 缓解措施 |
|--------|-----|------|--------|
| 模拟器通过率下降 | **低** | 中 | 模拟器无高角度分歧问题，约束不影响其搜索路径 |
| DS04 仍然失败 | **中** | 中 | RC-3/4 未改，需后续迭代（可接受） |
| 其他数据集性能下降 | **极低** | 低 | 修改只涉及高角度分歧条件，不影响其他路径 |

---

## 后续计划（若验证通过）

**立即计划**：
- [ ] 确认 DS03/DS05 修复成功
- [ ] 确认模拟器无回归
- [ ] 采集新日志存档

**短期计划**（若 DS04 仍失败）：
- [ ] 实施 RC-3：增加搜索起点覆盖（12 → 18-24）
- [ ] 实施 RC-4：添加反向梯形检查，检测虚假的 180° 最优点
- [ ] 迭代验证

**长期优化**：
- [ ] 引入后验合理性检查（高角度预期数据不应收敛到 180°）
- [ ] 考虑自适应加速度比估算
- [ ] 性能基准测试

---

## 决策记录

已录入 `decisions.md` 中 **D-009**：

- **状态**：active
- **日期**：2026-03-28
- **选择**：收紧 auto 仲裁条件（3 个参数调整）
- **理由**：根因分析识别的过宽松仲裁导致 DS03/DS05 的错误回退

---

## 验证命令快速参考

```bash
# 完整测试
cd packages/AirRingServer
pnpm test upperRotation.test --reporter=verbose

# 仅真实数据集
pnpm exec vitest --run algorithms/upperRotation.test.ts -t="真实数据集测试"

# 仅模拟器
pnpm exec vitest --run algorithms/upperRotation.test.ts -t="模拟器数据集测试"

# 采集证据
scripts/collectUpperRotationEvidence.sh
```

---

**下一步**：执行完整测试，验证修复效果并生成新的证据日志。


