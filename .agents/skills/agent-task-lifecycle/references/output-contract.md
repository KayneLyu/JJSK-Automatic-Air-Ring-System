# output-contract.md — agent-task-lifecycle 输出规范

> 执行 agent-task-lifecycle 后，必须严格按照本规范输出。禁止遗漏。

---

## 必须输出

### 1. 文件变更清单

每个文件必须标明操作类型：

```
✅ 已创建: .agents/templates/task-template.md
✅ 已创建: .agents/tasks/README.md
✅ 已创建: .agents/tasks/archive/
⚠️  已更新: .agents/guide/execution.md（追加 task 规则）
⚠️  已更新: .agents/memory/decisions.md（记录 task 生命周期决策）
🔒 已保留: .agents/guide/patterns.md
```

### 1.1 Task 识别与切换记录（强制）

每次响应必须记录：
- Task 识别结果（继续当前任务 / 新任务 / 切换不明确）
- task 名称与判断依据
- 若创建 task：记录目录 slug 与标准文件
- 若 task 使用脚本：记录 `scripts/` 与 `scripts/outputs/` 的使用情况
- 若发生任务切换：auto-commit 或 auto-stash 的处置结果

### 1.2 目标语言判定记录（强制）

每次响应必须记录：
- 最终采用语言
- 判定依据
- 应用范围（哪些 task 目录文件按该语言输出）

---

### 2. 新生成文件的完整内容

展示所有新创建文件的完整内容。
更新的文件仅展示变更部分，并注明插入位置。

若本次补充了 task 脚本规则，还应说明：
- task 脚本目录为 `.agents/tasks/<task-slug>/scripts/`
- task 输出目录为 `.agents/tasks/<task-slug>/scripts/outputs/`
- 当脚本或 CLI 输出过长、容易截断或难以可靠捕获时，应优先转存到上述输出目录文件

---

### 3. 执行总结（5–10 行，强制）

必须包含以下三点：
1. Task 识别如何执行
2. Task 切换保护如何执行
3. Task 归档与压缩如何执行

---

## 禁止输出

- ❌ 无关解释
- ❌ 超出本 skill 范围的建议
- ❌ 重复输出已有文件全文
- ❌ 省略变更清单或执行总结

