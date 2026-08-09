# 阶段 5：Rust Shadow 受控串行观测 Runbook

## 适用范围

本流程仅用于已通过阶段 4 持久单 Worker 验证的离线或受控环境。Rust 结果只写 telemetry，TypeScript `maxAngle` 始终是唯一生产结果。不得据此启用 Rust 生产接管，也不得并行启动多个 Native Worker。

## 前置条件

- 使用项目 `mise.toml` 中的 Node 24.18.0、pnpm 10.18.3、Rust 1.88.0。
- 已完成 Native release 与 Calibration Worker production build。
- 观测期间确认只有一个持久 Calibration Worker；不运行旧版“一请求一 Worker”程序。
- 日志目录有足够空间且只保存 telemetry，不采集原始厚度测点。

## 推荐受控配置

在启动目标进程的同一 PowerShell 会话中显式设置：

```powershell
$shadowLog = Join-Path $env:LOCALAPPDATA 'JJSK\logs\rust-shadow.ndjson'
$env:AIR_RING_RUST_SHADOW = '1'
$env:AIR_RING_RUST_SHADOW_THREADS = '4'
$env:AIR_RING_RUST_SHADOW_EVERY_N = '5'
$env:AIR_RING_RUST_SHADOW_MAX_RUNS = '100'
$env:AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES = '3'
$env:AIR_RING_RUST_SHADOW_MAX_DELTA_DEG = '0.000000001'
$env:AIR_RING_RUST_SHADOW_LOG_PATH = $shadowLog
```

含义：从第 1 个请求开始每 5 次采样一次，单个 Worker 最多执行 100 次 Rust shadow；连续 3 次失败、不可比或角度差超过 `1e-9°` 后自动停止。本项目不会自动写入这些环境变量或修改部署配置。

## 观测步骤

1. 先在无设备控制副作用的离线回放中启动目标进程，确认 Rust shadow 日志状态为 `success`。
2. 验证 TypeScript `maxAngle` 与 shadow 关闭时一致，且 telemetry 的 `absoluteAngleDeltaDeg <= 1e-9`。
3. 小批量观测后正常关闭进程；shutdown/ack 会等待已排队 NDJSON 写入完成。
4. 使用 task 内脚本生成聚合报告：

```powershell
mise exec -c "node .agents/tasks/rust-performance-migration/scripts/aggregateRustShadowObservation.mjs <input.ndjson> <output.json>"
```

5. 仅审查聚合报告中的 `statusCounts`、`finalState`、角度差和 Native/总延迟；不要把逐条 NDJSON 当作业务数据归档。

## 立即停止条件

- `finalState` 为 `circuitOpen`。
- 任一 `loadError`、`executionError` 或 `notComparable` 连续出现。
- `absoluteAngleDeltaDeg.max > 1e-9`。
- `nativeElapsedMs.p95 >= 100ms`，或主流程出现新增超时/Worker 异常退出。
- Worker 创建数不再保持 1，或发现并行 Native Worker。

## 回滚

关闭目标进程后清除当前 PowerShell 会话中的 shadow 环境变量，或直接关闭该终端会话。下次启动未设置 `AIR_RING_RUST_SHADOW=1` 时自动恢复默认关闭；无需修改代码、数据库或设备配置。

## 阶段边界

本 runbook 只准备受控观测能力。真实设备/生产环境观测需要另行授权与值守，Rust 生产接管仍为 no-go；DS02 的 `10.452°` 领域精度问题继续独立处理。
