# Phase 10：现场免开发环境发布包摘要

## 结论

Phase 10 完成。开发机执行 `pnpm build:field` 即可生成可直接交付工控机的 `win-unpacked`、7z 和 SHA-256 manifest；构建流程不调用 mise，打包态默认启用上旋与 Bubble Batch Rust Native。

## 实现

- Rust 构建从 PATH 查找 Cargo，要求 Rust 1.88+ 与 Visual Studio 2022 C++ x64 工具链，不限定版本管理器。
- `better-sqlite3` 通过 `prebuild-install` 下载当前 Electron ABI 的预编译 addon，并以 `npmRebuild=false` 禁止 electron-builder 再次 rebuild 或本地编译。
- electron-builder 原生 `dir` + `7z` target 生成两个交付格式，不直接依赖 `7zip-bin`。
- Native 位于 `resources/native`，SQLite addon 位于 `app.asar.unpacked`；部署说明随包复制到 `resources/docs`。
- `app.isPackaged` 时默认设置两个 primary 和 4 线程；显式 `0` 或两个 disable 开关不会被覆盖。

## 验证

- 打包自检：Rust Native 加载、上旋导出、Bubble 实际求解、SQLite 内存查询、7 个 Electron 入口均通过。
- Native 源文件与包内文件 SHA-256 完全一致；7z 由 electron-builder 创建并通过签名与 SHA-256 门禁。
- 相关 Vitest 52/52、Rust 8/8、严格生产文件 typecheck、Electron Node typecheck、Prettier 和完整 Vite/packaging 通过。
- 自检使用 `ELECTRON_RUN_AS_NODE=1` 直接加载独立入口，未加载 `main.ts`，未初始化 ADBox/S7 或设备控制。

## 部署

工控机不安装开发环境，完整解压 7z 后运行 `win-unpacked/JJSK.exe`。正式传输使用 sidecar manifest 校验归档 SHA-256；现场保留上一版本目录。需要即时回滚时设置对应 `AIR_RING_*_PRIMARY_DISABLE=1` 后启动。

本次产物来自 dirty worktree，适合当前验收；正式版本应从已提交的干净 commit 重新执行同一命令。
