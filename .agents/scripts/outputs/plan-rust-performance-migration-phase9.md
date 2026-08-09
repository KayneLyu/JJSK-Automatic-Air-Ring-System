# Rust 性能迁移 Phase 9 计划

## 目标

在不启动完整 Electron、ADBox 或 S7 的前提下，对已启用的 mise Bubble Rust primary 进行真实历史输入长周期验证，并形成安装包部署准备度结论。

## 步骤

1. 为历史观测入口增加有界 repeat 参数及资源聚合指标，默认行为保持一次回放。
2. 新增 task 内 PowerShell 启动器，复用只读数据库快照、Electron Node 和结构化 Worker telemetry。
3. 使用当前 13 个唯一有效 profile 累计至少 1000 次 Rust primary success，验证 hash 稳定、0 fallback、单 Worker。
4. 运行类型检查、构建、相关测试与数据库完整性检查。
5. 独立记录当前仅有一个历史数据库；即使重复稳定性通过，也不自动修改安装包或 RLS 路径。

## 验收门槛

- primary success >= 1000，fallback = 0，Worker 创建数 = 1。
- 每个 sweep 的成功 profile 在所有 repeat 中 SHA-256 不漂移。
- 至少 10 个唯一有效 profile，正反方向均覆盖。
- 事件循环 P95 < 100ms，结束 RSS 不表现为随请求数线性增长。
- 数据库、sidecar 与 journal 格式前后完全一致。
- 报告不包含原始测厚点、profile 数组或数据库绝对路径。
