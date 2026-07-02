# 示例：增量更新已有 agent-os

> 场景：项目已有部分 `.agents/` 结构，执行 core 能力补齐。

---

## 输入上下文

现有文件：

```
AGENTS.md
.agents/
├── guide/
│   ├── execution.md
│   └── patterns.md
└── memory/
    └── context.md
```

缺失文件：
- `.agents/guide/safety.md`
- `.agents/guide/dependencies.md`
- `.agents/guide/i18n.md`
- `.agents/memory/decisions.md`
- `.agents/scripts/`
- `.agents/scripts/outputs/`
- `.agents/README.md`

---

## 更新策略

- 保留用户已自定义且完整的文件（如 `execution.md`、`context.md`）。
- 对 `AGENTS.md` 做最小化增量更新，保持 20–40 行。
- 仅补齐缺失的 Agent OS 基线文件，保持范围在 `AGENTS.md`、`guide/`、`memory/`、`scripts/`、`scripts/outputs/` 与 `.agents/README.md` 内。

---

## 变更清单

```
⚠️  已更新: AGENTS.md（精简入口并补齐 guide 导航）
⚠️  已更新: .agents/guide/patterns.md（追加命名约定）
🔒 已保留: .agents/guide/execution.md
🔒 已保留: .agents/memory/context.md
✅ 已创建: .agents/guide/safety.md
✅ 已创建: .agents/guide/dependencies.md
✅ 已创建: .agents/guide/i18n.md
✅ 已创建: .agents/memory/decisions.md
✅ 已创建: .agents/scripts/
✅ 已创建: .agents/scripts/outputs/
✅ 已创建: .agents/README.md
```
