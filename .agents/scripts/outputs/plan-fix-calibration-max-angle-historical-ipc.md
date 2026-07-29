# Plan: 修复历史上旋最大角度 IPC 未注册

1. 在活动的主进程 `PROXIED_CHANNELS` 中注册 `calibration-max-angle-historical`，不恢复无调用方的旧 `initCalibrationIpc`。
2. 在 utility worker 中实现同名处理器：校验角度范围与目标模式，定位最近至少两个完整上旋行程的时间窗口。
3. 复用现有只读 SQLite `historicalCalibrationWorker` 执行历史回放和角度 Worker 估算，避免阻塞 utilityProcess 实时数据管线。
4. 将历史标定类 IPC 的主进程等待上限设为 130 秒，覆盖内部 Worker 的 120 秒超时；普通 IPC 继续保持 60 秒。
5. 运行 Prettier、相关类型感知 lint、AirRingSys 主进程 typecheck/build 检查和 `git diff --check`，确认 active proxy 与 worker handler 同时存在。

## 验收标准

- 渲染进程调用 `calibration-max-angle-historical` 时主进程存在 handler，并能代理到 utility worker。
- 无数据库、非法范围、非法目标模式或不足两个完整行程时返回结构化失败，不抛出“未注册 handler”。
- 历史计算不在 Electron 主进程或 utilityProcess 主线程执行 CPU 密集角度估算。
- 不修改设备控制逻辑和当前上旋算法优化文件。
