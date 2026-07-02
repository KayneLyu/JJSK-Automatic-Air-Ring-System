# prompt-template.md — agent-os Prompt

> 将以下内容直接发送给 AI Agent 以执行 agent-os skill。
> 可按需替换 `[PROJECT_PATH]`，或留空让 Agent 分析当前目录。
> 可按需替换 `[TARGET_LANGUAGE]`（如 `zh-CN`、`en-US`）。

---

```
你是一名资深软件架构师 + AI Agent 系统设计专家。

目标语言：`[TARGET_LANGUAGE]`

## 任务

分析当前代码库，完成以下工作：

1. 扫描现有 AI 约定文件，合并已有规则
2. 生成或更新 `AGENTS.md`（20–40 行入口索引）
3. 生成或维护 `.agents/guide/` 规则文件与 `.agents/README.md`
4. 生成或维护 `.agents/memory/` 记忆文件，并补齐 `scripts/`、`scripts/outputs/` 目录

---

## Step 0：目标语言判定（强制）

- 按优先级确定语言：`[TARGET_LANGUAGE]` > 用户当前消息明确要求的输出语言 > 用户当前消息语言 > 现有 Agent 文档主语言
- 所有新创建的 Agent OS 文件必须使用目标语言
- 更新已有文件时，只追加目标语言内容，不重写用户已有段落
- 若用户要求全量切换现有文档语言，先确认后再执行批量翻译

---

## Step 1：扫描现有规则

搜索并读取以下文件（如存在）：

- .github/copilot-instructions.md
- AGENT.md / AGENTS.md / CLAUDE.md
- .cursorrules / .windsurfrules / .clinerules
- .cursor/rules/** / .windsurf/rules/**
- README.md

要求：保留已有规则、去重合并冲突、提取项目特有约定。

---

## Step 2：生成或更新 AGENTS.md

- 严格控制在 20–40 行
- 仅包含：项目结构概览 + 核心规则摘要 + `.agents/` 导航链接
- 禁止写完整规则（规则必须在 `.agents/guide/`）
- 已存在则增量更新，禁止无差别重写

---

## Step 3：生成或更新 `.agents/` 目录

目标结构：

.agents/
├── guide/
│   ├── execution.md        ← 执行协议（含 Script First 指导）
│   ├── patterns.md         ← 项目模式与规范
│   ├── safety.md           ← 安全约束
│   ├── dependencies.md     ← 依赖决策规则
│   └── i18n.md             ← 国际化强制规则
├── memory/
│   ├── context.md          ← 长期上下文
│   └── decisions.md        ← 技术决策记录
├── scripts/                ← 脚本文件目录
│   └── outputs/            ← 脚本与命令输出目录
└── README.md               ← .agents 目录说明文档

更新规则：仅补充缺失文件；已存在文件保留用户内容，禁止无差别重写；创建 `scripts/`、`scripts/outputs/`、`.agents/README.md` 如不存在。

---

## Step 4：guide/ 内容要求

execution.md 必须覆盖：
- Exploration First（修改前先分析代码库）
- Plan First（任务开始前先写计划）
- Minimal Diff（最小化变更范围）
- Script First（运行 Python/JavaScript 等代码脚本时生成脚本文件，避免通过 `python -c`、`node -e` 等方式把代码字符串直接传给 CLI；脚本放在 `.agents/scripts/` 且输出写入 `.agents/scripts/outputs/`；较复杂或需复用的 shell 逻辑优先脚本化；简单直接 CLI 命令可直接执行；只要输出过长、容易截断或难以可靠捕获，就立即转存到文件）

patterns.md 必须覆盖：
- Pattern First（复用已有模式）
- 从代码库提取的项目特有约定
- File Size Awareness（当代码文件过大、职责混杂、局部变更成本持续升高时，优先考虑按现有目录与模块模式做合理拆分；拆分应保持最小必要范围，避免为拆分而拆分）

safety.md 必须覆盖：
- 具体的禁止操作列表
- 高风险操作需确认

dependencies.md 必须覆盖：
- Third-Party First 优先级：已有依赖 > 内部实现 > 第三方库 > 自研
- ORM First：仅当任务属于后端开发且涉及数据库相关内容时生效；优先复用项目现有 ORM、查询构建器、迁移工具与数据访问层约定，禁止绕过既有 ORM 直接另起一套 SQL/数据访问实现
- ORM Schema First：仅当任务属于后端开发且涉及数据库相关内容时生效；涉及模型、表结构、字段、关联、迁移、代码生成时，优先以 ORM schema/模型定义作为变更源头，再通过既有迁移或生成链路落地到数据库与代码，禁止把手写 SQL 表结构当作默认主入口
- 新增依赖必须评估并记录决策
- 接口契约相关类型生成遵循项目既有工具链和脚本约定；若无既有约定，保持最小变更并记录决策

i18n.md：
- 始终生成 `.agents/guide/i18n.md`
- 首先判断项目是否有国际化需求（检查 i18n 库依赖、locale 文件、翻译调用等）
- 若有国际化需求 → 必须读取并执行 i18n.md：禁止硬编码文案、禁止 fallback 写法、key 必须确认存在才使用、优先复用已有翻译
- 若无国际化需求 → 默认可跳过读取 i18n.md；当任务涉及用户可见文案或翻译相关改动时再读取

---

## Step 5：初始化 memory/

- `context.md`：记录项目类型、核心约定与“代码未表达信息”
- `decisions.md`：保留决策模板，并记录本次关键决策；新记录时间使用 `YYYY-MM-DD HH:mm`

---

## 输出要求

1. 输出所有文件的变更清单（✅已创建 / ⚠️已更新 / 🔒已保留）
2. 展示所有新生成文件的完整内容
3. 输出目标语言判定记录（最终语言 + 判定依据 + 应用范围）
4. 5–10 行执行总结，说明：Agent 如何工作、规则如何导航、如何避免上下文膨胀、如何保证语言一致性

禁止输出无关解释。
```

