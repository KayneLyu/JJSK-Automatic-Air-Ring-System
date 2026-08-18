# Decisions：移除生产包中的 node_modules

## 2026-08-13 21:26 开发与生产模块解析分离

**背景**：目标是缩减和净化生产包，不是移除项目依赖管理能力。

**选择**：开发态继续使用 pnpm `node_modules`；生产态由 Vite/Rollup内联纯 JavaScript，并将 Native 二进制作为显式资源发布。

**理由**：保持现有开发体验，同时避免 electron-builder 将完整依赖树及 workspace 数据复制到 ASAR。

**影响**：生产构建必须增加裸导入审计和 Native 离线加载验证，不能只根据构建成功判断完成。

## 2026-08-13 21:46 Native addon 使用对象注入

**背景**：将 `better-sqlite3` wrapper 打入 Rollup 后，其内部动态 `require(nativePath)` 会被 CommonJS 助手拦截。

**选择**：生产态由本地适配层通过 Node `createRequire()` 加载 `resources/native/better_sqlite3.node`，再把 addon 对象作为 `nativeBinding` 注入；开发态资源不存在时保持默认 npm 包解析。

**理由**：不需要复制 `bindings` 的目录查找结构，生产路径稳定，同时保持开发态零迁移。

**影响**：`better_sqlite3.node` 成为明确的打包资源；离线 self-test 必须覆盖 addon 加载和内存查询。

## 2026-08-13 21:46 构建门禁阻止 node_modules 回归

**背景**：仅靠当前配置无法阻止未来新增 external 依赖或 electron-builder 配置回退。

**选择**：正式构建、现场包和内容包都在 Vite 后执行 Electron bundle 裸导入审计；现场 self-test 同时拒绝包含 `node_modules` 的 ASAR。

**理由**：在构建阶段和打包运行阶段分别验证模块图与最终文件结构。

**影响**：未来新增非内置 external 必须显式改变架构和门禁，不能静默依赖生产 `node_modules`。
