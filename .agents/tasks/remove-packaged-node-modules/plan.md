# Plan：移除生产包中的 node_modules

## 步骤

1. [x] 审计 Main、Preload、Worker 的依赖图、动态加载和 Native 模块路径。
2. [x] 设计开发态与生产态分离的模块解析策略。
3. [x] 将生产 Electron 纯 JavaScript 依赖打入构建产物，仅保留 Node/Electron 内置模块为 external。
4. [x] 将 Native 二进制及必要运行时资源复制到稳定路径，并让生产代码显式加载。
5. [x] 禁止 electron-builder 收集 `node_modules`，增加产物裸导入与目录审计。
6. [x] 运行 lint/typecheck、完整构建、打包和离线自检。
7. [x] 记录实测体积、兼容性结果、决策和遗留风险；任务标记 completed，归档需按安全规则另行确认。

## 验收标准

- [x] 开发态仍通过 pnpm `node_modules` 正常解析依赖。
- [x] Windows 打包产物中不存在 `node_modules` 路径。
- [x] Electron 产物不存在非 Node/Electron 内置模块的裸导入。
- [x] `better-sqlite3` 与 AirRingNative 能在打包目录离线加载。
- [x] 不执行任何设备连接或控制动作。
- [x] 新 `app.asar` 的组成和体积有可复现审计结果。

## 预期产出

一个开发体验不变、生产包不依赖 `node_modules`、Native 资源路径明确并经过离线验证的 Electron 构建流程。
