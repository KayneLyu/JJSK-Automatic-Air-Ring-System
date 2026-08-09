# Phase 8B 历史 Bubble Shadow 摘要

- 样本：1.26 GB 旧 `jjsk.db`，只读 Electron-Node 回放，不启动完整 Electron 或设备连接。
- 路径：`bubbleQueryWorker → buildProfileAsync/sweepProfileBuilder → persistent bubbleWorker`。
- 范围：最近 50 个换向区间；30 个有测厚覆盖，13 个形成有效 48-bin profile。
- 等价性：13/13 shadow success，Native failure 0，最大 profile 差异 0μm。
- 性能：完整重建中位 0.2642ms → 0.0869ms（3.0403×）；求解中位加速 1.5798×。
- 生命周期：Bubble Worker 创建数 1；300 次合成长跑 300/300 success，最大差异 0。
- 数据安全：数据库、sidecar 的长度/mtime/SHA-256 未变化，rollback journal 格式未变化；报告不含原始测点或 profile 数组。
- 结论：`go-primary-candidate`；Phase 8B 不启用 primary，Phase 8C 先完成默认关闭开关、完整 TypeScript 回退、历史双跑与长跑。
