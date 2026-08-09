# Rust 性能迁移 Phase 10 计划

## 目标

提供不依赖 mise、Node、pnpm、Rust 或 Visual Studio 现场环境的 Windows x64 发布物。开发机执行统一 pnpm 命令后，默认得到可直接运行的 `win-unpacked` 和 `.7z`，包内默认启用 Rust Native。

## 实施步骤

1. 将工具版本要求写入标准 package/Cargo 元数据，构建命令不调用 mise。
2. 提取可测试的 packaged runtime 默认值逻辑，仅 `app.isPackaged` 时启用两个 primary，显式环境配置仍具有覆盖与禁用能力。
3. 增加 Electron Node 自检入口，验证 Rust addon、better-sqlite3 和构建 Worker 存在，不初始化 ADBox/S7。
4. 增加 Node 发布编排脚本：Native build → `prebuild-install` 下载 Electron ABI SQLite addon → Vite build → electron-builder 原生 `dir` + `7z` → 自检 → sidecar manifest 与 archive SHA-256；禁止 electron-builder npm rebuild。
5. 显式配置 `asarUnpack`，并执行单测、类型检查、Native 测试、解包产物和压缩包验收。

## 验收标准

- `pnpm build:field` 不读取或执行 mise。
- `release/<version>/win-unpacked/JJSK.exe` 可由完整目录独立运行。
- `resources/native/air-ring-native.win32-x64-msvc.node` 与开发机构建产物 SHA-256 一致。
- `app.asar.unpacked` 中存在可加载的 better-sqlite3 Native 模块。
- `.7z` 由 electron-builder 原生 target 默认生成，7z 签名有效，sidecar manifest 包含 archive SHA-256。
- 打包自检确认两个 Rust 导出、SQLite 内存库和必需 Worker；不执行 `main.ts`，不连接设备。
- packaged 默认 primary=1；开发模式仍只由开发者环境决定，disable=1 可立即回滚。
