# 进度日志

## 2026-06-25 任务完成

### 实施结果

| 步骤 | 状态 |
|---|---|
| 创建 .oxlintrc.json | ✅ |
| 更新根 package.json (devDeps + scripts) | ✅ |
| 删除 eslint.config.js | ✅ |
| pnpm install | ✅ |
| pnpm run lint | ✅ 0 errors, 81 warnings |
| 验证 typecheck (app + node) | ✅ AirRingSys 干净 |
| 验证 typecheck (server + simulation) | ⚠️ 预存错误,与本次迁移无关 |

### 关键调整

1. **配置收敛**: 初版太激进,触发 1013 errors。改用 oxlint 默认的 `correctness: error` 单类别后,error 降到 0。
2. **类型感知规则降级**: `no-floating-promises`、`no-misused-promises` 等只在类型感知下生效的规则,原 ESLint `recommended` 不含这些 → 改为 warning 而非 error(等价于原配置的有效覆盖)。
3. **去掉 `--type-check`**: 该 flag 是实验性 TS 编译器诊断,与 lint 混在一起会造成混淆。保留 `--type-aware` 即可。

### TS 7 兼容性验证

- `pnpm exec tsc --version` → `Version 7.0.1-rc` ✅
- `pnpm run lint` 退出码 0 ✅
- `pnpm exec oxlint --type-aware` 不再触发 `ERR_PACKAGE_PATH_NOT_EXPORTED` ✅

### 预存 typecheck 错误(与本次迁移无关)

运行 `tsc --noEmit` 发现两处预存问题,**不是本次迁移引入的回归**:

1. `packages/AirRingServer/algorithms/upperRotation/tests/upperRotation.*.test.ts`:
   - 全部使用旧版 `assert { type: 'json' }` 语法
   - TS 7 已弃用 `assert`,改用 `with { type: 'json' }` (TS2880)
   - 21 处需修
2. `packages/AirRingServer/tsconfig.json` 没有 `include` 字段,默认覆盖所有 .ts → 暴露了 `apis/*.ts` 中 `/* TODO */` 桩函数没有返回值的问题 (TS2355)
3. `packages/Simulation/scripts/transform.ts` 等脚本有真实类型问题(可能是脚本未在生产代码路径上,以前未被 tsc 检查)

这些**不在本次迁移的范围内**,需要单独 task 修复。建议后续:
- 在 packages/AirRingServer/tsconfig.json 加 `include: ["src/**/*", "apis/**/*", ...]`
- 更新测试文件的 import attribute 语法
- 修复 Simulation 脚本的真实类型问题

### 验收清单

- [x] `pnpm run lint` 退出码 0
- [x] `pnpm-lock.yaml` 同步更新
- [x] `eslint.config.js` 已删除
- [x] `.oxlintrc.json` 已就位
- [x] TypeScript 仍为 `^7.0.1-rc`
- [ ] (非本次范围) 预存 typecheck 错误需后续修复
