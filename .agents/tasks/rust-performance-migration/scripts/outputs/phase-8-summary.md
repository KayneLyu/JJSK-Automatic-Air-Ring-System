# Phase 8A 膜泡 Batch Rust Native 验收摘要

- Rust 直接接收 CSR TypedArray，并在 Native 内完成正规方程、圆周 Tikhonov 与 Cholesky。
- Bubble Worker 已改为持久单 Worker + FIFO + shutdown/ack；正常响应不再强制终止。
- Rust shadow 默认关闭，仅 `AIR_RING_BUBBLE_RUST_SHADOW=1` 启用；TypeScript 始终提供生产 profile。
- 48/96/180/360 bins 的 solver 与最终 profile 最大差异均为 0。
- 端到端中位加速约为 1.13/1.13/1.33/1.57 倍；默认 48 bins 暂不进入 primary。
- 300/300 Worker 请求与 300/300 shadow 成功，只创建 1 个 Worker；请求 P95 1.464ms，事件循环 P95 14.631ms。
- Rust 7/7、关键 Vitest 33/33、Clippy、fmt、Native build、Electron Node typecheck 与 Phase 8 Prettier 检查通过。
- 完整机器可读结果见 `phase-8-bubble-native.json`；运行日志见 `phase-8-bubble-native-run.log`。
