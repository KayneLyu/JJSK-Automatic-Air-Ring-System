# 示例：增量更新已有 task 生命周期

> 场景：项目已有 `.agents/tasks/README.md`，但缺少切换保护规则、目录化 task 模板与 archive 目录。

---

## 输入上下文

现有文件：

```
.agents/
├── guide/
│   └── execution.md
└── tasks/
    └── README.md
```

缺失文件：
- `.agents/templates/task-template.md`
- `.agents/tasks/archive/`

---

## 执行策略

- 保留用户已有 `tasks/README.md` 内容，增量补充缺失段落。
- 在 `execution.md` 中仅追加 task 生命周期规则，不改动非 task 段落。
- 创建缺失的模板与归档目录，并补齐目录化 task 标准文件约定。
- 若任务需要脚本或输出落盘，补齐 task 内 `scripts/` 与 `scripts/outputs/` 的使用规则；对长输出或难捕获输出，优先转存到文件。

---

## 变更示例

```
⚠️  已更新: .agents/guide/execution.md（追加 Task Switch Guard）
⚠️  已更新: .agents/tasks/README.md（补充归档与压缩规则）
✅ 已创建: .agents/templates/task-template.md
✅ 已创建: .agents/tasks/archive/
```

