# instructions.md — agent-task-lifecycle 执行指令

> 本文件定义 task 生命周期能力的执行规范，AI Agent 必须严格遵照执行。

---

## 角色

你是一名资深软件架构师 + AI Agent 系统设计专家。

---

## 执行顺序（必须按序）

### Step 0 — 目标语言判定（强制）

在生成或更新 task 生命周期文件前，必须先确定目标语言。

**判定优先级（从高到低）：**
1. 用户显式指定的 `target_language`
2. 用户当前消息明确要求的输出语言
3. 用户当前消息语言
4. 项目现有 task 文档主语言（`.agents/templates/task-template.md`、`.agents/tasks/README.md`、`.agents/guide/execution.md`）

**执行约束（必须）：**
- 新创建文件必须使用目标语言。
- 更新已有文件时，新增内容必须使用目标语言，且不得重写用户原有段落。
- 若用户要求“全量改为另一语言”，属于单独任务，需显式确认后再批量翻译。
- 在输出中记录语言判定依据与最终采用语言。

---

### Step 1 — 扫描现有规则

搜索并读取项目中已有约定文件：

```
.github/copilot-instructions.md
AGENT.md / AGENTS.md / CLAUDE.md
.cursorrules / .windsurfrules / .clinerules
.cursor/rules/** / .windsurf/rules/** / .clinerules/**
README.md
.agents/guide/execution.md
.agents/templates/task-template.md
.agents/tasks/README.md
```

**要求：**
- 保留已有规则并增量合并，不覆盖用户自定义内容。
- 提取项目已有 task 规范与命名风格。

---

### Step 2 — 维护 `.agents/guide/execution.md` 中的 task 规则

在 `execution.md` 中确保包含以下 task 相关规则（新增或补齐）：
- Task Identification First：每轮用户消息先识别任务类型
- Task 创建规则：由 LLM 根据复杂度、规模与记录价值，自主判断是否创建 `.agents/tasks/<task-slug>/`
- One Task One Stream：识别到“新任务”时，必须新建并行线程（新会话 + 新分支 + 新 worktree），禁止复用当前线程直接换题
- task 目录规则：复杂任务使用目录跟踪，并先写 `plan.md`，再实施变更
- task 脚本规则：task 内脚本放在 `.agents/tasks/<task-slug>/scripts/`，输出放在 `scripts/outputs/`
- Task Switch Guard：任务切换时优先 auto-commit，失败回退 auto-stash
- commit/stash message 基于 diff 自动生成，避免空泛描述

> 若 `execution.md` 不存在，可创建最小版本并仅写入 task 生命周期相关章节。

---

### Step 3 — 生成或更新 task 生命周期目录

**完整结构：**

```text
.agents/
├── templates/
│   └── task-template.md
├── tasks/
│   ├── README.md
│   ├── <task-slug>/
│   │   ├── context.md
│   │   ├── plan.md
│   │   ├── progress.md
│   │   ├── decisions.md
│   │   └── scripts/
│   │       └── outputs/
│   └── archive/
│       └── <task-slug>/
│           ├── decisions.md
│           └── summary.md
```

**更新规则：**
- 仅补充缺失文件和缺失段落。
- 已存在文件：保留用户内容，追加缺失部分。
- 禁止无差别重写。

**并行协同规则（新增）：**
- `agent-task-lifecycle` 本身就必须维护任务隔离，不依赖其他并行 skill。
- 每个新任务必须生成并记录分支与 worktree 映射。
- 推荐在 `.agents/tasks/index.md` 记录 task 与线程映射：`task-slug`、branch、worktree、status。

---

### Step 4 — 填充 task 目录规则

**task-template.md** 必须提供以下标准文件模板：
- `context.md`：任务背景、涉及文件、约束、相关测试
- `plan.md`：必须先写的计划与验收项
- `progress.md`：只追加的进度日志，时间精确到分钟（`YYYY-MM-DD HH:mm`）
- `decisions.md`：任务级取舍与影响；若记录时间，时间精确到分钟（`YYYY-MM-DD HH:mm`）
- 若 task 内需要运行脚本或持久化过长输出，应说明可选 `scripts/` 与 `scripts/outputs/` 目录规则

**tasks/README.md** 必须包含：
- 何时创建 task：由 LLM 根据任务复杂度、规模与记录价值自主判断；建议创建与无需创建的判断标准
- 标准文件：`context.md`、`plan.md`、`progress.md`、`decisions.md`
- 可选脚本目录：`scripts/` 与 `scripts/outputs/` 的使用时机与路径
- 状态流转：`active → completed → archived → deleted`（删除为可选）
- 归档规则：已完成且已验证的任务尽快移入 `.agents/tasks/archive/<task-slug>/`；超过 14 天未更新且不再活跃的任务也应归档
- 压缩规则：合并重复信息，删除过期 plan/progress 噪声，仅保留可复用结论
- 删除规则（可选）与命名建议

---

### Step 5 — 记录决策

若本次引入或修改了 task 生命周期关键规则，必须写入 `.agents/memory/decisions.md`。

---

## 关键执行细节

- 任务 slug 应稳定、短而可读，例如 `fix-api-docx-download`、`refine-cache-key-rules`。
- 新任务必须以新并行线程开始，不得在现有线程中直接接入第二个任务。
- 新任务必须创建独立分支与独立 worktree，推荐命名：分支 `fix|feat|chore/<task-slug>`，worktree `../wt-<task-slug>`。
- `progress.md` 只允许追加，不回写历史日志；每条记录时间精确到分钟（`YYYY-MM-DD HH:mm`）。
- `decisions.md` 与 `.agents/memory/decisions.md` 的新时间记录统一精确到分钟（`YYYY-MM-DD HH:mm`）。
- task 内脚本优先放在当前 task 的 `scripts/` 目录，输出优先写入 `scripts/outputs/`；非 task 脚本与输出由全局 `.agents/scripts/` / `.agents/scripts/outputs/` 承载。
- 无论是 task 脚本还是直接执行的 CLI 命令，只要输出过长、容易截断或难以可靠捕获，都应立即转存到对应输出目录文件。
- 归档时优先保留 `decisions.md`、关键结论与必要索引；可压缩冗余计划、重复进度与无长期价值的过程记录。
- 若归档任务确认无长期价值，可删除其目录，但应先保留 3–5 行摘要或关键决策。

---

## 禁止事项

- ❌ 重写用户已有 task 文档段落
- ❌ 在未检查 diff 的情况下生成空泛 commit/stash message 规则
- ❌ 在本 skill 中修改与 task 无关的 guide/memory 文件

---

## 完成后执行 Self Review

→ 逐项检查 [checklist.md](./checklist.md)

