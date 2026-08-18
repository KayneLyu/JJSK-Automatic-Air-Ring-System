# Task 与线程映射

记录每个任务对应的分支与 worktree。

| task-slug                       | branch                               | worktree                              | status  |
| ------------------------------- | ------------------------------------ | ------------------------------------- | ------- |
| bubble-thickness-reconstruction | feat/bubble-thickness-reconstruction | main worktree (当前活跃)              | active  |
| film-width-tracking             | feat/film-width-tracking             | ../wt-film-width-tracking（待创建）   | planned |
| generalize-upper-rotation-angle | main（用户指定）                     | main worktree（用户确认复用）         | active  |
| rust-performance-migration      | main（用户指定当前工作区）           | main worktree（本会话继续前一轮评估） | active  |
| remove-packaged-node-modules    | main（当前工作区）                   | main worktree（当前会话延续 ASAR 分析） | completed |

> 备注：因主 worktree 已切换至 `feat/bubble-thickness-reconstruction` 分支，本任务直接在主目录工作。后续新任务创建独立 worktree 时需先切回 main。
>
> **film-width-tracking**：用户已明确要求开始新任务，待用户审阅方案后执行。需在独立分支 + worktree 中工作，避免与 `bubble-thickness-reconstruction` 冲突。
>
> **generalize-upper-rotation-angle**：计划已于 2026-07-27 落档。用户随后明确要求复用当前目录与 `main` 分支，已记录隔离例外并开始实施。
>
> **rust-performance-migration**：阶段 0–11 已完成；上旋搜索和膜泡 Batch 均已接入 Rust Native primary，TypeScript 保留领域编排与完整回退。Bubble 已通过单库 13 个唯一 profile、1001 次历史长跑并将查询峰值 RSS 从约 3.84GiB 降至 143MiB。`pnpm build:field` 生成免开发环境完整包；Electron 版本不变时，`pnpm build:content` 另生成经运行时/ABI、逐文件哈希、原子替换和副本自检验证的约 24MiB 内容 7z。正式内容发布仍需签名门禁；独立数据库覆盖不足、RLS 与 DS02 领域精度问题继续保留。
>
> **remove-packaged-node-modules**：当前会话延续既有 ASAR 体积分析，目标仅为生产打包产物不携带或解析 `node_modules`；开发态继续使用 pnpm `node_modules`。用户已确认复用当前工作目录，不构成新任务切换。
> 2026-08-13 已完成：正式构建的 `app.asar` 为 4.63 MiB，生产 resources 无 `node_modules`，开发态 node_modules 探针与生产 Native/SQLite 自检均通过。按安全规则保留 completed 目录，待明确授权后再移动归档。
