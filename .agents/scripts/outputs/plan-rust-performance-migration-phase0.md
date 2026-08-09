# Rust 性能迁移阶段 0 Plan

详细计划见 `.agents/tasks/rust-performance-migration/plan.md`。

本阶段建立 TypeScript 性能基线，覆盖上旋真实数据、膜泡 Batch/RLS 重建、运行环境、耗时分布、内存变化与正确性；不修改生产算法、设备连接和控制路径，不引入运行时依赖。
