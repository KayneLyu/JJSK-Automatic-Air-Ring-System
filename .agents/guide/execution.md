# execution.md — 执行协议

## Exploration First

修改任何文件前，必须先扫描并分析相关代码库，理解现有模式与约束。

## Plan First

任务开始前，先写 Plan 文件（`.agents/scripts/outputs/plan-*.md`），列出所有步骤。

## Minimal Diff

- 最小化变更范围，禁止在任务范围外重构
- 不顺手格式化无关代码
- 不顺手重命名无关变量
- 不顺手删除无关注释

## Script First

- Python/JavaScript 等代码脚本避免以内联字符串传给 CLI（`python -c`、`node -e`）
- 脚本文件放在 `.agents/scripts/`，输出写入 `.agents/scripts/outputs/`
- 复杂或需复用的 shell 逻辑优先生成脚本文件（如 `.sh`、`.ps1`）
- 简单直接的 CLI 命令可直接执行，无需一律脚本化
- 输出过长时立即转存到文件

## 禁止自动执行测试

除非用户明确要求：
- 代码修改完成后，**不要**自动运行 `pnpm test` 或 `vitest`
- 如果用户取消了测试执行，不要再次尝试

## 上旋算法工作流（迭代优化）

### 每次迭代的最小工作流

按以下 5 步循环执行：

1. **读取**：快速浏览 `.agents/memory/context.md` 和 `.agents/memory/decisions.md`（尤其是最新状态）
2. **总结**：用 3-5 条要点总结当前状况
3. **执行**：实施仅一项最小高收益动作（算法改动 / 测试 / 分析）
4. **验证**：使用测试矩阵中的命令进行测试（见下方）
5. **更新**：
   - 每次有意义的运行都要更新 `.agents/memory/context.md`
   - 做出重要决策时更新 `.agents/memory/decisions.md`

### 测试矩阵

```bash
# 全量测试（真实 + 模拟器）
cd packages/AirRingServer
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts

# 仅真实数据集
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"

# 仅模拟器数据集
pnpm exec vitest run algorithms/upperRotation/tests/simulator/*.test.ts

# 仅模拟器 A/B 对照
pnpm exec vitest run algorithms/upperRotation/tests/simulatorAB/*.test.ts

# 诊断测试
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.diag.test.ts
pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.landscape.test.ts
```

### 验收标准

- 真实数据集 DS01..DS05：各项误差 < 5°
- 模拟器集合：各项误差 < 5°
- 改进真实数据集时无模拟器回归

## 提交规范

- 遵循 gitmoji + 中文提交信息
- 格式：`<emoji> <描述>`
- 不自动提交，不自动推送

## 完成标准

- 修改完成后，主动运行 lint 和 typecheck
- 确认无 TypeScript 编译错误后再告知用户

---

## Task 生命周期规则

### Task Identification First

每轮用户消息必须先识别任务类型：
- **继续当前任务**：消息内容与当前 task 上下文一致
- **新任务**：消息内容与当前 task 无关，或明确要求开始新任务
- **切换不明确**：需要向用户确认是否切换任务

### Task 创建规则

由 LLM 根据任务复杂度、规模与记录价值自主判断是否创建 task 目录。

**建议创建 task 的场景**：
- 预计超过 3 轮迭代
- 涉及多个文件修改
- 需要跨模块协调
- 需要长期跟踪进度与决策

**无需创建 task 的场景**：
- 单文件修复
- 文档更新
- 简单查询或说明

### One Task One Stream（任务隔离）

识别到"新任务"时，必须新建并行线程：
- 新会话（新开对话窗口）
- 新分支：`fix/<task-slug>`、`feat/<task-slug>` 或 `chore/<task-slug>`
- 新 worktree：`../wt-<task-slug>`

**禁止**：在当前线程中直接切换任务，避免工作目录串改。

### Task 目录结构

复杂任务使用目录跟踪，位于 `.agents/tasks/<task-slug>/`：

```
.agents/tasks/<task-slug>/
├── context.md      ← 任务背景、涉及文件、约束、相关测试
├── plan.md         ← 必须先写的计划与验收项
├── progress.md     ← 只追加的进度日志（YYYY-MM-DD HH:mm）
├── decisions.md    ← 任务级取舍与影响（YYYY-MM-DD HH:mm）
└── scripts/
    └── outputs/    ← 脚本输出与中间结果
```

**规则**：
- 必须先写 `plan.md`，再实施变更
- task 内脚本放在 `.agents/tasks/<task-slug>/scripts/`
- 脚本输出放在 `scripts/outputs/`
- 输出过长或难捕获时，立即转存到文件

### Task Switch Guard

任务切换时：
1. 检查当前分支是否有未提交修改
2. 若有修改：尝试 auto-commit（基于 diff 生成描述性 message）
3. 若 commit 失败：回退到 auto-stash
4. 切换到新任务的分支与 worktree

**禁止**：在未处理当前分支状态的情况下切换任务。

### Task 与线程映射

推荐在 `.agents/tasks/index.md` 记录映射关系：

| task-slug | branch | worktree | status |
|-----------|--------|----------|--------|
| bubble-thickness-reconstruction | feat/bubble-thickness-reconstruction | ../wt-bubble-thickness-recon | active |

### Commit/Stash Message 自动生成

- 基于 `git diff --stat` 与变更文件列表
- 描述核心修改内容，避免空泛（如 "update files"）
- 格式遵循 gitmoji + 中文
