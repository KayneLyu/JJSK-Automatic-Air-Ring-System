# 阶段 6：Rust Shadow 真实环境观测人工门禁

## 当前状态

技术预检已通过，但尚未授权启动完整 Electron 应用。应用启动会初始化 ADBox，并尝试连接上旋 S7；这会改变外部连接状态，因此必须由现场人员确认后再执行。

## 启动前必须逐项确认

- [ ] 现场操作人员已在设备旁值守，并了解本次只做 shadow 观测。
- [ ] 已确认当前生产窗口允许应用建立 ADBox 与上旋 S7 连接。
- [ ] 急停功能和当前急停状态已人工确认；任何异常可立即停止应用和设备动作。
- [ ] 自动调整、扫描控制或其他可能发送运动指令的功能已停用，或已由现场负责人确认不会触发。
- [ ] 当前没有其他 AirRing/Electron 实例，避免多个进程同时连接设备。
- [ ] 观测日志使用绝对路径，目录权限和剩余空间满足要求。
- [ ] 观测参数固定为单 Worker、4 个 Rayon 线程、每 5 次采样、最多 100 次、连续 3 次异常熔断。
- [ ] 已明确观测窗口、停止条件、回滚责任人和现场联系方式。
- [ ] 用户再次明确授权启动会自动连接设备的 Electron 应用。

## 建议环境变量

只有上述门禁全部确认后，才在用于启动应用的独立 PowerShell 会话设置：

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

设置后应再次运行技术预检。此时 `shadowEnvironmentClean` 会按设计变为 false，因此第二次检查只用于人工核对具体启动会话，不作为“清洁环境”门槛通过依据。

## 立即停止条件

- 出现任何非预期运动、自动控制动作或设备报警。
- ADBox/S7 连接影响现有生产客户端，或出现重复连接冲突。
- Worker 异常退出、进程崩溃、请求超时或 `circuitOpen`。
- 任一连续 `loadError`、`executionError`、`notComparable`。
- 聚合角度差最大值超过 `1e-9°`，或 Native P95 达到 100ms。

## 停止与回滚

1. 正常关闭应用，让 Calibration Worker 完成 shutdown/ack 与日志刷新。
2. 若出现设备风险，现场人员优先按设备安全流程处置，不等待 telemetry 汇总。
3. 关闭本次 PowerShell 会话，或清除其中的 `AIR_RING_RUST_SHADOW_*` 环境变量。
4. 不设置 `AIR_RING_RUST_SHADOW=1` 重新启动时，Rust shadow 自动恢复默认关闭。
5. 使用聚合脚本生成报告；不要提交或归档逐条 NDJSON 运行日志。

## 聚合命令

```powershell
mise exec -c "node .agents/tasks/rust-performance-migration/scripts/aggregateRustShadowObservation.mjs <input.ndjson> <output.json>"
```
