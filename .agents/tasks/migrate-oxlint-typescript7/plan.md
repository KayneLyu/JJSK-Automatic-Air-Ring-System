# 迁移到 oxlint + oxlint-tsgolint (保留 TS 7)

## 背景

`typescript@^7.0.1-rc` 是 typescript-go 的 RC 预览,`package.json` 的 `exports` 字段只暴露 `./unstable/*`,无 `.` 入口与 `main`,作为库不可用。`@typescript-eslint/typescript-estree@8.46.2`(以及 8.x 全系)peerDependencies 限制 `typescript: '>=4.8.4 <6.0.0'`,导入时报 `ERR_PACKAGE_PATH_NOT_EXPORTED`。

结论:typescript-eslint 8.x 短期不支持 TS 7。改用 `oxlint` + `oxlint-tsgolint`(直接跑在 typescript-go 上,原生支持 TS 7)。

## 目标

- 项目继续使用 `typescript@^7.0.1-rc`
- 移除 typescript-eslint 全家桶,改用 oxlint
- 保留 prettier 作为独立格式化工具
- `pnpm run lint` 与 `pnpm run typecheck` 均通过

## 现状盘点

| 项 | 现状 |
|---|---|
| Linter | ESLint 9.39 + typescript-eslint 8.46.2 + prettier-as-linter |
| 配置 | `eslint.config.js` (flat config) |
| Prettier | `.prettierrc` |
| TS 规则 | typescript-eslint recommended (~300 规则) |
| neverthrow 规则 | `eslint-plugin-neverthrow`(但代码未使用 neverthrow,纯摆设) |
| TypeScript | 7.0.1-rc (typescript-go) |

## 目标依赖

| 包 | 用途 | 版本 |
|---|---|---|
| `oxlint` | Rust 编写的 JS/TS 语法 linter | ^1.71.0 |
| `oxlint-tsgolint` | tsgolint 类型感知后端 (跑在 typescript-go) | ^0.23.0 |
| `prettier` | 代码格式化(独立) | ^3.6.2(保留) |

移除:
- `@eslint/compat`
- `@eslint/js`
- `@typescript-eslint/parser`
- `eslint`
- `eslint-config-prettier`
- `eslint-plugin-neverthrow`
- `eslint-plugin-prettier`
- `typescript-eslint`

## 关键变化

1. **oxlint-tsgolint 覆盖 59/61 typescript-eslint 类型感知规则**。非类型感知的 TS 语法规则由 oxlint 内置覆盖。整体规则数会减少,但类型感知能力依然保留。

2. **eslint-plugin-prettier 不可用** → Prettier 转为独立格式化工具,由 `pnpm exec prettier --write` / `prettier --check` 调用。OxLint 的规则集与 Prettier 不冲突(oxlint 文档明确无 Prettier 风格规则)。

3. **eslint-plugin-neverthrow 不可用且无替代** → 移除(项目代码未使用 neverthrow 模式,影响为零)。

4. **配置文件格式不同**:
   - `eslint.config.js` (JS flat config) → `.oxlintrc.json` (JSON 配置)
   - `tseslint.configs.recommended` 等预设 → oxlint 内置 `recommended` 规则集

## 实施步骤

1. [ ] 创建 `.oxlintrc.json`,配置:
   - 启用类型感知与类型检查 (`typeAware: true`, `typeCheck: true`)
   - 启用 recommended 规则
   - ignore: `node_modules/**`, `dist/**`, `dist-electron/**`, `release/**`, `**/*.d.ts`
2. [ ] 删除 `eslint.config.js`
3. [ ] 更新根 `package.json`:
   - 移除 8 个 ESLint 相关 devDeps
   - 添加 `oxlint` + `oxlint-tsgolint`
   - 添加 scripts: `lint: oxlint --type-aware --type-check`, `format: prettier --write .`, `format:check: prettier --check .`
4. [ ] `pnpm install` 重装依赖
5. [ ] `pnpm run lint` 验证通过
6. [ ] `pnpm run typecheck` 验证通过(若 root 无 typecheck script,看 workspace 子包)
7. [ ] 更新 `.agents/memory/decisions.md` 与 `dependencies.md`

## 验收

- [ ] `pnpm run lint` 退出码 0
- [ ] `pnpm run typecheck` 退出码 0(或对应 workspace 的 typecheck 全部通过)
- [ ] `pnpm-lock.yaml` 同步更新
- [ ] `eslint.config.js` 已删除
- [ ] `.oxlintrc.json` 已就位
- [ ] TypeScript 仍为 `^7.0.1-rc`

## 风险

| 风险 | 缓解 |
|---|---|
| 某些 typescript-eslint 规则未覆盖 | 59/61 类型感知规则 + oxlint 内置 TS 规则已覆盖主要场景,后续若缺规则再补 |
| Prettier 不再作为 lint 触发 | 保留 `prettier --check` 在 CI 流程中 |
| oxlint 1.x 偶发不稳定的 type-aware 报告 | 启用 typeCheck 时已知会有诊断信息,作为 typecheck 的一部分,不影响 lint 退出码 |
| neverthrow 规则丢失 | 代码无 neverthrow 模式使用,影响为零 |

## 不在本次范围

- 编辑器集成(oxc 的 vscode 扩展)
- pre-commit hook
- CI pipeline
- 任何代码逻辑修改
