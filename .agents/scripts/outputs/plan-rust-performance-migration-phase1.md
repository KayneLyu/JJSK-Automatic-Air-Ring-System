# Rust 性能迁移阶段 1 Plan

详细计划见 `.agents/tasks/rust-performance-migration/plan.md` 的“阶段 1：上旋 Rust Node-API PoC”。

本阶段使用 mise 固定 Rust 1.88.0，以 napi-rs v3 建立不接管生产路径的影子 PoC；输入采用连续 TypedArray，迁移 `evaluateDirect`、`evaluateExpanded` 和批量候选角度搜索，并以 TypeScript 数值等价、核心 3 倍、端到端 2 倍作为继续迁移门槛。
