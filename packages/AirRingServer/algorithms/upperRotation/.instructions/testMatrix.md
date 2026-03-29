# 测试矩阵

## 主要验证

当前主入口（上旋 tests 目录全部用例）：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts
```

## 聚焦子集

仅真实数据集：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"
```

仅模拟器数据集：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/simulator/*.test.ts
```

仅模拟器 A/B 对照：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/simulatorAB/*.test.ts
```

## 支持诊断

NaN/脉冲/直接目标诊断：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts
```

损失函数景观诊断：

```bash
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.landscape.test.ts
```

## 验收标准

- 真实数据集 DS01..DS05：各项误差 `< 5 deg`
- 模拟器集合：各项误差 `< 5 deg`
- 改进真实数据集时无模拟器回归
