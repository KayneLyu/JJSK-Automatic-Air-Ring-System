# checklist.md — agent-os 验收清单

> 执行 agent-os skill 后，必须逐项检查。所有 ✅ 项必须通过。

---

## ✅ 结构完整性

- [ ] `AGENTS.md` 已生成或更新
- [ ] `AGENTS.md` 在 20–30 行之间
- [ ] `.agents/guide/execution.md` 存在且完整
- [ ] `.agents/guide/patterns.md` 存在且完整
- [ ] `.agents/guide/safety.md` 存在且完整
- [ ] `.agents/guide/dependencies.md` 存在且完整
- [ ] `.agents/guide/i18n.md` 存在且完整
- [ ] `.agents/memory/context.md` 存在
- [ ] `.agents/memory/decisions.md` 存在
- [ ] `.agents/scripts/` 目录已创建或存在
- [ ] `.agents/scripts/outputs/` 目录已创建或存在
- [ ] `.agents/README.md` 存在且说明了脚本生成最佳实践

---

## ✅ 内容质量

- [ ] 已完成目标语言判定，并记录判定依据（target_language / 用户消息 / 现有文档）
- [ ] 新创建的 `AGENTS.md` 与 `.agents/` 文件使用同一目标语言
- [ ] 更新已有文件时，仅追加目标语言内容，未重写用户原有段落
- [ ] `AGENTS.md` 包含项目结构概览（3–5 行）
- [ ] **`AGENTS.md` 包含"开始工作前"章节**：要求 Agent 首先读取 `README.md` 和 `.agents/README.md`
- [ ] `AGENTS.md` 包含核心规则摘要（5–10 行）
- [ ] `AGENTS.md` **没有**完整规则（规则在 `.agents/guide/`）
- [ ] `AGENTS.md` **没有**行为契约表（契约在 `.agents/README.md`）
- [ ] **`.agents/README.md` 包含"Agent 行为契约"章节**：以表格形式列出场景→必须读取→核心约束的映射
- [ ] 行为契约表中每行包含**可判断的场景描述**（非模糊表述如"需要时"）
- [ ] 行为契约表中每行包含**核心约束的一句话总结**（与所指文件内容一致）
- [ ] 行为契约表中路径为**相对 `.agents/` 根目录的路径**
- [ ] 行为契约表中有**"不读 = 违规"**或等价约束声明
- [ ] `.agents/README.md` 底部集成说明使用新路由文案（非旧版 "Navigation: Start from AGENTS.md"）
- [ ] `.agents/README.md` 已检查所有必需章节：目录结构、行为契约表、scripts/outputs 规范、Script First 最佳实践、集成说明
- [ ] 若项目缺少 `README.md`，输出中已有 `⚠️  提示` 标记
- [ ] **每个 guide 文件内容以可执行约束为主，而非纯描述性文字**
- [ ] `execution.md` 覆盖：Exploration First、Plan First、Minimal Diff
- [ ] `execution.md` 包含 Script First 指导：Python/JS 等代码脚本避免以内联字符串传给 CLI，脚本与输出目录规则明确，复杂 shell 优先脚本化，简单直接 CLI 命令可直接执行，且长输出会优先转存文件
- [ ] `execution.md` 保持为通用执行协议，不扩展超出 Agent OS 基线的专题流程
- [ ] `patterns.md` 包含项目特有约定（非纯通用模板）
- [ ] `patterns.md` 明确文件过大时优先合理拆分，且要求遵循既有模块边界、避免过度拆分
- [ ] `safety.md` 有具体的禁止操作列表
- [ ] `dependencies.md` 明确 Third-Party First 优先级
- [ ] `dependencies.md` 明确 ORM First 与 ORM Schema First 仅在后端数据库相关任务中生效
- [ ] `i18n.md` 处理正确：文件始终已生成；有国际化需求时已读取并执行；无国际化需求时可按规则跳过读取
- [ ] `decisions.md` 的新记录时间精确到分钟（`YYYY-MM-DD HH:mm`），且时间来自真实系统时间（通过 `date` 命令获取），非编造
- [ ] `decisions.md` 新记录插入在文件顶部（时间倒序，最新在前），`progress.md` 新记录追加在文件底部（时间正序，只追加）
- [ ] 所有时间记录按声明方向排序，无乱序插入

---

## ✅ 更新策略

- [ ] 未覆盖用户已有内容
- [ ] 已有规则被合并而非替换
- [ ] 无差别重写未发生
- [ ] 仅补充了缺失的文件和内容
- [ ] `.agents/README.md` 补齐项使用 `♻️ 已补齐` 标记

---

## ✅ Self Review（每次任务完成后必查）

- [ ] 符合 Pattern First（复用已有模式，未另起炉灶）
- [ ] 最小修改（无多余变更，无无关代码修改）
- [ ] 无 i18n 违规（项目有国际化需求时：无硬编码文案，无 fallback）
- [ ] 未引入不必要复杂度
- [ ] 未在本 skill 中混入超出 Agent OS 基线范围的内容
- [ ] 所有时间戳来自真实系统时间（通过 `date` 或等效方式获取），未编造时间

---

## ✅ 输出完整性

- [ ] 输出了所有生成/更新/保留文件的变更清单
- [ ] 新生成文件展示了完整内容
- [ ] 更新文件说明了变更部分
- [ ] 若项目缺少 `README.md`，输出中已有 `⚠️  提示` 标记
- [ ] 包含 5–10 行执行总结（Agent 工作方式、规则约束、防止膨胀、脚本结果持久化、语言一致性）
- [ ] 未输出无关解释
