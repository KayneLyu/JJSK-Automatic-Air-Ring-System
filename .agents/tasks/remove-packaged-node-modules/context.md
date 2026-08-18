# Task：移除生产包中的 node_modules

## 背景

Electron 1.2.7 的 `app.asar` 为 244.97 MiB，其中 `node_modules` 占 237.58 MiB。Renderer 与 Electron 纯 JavaScript 依赖已经或可以在 Vite/Rollup 构建时打入产物，但 electron-builder 仍会根据生产依赖收集完整依赖目录。

## 范围

- 生产打包产物不得携带 `node_modules` 目录，也不得在运行时通过裸包名解析它。
- 开发态保持 pnpm 与 `node_modules` 的正常依赖和模块解析方式。
- Native `.node` 文件作为显式生产资源发布，不要求内联进 JavaScript。

## 涉及文件

- `apps/AirRingSys/vite.config.ts`
- `apps/AirRingSys/electron-builder.json5`
- `apps/AirRingSys/package.json`
- `apps/AirRingSys/electron/**`
- 与 `better-sqlite3`、AirRingNative 加载有关的模块

## 约束

- 不改变 Renderer sandbox、context isolation 和 IPC 安全边界。
- 不启动会连接现场设备的完整 Electron 应用。
- 不删除开发环境的 `node_modules`，不破坏 `pnpm dev`。
- Native 模块必须匹配 Electron ABI，并从稳定的生产资源路径加载。
- 构建产物不能残留非 Node/Electron 内置模块的裸 `import`/`require`。

## 相关测试

- `pnpm run lint`
- AirRingSys Vite 构建
- electron-builder 完整 Windows 打包
- ASAR/资源树审计：无 `node_modules`
- 离线 `fieldSelfTest` 或等价的不连设备 Native/SQLite 自检
