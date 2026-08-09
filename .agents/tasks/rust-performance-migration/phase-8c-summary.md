# Phase 8C：膜泡 Batch Rust Primary 完成摘要

## 结论

Phase 8C 验收通过，Bubble Batch Rust primary 已仅在 mise 开发环境启用。非 mise、安装包和 RLS 继续使用 TypeScript；设置 `AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE=1` 可即时回滚。

## 验收结果

- 历史双跑：30 趟，13 个有效 profile 哈希精确匹配，语义 mismatch 0，Rust 13/13 success、0 fallback。
- 历史性能：TypeScript/Rust primary 中位重建 3.6264/2.7912ms，加速 1.2992 倍。
- 稳定性：300 次正式请求及 5 次预热全部走 Rust，0 fallback，单持久 Worker，最大 profile 差异 0。
- 运行质量：请求中位 0.8634ms，事件循环 P95 15.3846ms，RSS 未呈线性增长。
- 数据安全：历史数据库和 sidecar 快照未变化，rollback journal 格式未变化；报告只保存聚合数据及 profile 哈希。
- 工程门禁：Rust 8/8、Phase 8 Vitest 38/38、Prettier、Electron Node typecheck、Vite build 全部通过。

## 产物

- 历史双跑报告：`scripts/outputs/phase-8c-history-20260809-131552.json`
- 300 次长跑报告：`scripts/outputs/phase-8c-bubble-primary.json`
- 历史双跑入口：`scripts/runBubblePrimaryHistoricalComparison.ps1`
- 长跑入口：`scripts/runBubblePrimaryPhase8C.ts`

## 保留边界

- Bubble primary 与 shadow 必须互斥。
- Native 加载、执行、结果校验或后处理失败时必须完整重跑 TypeScript。
- 安装包不得默认设置 Bubble primary；扩大部署范围或迁移 RLS 前需重新验收。
