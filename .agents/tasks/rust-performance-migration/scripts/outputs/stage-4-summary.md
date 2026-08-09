# 阶段 4：持久 Calibration Worker 生命周期修复

## 结论

阶段 4 验收通过。阶段 3 的 Windows `0xC0000005` Native addon/Worker 卸载竞态，在“持久单 Worker + FIFO 请求队列 + shutdown/ack 优雅关闭”拓扑下未再复现。允许后续在显式特性开关下扩大**串行 shadow 观测**，但 Rust shadow 仍保持默认关闭，TypeScript 仍是唯一生产结果，不允许并行 Native Worker 或直接控制设备。

## 实现

- 新增可复用 Calibration Worker 客户端：惰性创建、正常响应后复用、FIFO 排队、120 秒超时、异常回收重建和 Worker 创建计数。
- Bridge 实时入口保留“忙时跳过”，Promise 入口从 100ms 轮询改为显式 FIFO；正常响应不再调用 `terminate()`。
- Calibration Worker 增加 shutdown/ack 协议；历史标定 Worker 完成后显式等待子 Worker 自然以 code 0 退出。
- timeout、postMessage 失败或 Worker error 时才强制回收；当前请求失败后，队列由新 Worker 继续处理。
- 实际 Worker benchmark 改为并发提交/单 Worker 执行，并拒绝报告中的 `measurements`、`samplesMs` 和原始厚度测点。

## 耐久与性能

- 正式矩阵共 120 个请求：关闭串行 15、影子串行 15、影子串行长跑 60、2 路提交 15、4 路提交 15；全部成功，各场景 `workerCreateCount=1`。
- 追加影子串行 300 请求：300/300 成功，Worker 创建 1 次，吞吐 4.788 次/秒，无生产结果差异、Native theta 差异、telemetry 错误或线程上限偏离。
- 300 请求场景：请求 P95 335.395ms、Native P95 10.793ms、shadow 总耗时 P95 11.644ms、事件循环 P95 26.755ms、CPU 核等效占用 1.136、RSS 峰值 341,962,752 bytes。
- 最新性能回归：Rust 核心加速 11.30–14.67 倍，含 DTO 端到端加速 10.15–14.53 倍，继续超过 3 倍/2 倍门槛。

## 验证

- Native/Shadow/Worker 生命周期回归 23/23 通过；Rust 单测 4/4、Clippy、`cargo fmt --check`、Prettier、lint、Electron Node typecheck 和 Vite production build 通过。
- AirRingServer typecheck 不再包含本阶段文件错误，仅保留仓库既有 `fft-js` 类型、旧 import assertion、历史无效导入和 `confirmCount` 等问题。
- DS02 领域精度仍独立偏差 10.452°，本阶段未修改或掩盖算法语义。

## 后续限制

- `AIR_RING_RUST_SHADOW` 继续默认关闭；若扩大观测，只允许当前单 Worker 串行拓扑。
- 不得恢复每请求创建/立即 `terminate()`，不得并行启动多个 Native Calibration Worker。
- Rust 接管生产结果仍需 DS02 精度修复、实际部署遥测和单独切换决策。

机器可读报告为 `native-shadow-soak.json`，300 请求扩展报告为 `native-shadow-soak.shadow-serial-300.json`；均只包含聚合统计。
