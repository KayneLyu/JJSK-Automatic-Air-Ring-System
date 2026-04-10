# 上旋算法诊断报告（第一阶段）

**日期**：2026-03-28  
**状态**：根因已识别，准备修复方案

## 执行摘要

通过分析 2026-03-28 的测试日志，已识别真实数据集失败的**根本原因**：

**auto 仲裁机制中的过度回退策略**导致高角度估计值被错误地替换为低角度（~180°）。

---

## 详细诊断

### 观察到的失败模式

| 数据集 | 期望值 | 结果 | 误差 | auto 模式决策 |
|-----|------|------|------|------------|
| DS01 | 335.6° | 310.45° | 25.15° | ✓ expanded 保留（无分歧） |
| DS02 | 320.2° | 309.75° | 10.45° | ✓ expanded 保留（无分歧） |
| **DS03** | **333.5°** | **240.21°** | **93.29°** | ❌ **expanded(337.70°) → direct(240.20°)** |
| **DS04** | **320.5°** | **180.98°** | **139.52°** | ❌ **自动选择 evaluateExpanded → θ=180°** |
| **DS05** | **321.8°** | **180.84°** | **140.96°** | ❌ **expanded(341.50°) → direct(180.10°)** |

### 根因分析

#### 问题 1：DS03 的高角度分歧回退

```
[UpperRotation] auto 模式高角度分歧，采用 evaluateDirect: expanded θ=337.70°, direct θ=240.20°, expandedLoss=0.948934, directLoss=0.967997
Dataset 03: expected=333.5°, got=240.21°, error=93.29°
```

**现象**：
- `evaluateExpanded` 给出 337.70°（接近真实值 333.5°），损失值 0.948934
- `evaluateDirect` 给出 240.20°（远离真实值），损失值 0.967671
- **auto 机制错误地选择了损失值更高的方案！**

**原因**：
当前 auto 仲裁代码（参见 `upperRotation.ts` 第 495-505 行）：
1. 检测到 expanded ≥ 330° 且两方案相差 ≥ 8° → 判定为"高角度分歧"
2. 若 `directLoss ≤ expandedLoss * 1.04`（4% 容差） → 采用 direct
3. DS03 case：0.967671 ≤ 0.948934 * 1.04 = 0.987850 **成立** → 采用 direct

**问题根源**：
- 4% 容差（`DIRECT_ACCEPT_LOSS_RATIO = 1.04`）太宽松
- 没有强制要求 direct 的损失值必须明显更好
- 导致损失值更高（0.967 > 0.948）的方案被选中

#### 问题 2：DS04/DS05 的极端回退

```
Dataset 04: expected=320.5°, got=180.98°, error=139.52°
Dataset 05: expected=321.8°, got=180.84°, error=140.96°
auto 模式高角度分歧，采用 evaluateDirect: expanded θ=341.50°, direct θ=180.10°, expandedLoss=0.986077, directLoss=0.961997
```

**现象**：
- 搜索到 180° 附近作为"最优"解
- 多起点搜索的初始结果就是 θ=180°
- auto 仲裁选择了导致 141° 误差的方案

**原因**：
1. **梯形速度映射的对称性问题**：
   - θ=180° 对应膜周长的 π 弧度（半圆）
   - 此时 `trapezoidalPosition(...) * θ_max_rad` 的周期性结构可能造成虚假的"最优点"
   - evaluateDirect（纯时间-角度映射）容易在此处陷入局部最小值

2. **脉冲偏移信息质量问题**：
   - 真实数据的脉冲质量可能不如模拟器数据
   - evaluateExpanded 依赖脉冲偏移；当偏移信息噪声大时，目标函数变得不可靠

3. **搜索策略的局限**：
   - 多起点搜索的 12 个起点覆盖范围可能未包含正确的高角度区域
   - 或搜索到高角度但被 auto 仲裁错误地回退

---

## 根因总结

| 编号 | 根因 | 受影响数据集 | 优先级 |
|-----|------|----------|--------|
| **RC-1** | `DIRECT_ACCEPT_LOSS_RATIO` 过宽松（1.04 = 4%） | DS03 | **高** |
| **RC-2** | auto 仲裁缺乏强制"direct 必须明显更优"的约束 | DS03,DS05 | **高** |
| **RC-3** | 梯形映射在 180° 处的对称性虚假最优点 | DS04,DS05 | **中** |
| **RC-4** | 搜索起点覆盖不足导致无法探索高角度区域 | DS04,DS05 | **中** |

---

## 建议修复方案（优先级排序）

### 修复 RC-1 & RC-2：收紧 auto 仲裁条件（优先实施）

**修改位置**：`packages/AirRingServer/algorithms/upperRotation.ts` 第 495-520 行

**关键改动**：

```typescript
// 当前代码（有问题）：
if (directResult && directResult.theta > min + 1 && directResult.theta < max - 1) {
  const directIsCompetitive = directResult.loss <= bestLoss * DIRECT_ACCEPT_LOSS_RATIO;
  if (expandedLeansBoundary && thetaGap >= SOLUTION_GAP_THRESHOLD_DEG && directIsCompetitive) {
    // 采用 direct...
  }
}

// 修复方案：
// 方案 A：缩小容差
const DIRECT_ACCEPT_LOSS_RATIO = 1.00  // 改为 1.00，要求 direct 损失值不能更高
const SOLUTION_GAP_THRESHOLD_DEG = 15   // 改为 15°，高角度分歧的门槛更高

// 方案 B：强制 direct 必须"明显更优"
const directIsCompetitive = directResult.loss < bestLoss * 0.99;  // 要求 direct 至少好 1%
```

**预期效果**：
- DS03：expanded(337.70°) 不会再被替换为 direct(240.20°)
- DS05：expanded(341.50°) 不会再被替换为 direct(180.10°)

### 修复 RC-3 & RC-4：增强搜索鲁棒性（后续改进）

- 增加搜索起点数量（从 12 增加到 18-24）
- 加入反向梯形检查（检测 θ=180° 处的虚假最优）
- 对搜索结果进行合理性检查（高角度数据不应该收敛到 180°）

---

## 验证计划

1. **应用 RC-1 & RC-2 修复** → 运行真实数据测试
2. **预期结果**：DS03/DS05 转为通过，DS04 仍需观察
3. **若 DS04 仍失败**：实施 RC-3 & RC-4 修复

---

## 相关代码位置

- **仲裁逻辑**：`upperRotation.ts:493-530` (`estimateWithScannerExpansion` 函数内)
- **常数定义**：`upperRotation.ts:25-26`
- **参与函数**：
  - `searchBest()` 多起点搜索
  - `evaluateExpanded()` 和 `evaluateDirect()` 目标函数

---

## 风险评估

- **改动范围**：仅涉及 auto 仲裁阈值，不改变核心算法
- **模拟器影响**：预期无影响（模拟器无高角度分歧问题）
- **回滚成本**：低（仅改动常数和逻辑条件）


