# output-contract.md — agent-os 输出规范

> 执行 agent-os skill 后，必须严格按照本规范输出。禁止遗漏。

---

## 必须输出

### 1. 文件变更清单

每个文件必须标明操作类型：

```
✅ 已创建: AGENTS.md
✅ 已创建: .agents/guide/execution.md
✅ 已创建: .agents/guide/patterns.md
✅ 已创建: .agents/guide/safety.md
✅ 已创建: .agents/guide/dependencies.md
✅ 已创建: .agents/guide/i18n.md
✅ 已创建: .agents/memory/context.md
✅ 已创建: .agents/memory/decisions.md
✅ 已创建: .agents/scripts/
✅ 已创建: .agents/scripts/outputs/
✅ 已创建: .agents/README.md
⚠️  已更新: .agents/guide/patterns.md（追加了命名约定部分）
🔒 已保留: .agents/guide/execution.md（用户已自定义，未修改）
```

操作符号说明：
- `✅ 已创建` — 新建文件
- `⚠️  已更新` — 修改了已有文件（必须说明修改内容）
- `♻️  已补齐` — 对已有文件追加了缺失的结构性章节（如行为契约表），原有自定义内容已保留
- `🔒 已保留` — 文件已存在且内容完整，未做修改

---

### 1.2 `.agents/README.md` 补齐记录（强制）

若 `.agents/README.md` 已有内容但缺少行为契约表或其它结构性章节，必须在变更清单中用 `♻️ 已补齐` 标明每个具体补齐项。

示例：

```
✅ 已创建: AGENTS.md
✅ 已创建: .agents/guide/execution.md
🔒 已保留: .agents/guide/patterns.md（用户已自定义，未修改）
♻️  已补齐: .agents/README.md（追加了行为契约表）
♻️  已补齐: .agents/README.md（追加了 scripts/outputs 使用规范）
🔒 已保留: .agents/README.md（其他章节内容完整，未修改）
⚠️  提示: 项目缺少 README.md，建议创建
```

### 1.3 目标语言判定记录（强制）

每次响应必须记录：
- 最终采用语言（如 `zh-CN` / `en-US`）
- 判定依据（显式参数、用户消息、现有文档主语言）
- 影响范围（哪些新建/更新文件按该语言输出）

示例：

```markdown
## Language Decision
- target language: `zh-CN`
- evidence: user explicitly requested Chinese output
- applied to: `AGENTS.md`, `.agents/guide/*.md`, `.agents/memory/*.md`, `.agents/README.md`
```

---

### 2. 脚本文件生成说明（若适用）

如果 Agent 在执行过程中需要运行代码脚本或复杂命令序列：
- 运行 Python/JavaScript 等代码脚本时，应生成对应文件，而非通过 `python -c`、`node -e` 等方式把代码字符串直接传给 CLI
- 脚本放在 `.agents/scripts/`，其输出优先写入 `.agents/scripts/outputs/`
- 较复杂或需复用的 shell 逻辑，优先生成脚本文件（如 `check-structure.sh`、`validate-docs.py`）
- 简单直接的 CLI 命令可直接执行，无需一律包装为 `.sh` 文件
- 无论是脚本还是 CLI 命令，只要输出过长、容易截断或难以可靠捕获，就应立即转存到对应的输出目录文件中
- 输出中应列出生成的脚本文件与输出文件清单，说明其作用和如何读取 / 运行

---

### 3. 新生成文件的完整内容

展示所有**新创建**文件的完整内容。
更新的文件仅展示**变更部分**，并注明插入位置。

---

### 4. 执行总结（5–10 行，强制）

必须包含以下四点：

1. **Agent 如何工作** — 简述 `.agents/` 结构如何指导 Agent 行为；`AGENTS.md` 做入口路由，`.agents/README.md` 承载行为契约表与 Script First 约束
2. **规则如何约束 Agent** — `.agents/README.md` 中的"行为契约"表如何通过场景→必读文件映射来约束 Agent 行为
3. **如何避免上下文膨胀** — 压缩与长期记忆策略概述，包括脚本结果文件持久化；Agent 按需读取 guide 文件而非全量加载
4. **语言一致性策略** — 本次如何判定并执行目标语言


---

## 禁止输出

- ❌ 无关解释（未被要求的背景介绍）
- ❌ 超出本 skill 范围的建议（如重构代码、优化架构等）
- ❌ 重复输出已有文件内容（仅输出变更）
- ❌ 省略变更清单或执行总结

