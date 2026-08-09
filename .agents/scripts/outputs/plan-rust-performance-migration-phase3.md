# Rust 性能迁移阶段 3 计划

## 目标

在不连接设备、不修改生产算法和控制链路的前提下，使用实际构建出的 Calibration Worker 进行离线影子耐久与并发预算验证，量化默认 4 个 Rayon 线程在串行及 2/4 路并发下的正确性、延迟、吞吐、CPU、内存和主线程事件循环影响。

## 实施步骤

1. 新增独立 benchmark，复用 DS01–DS05 与生产 `calibrationWorker.js`，模拟现有 Bridge 的“一请求一 Worker”生命周期。
2. 建立 shadow-disabled 串行基线，并运行 shadow-enabled 的串行、并发 2 路和并发 4 路场景。
3. 每个场景重复完整数据集循环，记录请求延迟 min/median/P95/max、吞吐、进程 CPU 核等效占用、RSS 起止/峰值和事件循环 P95/max。
4. 验证 TypeScript `maxAngle` 在开关前后完全一致、Rust theta 与 TypeScript base theta 等价、错误率为零、线程上限保持为 4，持久化机器可读 JSON。
5. 运行 Native 构建、Vite Worker 构建、阶段 3 benchmark、阶段 2 回归、lint、格式和 typecheck 验收。
6. 根据结果给出允许扩大影子观测、降低并发/线程数或暂停推进的明确结论。

## 安全门槛

- 仅使用仓库 DS01–DS05 离线数据，不启动 Electron UI、不连接设备、不发送控制指令。
- TypeScript 始终是唯一生产结果；本阶段不修改上旋算法选择和 DS02 规则。
- benchmark 报告不写入原始厚度测点，只保存聚合统计与数据集标识。
- Rayon 固定为 4 线程；任何 telemetry 线程数偏离、结果差异或 Worker 错误均使验收失败。
- 并发测试最多 4 路，避免无界创建 Worker。

## 验收标准

- disabled/serial、shadow/serial、shadow/concurrency-2、shadow/concurrency-4 四个场景均完成。
- 所有请求成功，TypeScript 生产角度未改变，所有成功 telemetry 的绝对差异不超过 `1e-9°`。
- 事件循环 P95 小于 100ms，报告包含 CPU/RSS 数据且不含 `measurements` 原始字段。
- 阶段 2 数值、隔离、构建与打包规则无回归。
- DS02 10.452° 领域精度问题继续独立记录，留到单独算法阶段处理。
