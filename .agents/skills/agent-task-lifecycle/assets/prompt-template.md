# prompt-template.md — agent-task-lifecycle Prompt

> 将以下内容直接发送给 AI Agent 以执行 agent-task-lifecycle skill。
> 可按需替换 `[TARGET_LANGUAGE]`（如 `zh-CN`、`en-US`）。

---

```
你是一名资深软件架构师 + AI Agent 系统设计专家。

目标语言：`[TARGET_LANGUAGE]`

## 任务

分析当前代码库，完成以下工作：

1. 扫描现有 AI 约定文件，提取已有 task 规范
2. 在 `.agents/guide/execution.md` 中补齐 task 生命周期规则
3. 生成或维护 `.agents/templates/task-template.md`
4. 生成或维护 `.agents/tasks/README.md`、目录化 task 规则与 `.agents/archive/`
5. 记录 task 生命周期关键决策到 `.agents/memory/decisions.md`

---

## Step 0：目标语言判定（强制）

- 按优先级确定语言：`[TARGET_LANGUAGE]` > 用户明确要求的输出语言 > 用户当前消息语言 > 现有 task 文档主语言
- 新创建文件必须使用目标语言
- 更新已有文件仅追加目标语言内容，不重写用户已有段落

---

## Step 1：扫描现有规则

读取：
- `.github/copilot-instructions.md`
- `AGENT.md` / `AGENTS.md` / `CLAUDE.md`
- `.cursorrules` / `.windsurfrules` / `.clinerules`
- `.cursor/rules/**` / `.windsurf/rules/**` / `.clinerules/**`
- `README.md`
- `.agents/guide/execution.md`
- `.agents/templates/task-template.md`
- `.agents/tasks/README.md`

要求：保留已有规则并增量合并，禁止覆盖用户自定义内容。

---

## Step 2：补齐 execution.md 中的 task 规则

必须覆盖：
- Task Identification First
- Task 创建规则（由 LLM 自主判断是否创建 `.agents/tasks/<task-slug>/`）
- One Task One Stream（识别到新任务时，必须创建新并行线程：新会话 + 新分支 + 新 worktree）
- 目录化 task 跟踪（先写 `plan.md`，再实施）
- task 脚本规则（task 内脚本放 `scripts/`，输出放 `scripts/outputs/`）
- Task Switch Guard（切换时 auto-commit 优先，失败 auto-stash）
- commit/stash message 自动生成策略（基于 diff）

---

## Step 3：生成或更新 task 生命周期目录

目标结构：

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

---

## Step 4：补齐 task 目录内容

- `task-template.md` 必须提供：`context.md`、`plan.md`、`progress.md`、`decisions.md` 模板
- 如 task 内需要脚本或长输出落盘，说明可选 `scripts/` 与 `scripts/outputs/` 目录
- `progress.md` 的新记录时间精确到分钟：`YYYY-MM-DD HH:mm`
- `decisions.md` 与 `.agents/memory/decisions.md` 的新记录时间精确到分钟：`YYYY-MM-DD HH:mm`
- `tasks/README.md` 必须包含：Task 创建规则、标准文件、可选脚本目录、状态流转（`active → completed → archived → deleted`，删除可选）、归档规则、压缩规则、删除规则与命名建议
- 无论是脚本还是直接执行的 CLI 命令，只要输出过长、容易截断或难以可靠捕获，就优先转存到对应的输出目录文件
- 补充 task 与线程映射规则（可选 `.agents/tasks/index.md`），并记录每个任务的 branch 与 worktree

---

## Step 5：记录决策

- 若本次新增或修改了关键 task 生命周期规则，写入 `.agents/memory/decisions.md`

---

## 输出要求

1. 输出所有文件的变更清单（✅已创建 / ⚠️已更新 / 🔒已保留）
2. 展示所有新生成文件的完整内容
3. 输出 task 识别与切换记录
4. 输出目标语言判定记录（最终语言 + 判定依据 + 应用范围）
5. 输出 5–10 行执行总结（task 识别、切换保护、归档策略）

禁止输出无关解释。
```

