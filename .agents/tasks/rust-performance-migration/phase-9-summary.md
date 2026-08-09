# Phase 9：Bubble Primary 历史长周期与部署准备度摘要

## 结论

本机历史稳定性通过；安装包部署准备度仍为 no-go。mise 开发环境继续启用 Bubble Rust primary，安装包与 RLS 继续使用 TypeScript。

## 稳定性结果

- 1 个历史数据库、30 趟、13 个唯一有效 profile，覆盖 forward/reverse。
- 77 次有界回放共 2310 次尝试，1001 次 Rust primary success、0 fallback、0 hash 漂移、单 Worker。
- Rust 重建中位/P95：0.0871/0.3853ms；生产链中位/P95：1.0842/1.8563ms。
- 事件循环 P95：16.0809ms；结束 RSS 增量约 4.1MiB，趋势约 94KiB/pass。
- 数据库、sidecar 哈希与 rollback journal 格式均未变化。

## 查询内存优化

首次长跑发现 Query Worker 完整物化扫描行导致峰值 RSS 4,122,468,352 bytes。改为同一只读事务内 COUNT + iterator 有界均匀采样后：

- profile 哈希优化前后 13/13 完全一致；
- 峰值 RSS 降至 149,807,104 bytes，约下降 96.4%；
- 每趟仍报告原始 `sourceRowCount`，但最多传输 2000 个采样对象。

## 工程门禁

- Phase 9 Vitest 41/41。
- Rust 8/8。
- Electron Node typecheck、Prettier、Vite build 通过。
- 未启动完整 Electron、ADBox 或 S7。

## 部署门槛

重复稳定性不能替代独立数据集覆盖。安装包候选至少需要 3 个独立历史数据库分别通过既有等价、fallback、只读与资源门槛；当前只有 1 个，仍缺 2 个。

最终报告：`scripts/outputs/phase-9-history-soak-20260809-140836.json`。
