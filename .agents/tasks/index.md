# Task 与线程映射

记录每个任务对应的分支与 worktree。

| task-slug | branch | worktree | status |
|-----------|--------|----------|--------|
| bubble-thickness-reconstruction | feat/bubble-thickness-reconstruction | main worktree (当前活跃) | active |
| film-width-tracking | feat/film-width-tracking | ../wt-film-width-tracking（待创建） | planned |

> 备注：因主 worktree 已切换至 `feat/bubble-thickness-reconstruction` 分支，本任务直接在主目录工作。后续新任务创建独立 worktree 时需先切回 main。
>
> **film-width-tracking**：用户已明确要求开始新任务，待用户审阅方案后执行。需在独立分支 + worktree 中工作，避免与 `bubble-thickness-reconstruction` 冲突。
