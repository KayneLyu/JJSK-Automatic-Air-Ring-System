# checklist.md — agent-task-lifecycle 验收清单

> 执行 agent-task-lifecycle 后，必须逐项检查。所有 ✅ 项必须通过。

---

## ✅ 结构完整性

- [ ] `.agents/templates/task-template.md` 存在且完整
- [ ] `.agents/tasks/README.md` 存在且完整
- [ ] `.agents/tasks/archive/` 目录存在
- [ ] `.agents/guide/execution.md` 已补齐 task 生命周期规则

---

## ✅ 内容质量

- [ ] 已完成目标语言判定，并记录判定依据
- [ ] 新创建的 task 目录文件使用同一目标语言
- [ ] `execution.md` 覆盖 Task Identification First
- [ ] `execution.md` 覆盖 Task 创建规则
- [ ] `execution.md` 覆盖 One Task One Stream（新任务必须新并行线程）
- [ ] `execution.md` 明确分支/worktree 由用户创建与切换，skill 不自动管理
- [ ] `execution.md` 覆盖目录化 task 跟踪与 `plan.md` 先写要求
- [ ] `execution.md` 覆盖 task 脚本与输出目录规则（`scripts/` / `scripts/outputs/`）
- [ ] `execution.md` 覆盖 Task Switch Guard
- [ ] `execution.md` 覆盖“切换确认记录”策略（已切换/未切换）
- [ ] `task-template.md` 提供 `context.md`、`plan.md`、`progress.md`、`decisions.md` 模板
- [ ] `task-template.md` 或 `tasks/README.md` 说明了可选 `scripts/` 与 `scripts/outputs/` 目录的使用方式
- [ ] `progress.md` 模板与相关规则要求新记录时间精确到分钟（`YYYY-MM-DD HH:mm`）
- [ ] `decisions.md` / `.agents/memory/decisions.md` 的新记录时间要求精确到分钟（`YYYY-MM-DD HH:mm`）
- [ ] `tasks/README.md` 包含创建规则、标准文件、可选脚本目录、状态流转、归档/压缩/删除规则与命名建议
- [ ] task 规则明确要求：脚本或 CLI 输出过长 / 难捕获时优先转存文件
- [ ] task 与线程映射（可选 `.agents/tasks/index.md`）规则已声明（session/workdir）

---

## ✅ 更新策略

- [ ] 未覆盖用户已有内容
- [ ] 已有规则被合并而非替换
- [ ] 无差别重写未发生
- [ ] 仅补充了缺失文件和内容

---

## ✅ 输出完整性

- [ ] 输出了所有生成/更新/保留文件的变更清单
- [ ] 新生成文件展示了完整内容
- [ ] 更新文件说明了变更部分
- [ ] 包含 5–10 行执行总结（task 识别、切换保护、归档策略）
- [ ] 未输出无关解释

