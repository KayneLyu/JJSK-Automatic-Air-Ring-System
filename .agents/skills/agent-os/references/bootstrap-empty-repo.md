# 示例：空项目初始化 agent-os

> 场景：新项目首次建立 AGENTS 入口、guide 规则与 memory 基线。

---

## 输入上下文

项目结构：

```
my-app/
├── src/
├── package.json
└── tsconfig.json
```

技术栈：TypeScript、React、Tailwind CSS

---

## 扫描结论

- 未发现既有 AI 约定文件
- 识别到 TypeScript + React 项目模式

---

## 生成结果

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
```

说明：`execution.md` 会同时写入 Script First 规则：运行 Python/JS 等代码脚本时，优先在 `.agents/scripts/` 生成脚本，避免把代码字符串直接传给 CLI；脚本输出默认落到 `.agents/scripts/outputs/`。简单直接 CLI 命令可直接执行；若输出过长或难以可靠捕获，则立即转存到文件。

---

## 执行总结

本次仅初始化 Agent OS 基线：入口索引、规则导航与长期记忆。
规则细节在 `guide/`，高层入口在 `AGENTS.md`，长期信息在 `memory/`。
该拆分可让基础 skill 聚焦稳定的 Agent OS 基线，而不混入额外专题流程。
