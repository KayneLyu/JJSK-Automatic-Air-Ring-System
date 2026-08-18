# Progress：移除生产包中的 node_modules

## 2026-08-13 21:26

- Task 识别为既有 ASAR 分析的实施阶段，在当前会话和工作目录继续。
- 用户明确生产包不依赖 `node_modules`，开发态仍继续依赖 pnpm `node_modules`。
- 已建立 context/plan/progress/decisions 标准记录，开始依赖与 Native 加载审计。

## 2026-08-13 21:46

- Vite 已内联 `better-sqlite3` 纯 JavaScript wrapper；Electron 9 个输出通过裸依赖审计，只保留 Node/Electron 内置模块。
- electron-builder 明确排除 `node_modules`，将 `better_sqlite3.node` 与 AirRingNative 发布到 `resources/native/`。
- 首次自检发现 Rollup 动态 require 限制，改为通过 `createRequire()` 加载 addon 对象并注入 `nativeBinding` 后通过。
- 开发态 Electron 探针确认仍从 pnpm `node_modules` 解析 `better-sqlite3` 并完成内存查询。
- `pnpm run build` 完整通过，生成 NSIS 安装包；`app.asar` 为 4.63 MiB，ASAR 和 resources 均无 `node_modules`。
- 最终离线自检通过：Rust Native、SQLite、7 个入口、`nodeModulesAbsent=true`；未启动应用或连接设备。
- 全仓 lint 通过（保留既有 warning）；本次文件定向 lint 无警告。全项目 typecheck 仍有既有错误，本次修改文件无诊断。
