# Rust 性能迁移阶段 4 计划

## 目标

修复阶段 3 发现的 Native addon/Worker 卸载竞态：将 Calibration Worker 从“每请求创建并立即强制终止”改为“进程内持久 Worker + 串行请求队列”，并通过显式关闭握手覆盖历史回放等短生命周期父 Worker。Rust shadow 继续默认关闭，TypeScript 继续提供唯一生产结果。

## 实施步骤

1. 抽取可测试的 Calibration Worker 客户端，惰性创建并复用单个 Worker，统一请求 ID、120 秒超时、队列和异常重建。
2. 保留实时入口“忙时跳过”的既有语义；Promise 入口改为显式 FIFO 排队，移除 100ms 轮询和成功后的 `terminate()`。
3. 扩展 Worker 消息协议，增加 shutdown/ack；只在无活动请求时优雅关闭，并等待 Worker 自然以 code 0 退出。
4. 历史标定 Worker 在任务结束时显式关闭其嵌套 Calibration Worker，避免父 Worker 退出时强制卸载 Native addon。
5. 将实际 Worker soak benchmark 改为复用同一客户端；2/4 路场景表示并发提交但由单 Worker 串行处理，验证 CPU 不再过度订阅。
6. 构建 Native 与 Electron Worker，运行 60+ 请求串行、2/4 路提交耐久、回归测试、lint、格式和 typecheck。
7. 仅在全部请求、数值等价、线程上限、事件循环和进程稳定性门槛通过时，重新评估 shadow 是否可扩大观测。

## 安全门槛

- 用户已在 2026-08-02 明确要求继续，授权修改高风险 `calibrationBridge.ts` 生命周期逻辑。
- 不修改设备连接、控制指令、标定算法选择、`maxAngle` 语义或 DS02 领域规则。
- 实时入口在忙时仍跳过；历史入口按 FIFO 等待，不引入并行 Native Worker。
- 正常响应不调用 `terminate()`；超时、postMessage 失败或 Worker 异常时才强制回收。
- shutdown 只允许在队列为空且无活动请求时执行，并等待自然退出。
- 验收仅使用 DS01–DS05 离线数据，不启动设备控制链路。

## 验收标准

- 单个客户端的连续请求复用同一 Worker，60+ 次影子请求无崩溃、无结果差异和 telemetry 错误。
- 2/4 路并发提交均由一个 Worker 串行完成，所有请求成功且 Rayon telemetry 保持 4 线程。
- 正常请求后无 `terminate()`；显式 shutdown 收到 ack 并以 code 0 退出。
- Worker 超时或异常能拒绝当前请求、保留队列并惰性重建，不永久锁死。
- TypeScript `maxAngle` 不变，Rust/base theta 绝对差异不超过 `1e-9°`，事件循环 P95 小于 100ms。
- 阶段 2/3 回归、Rust 单测、构建、lint 和格式通过；typecheck 不新增错误。
