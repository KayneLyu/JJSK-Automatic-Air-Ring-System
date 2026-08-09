# Phase 8 实施计划

1. 复用持久 Calibration Worker 模式，将膜泡 Worker 改为惰性常驻、FIFO 串行和 shutdown/ack 优雅关闭。
2. Rust 直接消费现有 CSR TypedArray，在 Native 内完成 Batch 正规方程、圆周正则和 Cholesky 求解。
3. Worker 内增加默认关闭的 Rust Batch shadow；TypeScript profile 保持唯一生产结果，Native 故障被隔离。
4. 建立 48/96/180/360 bins 数值等价、性能和 300 请求生命周期测试。
5. 仅在真实规模端到端收益和稳定性门槛通过后进入 Phase 8B 主路径；本阶段不迁移 RLS。
