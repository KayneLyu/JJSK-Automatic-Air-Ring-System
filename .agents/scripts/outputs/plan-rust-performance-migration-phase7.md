# Phase 7：上旋角度 Rust Native 主路径迁移计划

## 目标

将上旋角度估算中候选角度目标函数、粗搜索、细搜索和最终收敛所需的目标函数计算迁移到 Rust Native。TypeScript 暂时保留输入清洗、扫描偏移展开、脉冲特征提取和已验证的自适应规则编排。

## 实施步骤

1. 定义与具体运行时无关的上旋搜索后端接口。
2. 扩展 Native 搜索结果，返回损失曲线采样，保持现有 landscape 规则输入等价。
3. 实现复用 TypedArray DTO 的 Rust Native 主搜索后端。
4. 将生产估算中的所有搜索和最终 loss 计算委托给所选后端。
5. 在 Calibration Worker 增加默认关闭的 `AIR_RING_RUST_PRIMARY=1`，Native 失败或结果被拒绝时自动重跑 TypeScript 路径。
6. 保持 shadow 与 primary 互斥，避免同一请求重复执行 Native 搜索。
7. 运行 Rust、Native 数值等价、Worker 回退、DS01–DS05 和历史样本验证。

## 安全边界

- 不修改上旋角度范围、设备控制指令、PLC/ADBox 连接或控制器行为。
- 主路径必须显式启用，默认仍使用 TypeScript。
- Native 加载、参数校验、执行异常或无有效结果均回退 TypeScript。
- Rust 返回角度必须经过既有 `[min, max)` 参数边界和有限数值校验。
- 历史样本验证不启动完整应用、不连接设备、不修改数据库。

## 验收标准

- Rust 与 TypeScript 后端在 DS01–DS05 的最终 theta、诊断规则和 reject 状态等价。
- Native 搜索损失采样与 TypeScript 搜索序列等价，landscape 规则不发生语义漂移。
- Worker 在 primary 关闭时不加载 Native；开启时使用 Rust 结果；Native 异常时返回 TypeScript 等价结果。
- primary 和 shadow 同时配置时只运行 primary，避免重复 Native 开销。
- Rust 单测、Clippy、Native 构建、相关 Vitest、Electron typecheck 和 lint 不新增失败。
- 新历史样本的 Rust primary 最终 `maxAngle` 与 TypeScript 基线差异不超过 `1e-9°`。
