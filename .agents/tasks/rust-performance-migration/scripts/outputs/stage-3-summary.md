# 阶段 3：实际 Worker 离线耐久与并发预算

## 结论

阶段 3 的离线评估已完成，但稳定性验收为 **no-go**。Rust shadow 必须继续保持默认关闭，不得扩大生产观测或接管结果。

## 已验证结果

- 使用生产构建的 `dist-electron/calibrationWorker.js` 与 DS01–DS05，完成影子关闭串行、影子开启串行和 4 路并发的 15 请求短跑；请求、生产角度、Native/base theta、telemetry 与 4 线程上限均无错误。
- 成功场景事件循环 P95 最大为 18.792ms，低于 100ms 门槛；4 路并发吞吐为 6.239 次/秒，CPU 核等效占用为 4.244。
- 60 请求影子串行测试曾完整通过一次，随后同一正式编排以 Windows `0xC0000005`（访问冲突）非确定性崩溃。
- 将 Rayon 从全局线程池改为每次搜索局部线程池并等待线程退出后，崩溃仍可复现；因此线程退出改动降低了嫌疑，但没有消除 Native addon/Worker 卸载竞态。
- 阶段回归 20/20、Rust 单测 4/4 通过；Rust 核心加速 8.85–13.95 倍，含 DTO 端到端加速 7.91–14.19 倍，仍满足性能门槛。
- DS02 领域精度仍独立失败 10.452°，本阶段未更改算法语义或掩盖该问题。

## 阻断分析

当前 Bridge 为每个请求创建一个 Worker，并在收到结果后立即调用 `worker.terminate()`。Native 模块在该 Worker 内加载并执行；短时间反复创建、强制终止和卸载时存在非确定性访问冲突。由于崩溃发生在进程级 Native 生命周期，JavaScript 的错误回退无法捕获。

## 下一步建议

进入下一阶段前，需要用户明确授权修改高风险文件 `apps/AirRingSys/electron/calibrationBridge.ts`。推荐优先改为持久 Worker + 串行请求队列；备选方案是加入显式 graceful-shutdown 握手，确认 Native 调用和清理完成后再终止 Worker。修复后必须重新运行 60+ 请求串行及 2/4 路并发耐久门槛。

机器可读阻断报告见 `native-shadow-soak-blocker.json`；各成功样本报告保留在同目录中，均不包含原始测点。
