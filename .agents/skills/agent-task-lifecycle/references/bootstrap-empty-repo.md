# 示例：首次建立 task 生命周期

> 场景：项目尚未有 task 模板、目录化 task 规则与 archive 目录，需要补齐可执行、可追踪的 task 生命周期规则。

---

## 输入上下文

现有文件：

```
.agents/
├── guide/
│   └── execution.md
└── memory/
    └── decisions.md
```

缺失文件：
- `.agents/templates/task-template.md`
- `.agents/tasks/README.md`
- `.agents/tasks/archive/`

---

## 输出示例

```
⚠️  已更新: .agents/guide/execution.md（追加 Task Identification / Switch Guard）
✅ 已创建: .agents/templates/task-template.md
✅ 已创建: .agents/tasks/README.md
✅ 已创建: .agents/tasks/archive/
⚠️  已更新: .agents/memory/decisions.md（记录 task 生命周期接入决策）
```

---

## 说明

本 skill 仅负责 task 生命周期能力；若缺少 `execution.md` 或 `decisions.md`，可按最小范围补齐所需部分。
若 task 需要脚本或输出落盘，规则应明确：脚本放在 `.agents/tasks/<task-slug>/scripts/`，输出放在 `scripts/outputs/`；无论脚本还是 CLI 命令，只要输出过长或难以可靠捕获，都优先转存到文件。

