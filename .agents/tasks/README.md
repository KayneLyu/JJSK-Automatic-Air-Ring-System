# Tasks 目录使用说明

## 何时创建 Task

由 LLM 根据复杂度、规模与记录价值自主判断：

- **建议创建**：>3 轮迭代、多文件修改、跨模块协调、需要长期跟踪
- **无需创建**：单文件修复、文档更新、简单查询

## 标准文件

| 文件 | 说明 |
|------|------|
| `context.md` | 任务背景、涉及文件、约束、相关测试 |
| `plan.md` | 必须先写的计划与验收项 |
| `progress.md` | 只追加的进度日志（YYYY-MM-DD HH:mm） |
| `decisions.md` | 任务级取舍与影响 |

## 可选脚本目录

- `scripts/` — task 内脚本
- `scripts/outputs/` — 脚本输出与中间结果
- 输出过长时立即转存

## 状态流转

`active` → `completed` → `archived` → `deleted`（删除可选）

## 归档规则

- 已完成且已验证的任务尽快移入 `.agents/tasks/archive/<task-slug>/`
- 超过 14 天未更新且不再活跃的任务也应归档
- 归档时保留 `decisions.md`、关键结论与摘要
- 压缩冗余：合并重复信息，删除过期 plan/progress 噪声

## 命名建议

- slug 应稳定、短而可读
- 例如：`fix-api-docx-download`、`refine-bubble-reconstruction`、`feat-thickness-reverse`

## Task 与线程映射

- 可选维护 `index.md` 记录 task-slug、branch、worktree、status
