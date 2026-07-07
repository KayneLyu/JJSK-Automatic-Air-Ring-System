# .agents/ — AI Agent 操作系统目录

本目录为 AI Agent 提供长期稳定的工作环境，降低每次新会话的上下文加载成本。

## 目录结构

```
.agents/
├── guide/              ← 项目规则与执行协议（Agent 工作时必读）
│   ├── execution.md    ← 执行方式：最小diff、Plan First、Script First、迭代工作流
│   ├── patterns.md     ← 项目约定：结构、命名、组件模式、调试技巧
│   ├── safety.md       ← 安全约束：禁止操作、设备安全、数据处理
│   ├── dependencies.md ← 依赖策略：Third-Party First、依赖清单
│   └── i18n.md         ← 国际化规则（vue-i18n）
├── memory/             ← 长期记忆（跨会话持久化）
│   ├── context.md      ← 背景知识：物理模型、设备、数据集、常用命令
│   └── decisions.md    ← 技术决策：D-001~D-028 算法决策 + Worker 迁移等
├── scripts/            ← Agent 生成的脚本文件
├── scripts/outputs/    ← 脚本执行输出（含 Plan 文件）
└── skills/             ← Agent OS 技能定义（agent-os, agent-task-lifecycle）
```

---

## Agent 行为契约（按场景主动读取）

> ⚠️ **不读 = 违规**：以下每个场景对应的文件是 Agent 执行任务的**强制前置读取**。跳过即违规。

| 场景（可判断） | 必须读取 | 核心约束 |
|---------------|----------|----------|
| 开始任何代码修改任务 | `guide/execution.md` | 先探索代码库 → 先写 Plan → 最小化变更范围；禁止任务范围外重构 |
| 添加新模块/文件、修改命名或目录结构 | `guide/patterns.md` | 复用项目已有模式与目录结构；遵循命名约定（camelCase/PascalCase/UPPER_SNAKE_CASE） |
| 涉及设备控制、文件删除、配置修改、安全操作 | `guide/safety.md` | 设备指令须边界校验；高风险操作需用户确认；禁止 `git push --force` / `git add .` |
| 引入新依赖或选择技术方案 | `guide/dependencies.md` | Third-Party First：已有依赖 > 社区成熟库 > 自研；决策必须写入 decisions.md |
| 修改 UI 文案、添加用户可见文本 | `guide/i18n.md` | 禁止硬编码中文；必须使用 `t()`/`$t()`；key 用点分格式；同步更新 zh-CN + en-US |

> 路径相对于 `.agents/` 根目录。

---

## Script First 最佳实践

| 场景 | 做法 |
|------|------|
| 需要跑 Python/JS 分析 | 生成 `.agents/scripts/analyze.py`，运行后输出到 `outputs/` |
| 复杂 shell 逻辑（>10 行） | 生成脚本文件，而非内联字符串传给 CLI |
| 简单 CLI 命令（1-3 行） | 可直接执行，无需脚本文件 |
| 输出较长（>100 行） | 立即重定向到 `outputs/<file>.txt`，避免截断 |

## 何时更新文件

| 触发时机 | 更新文件 |
|----------|----------|
| 完成重要架构决策 | `memory/decisions.md` |
| 发现新的项目约束 | `memory/context.md` |
| 新增项目约定 | `guide/patterns.md` |
| 识别新的安全约束 | `guide/safety.md` |

## 迁移说明

本目录已整合以下原始文件的内容：

| 原始文件 | 迁移去向 |
|----------|----------|
| `.github/copilot-instructions.md` | → `guide/patterns.md` + `guide/safety.md` + `guide/dependencies.md` + `memory/context.md` |
| `packages/AirRingServer/algorithms/upperRotation/.instructions/context.md` | → `memory/context.md` |
| `packages/AirRingServer/algorithms/upperRotation/.instructions/decisions.md` (D-001~D-028) | → `memory/decisions.md` |
| `packages/AirRingServer/algorithms/upperRotation/.instructions/plan.md` | → `guide/execution.md`（迭代工作流） |
| `packages/AirRingServer/algorithms/upperRotation/.instructions/testMatrix.md` | → `guide/execution.md`（测试矩阵） |
| `packages/AirRingServer/algorithms/upperRotation/.instructions/instructions.md` | → `guide/execution.md`（最小工作流 5 步） |

**原始文件已保留**，但建议使用 `.agents/` 作为统一参考。如需删除原始文件以避免混淆，请执行：

```bash
# 删除 GitHub Copilot 指令（已迁移到 .agents/guide/）
# rm .github/copilot-instructions.md

# 删除上旋算法历史指令（已迁移到 .agents/memory/）
# rm -rf packages/AirRingServer/algorithms/upperRotation/.instructions/
```

---

## 集成说明

- **`AGENTS.md`** 是入口路由器：告知 Agent 工作前先读什么、核心规则是什么、去哪里找更详细的约束。
- **本 `README.md`** 是行为契约与基础设施说明的核心枢纽：通过场景→必读文件的契约表约束 Agent 行为；通过 Script First 规则约束脚本生成与输出管理。
- Agent 按场景按需读取 `guide/` 文件，而非全量加载，避免上下文膨胀。

---

`♻️ 已补齐` 行为契约表、集成路由说明
