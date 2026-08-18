# JJSK 自动风环系统

吹膜机「上旋 + 测厚 + 风环控制」系统，基于 Electron + Vue 3 + TypeScript 的 monorepo。

## 目录结构

- `apps/AirRingSys/` — Electron 主应用 + Vue 前端
- `packages/AirRingServer/` — 后端服务器与控制算法（核心）
- `packages/core/` — 核心共享代码
- `packages/Simulation/` — 设备仿真系统

## 开发环境与工具链

仓库根目录的 `mise.toml` 记录了项目验证过的工具链版本（Node.js / pnpm / Rust），是**共享的工具链标准**，应当随仓库一起提交维护。mise 只是可选的版本管理器，并非所有成员的开发环境都使用 mise，因此：

- 使用 mise 的成员：在仓库根目录执行 `mise install`，即可按 `mise.toml` 安装并锁定对应版本。
- 不使用 mise 的成员：构建只要求工具位于 `PATH`，不依赖特定版本管理器（可用 rustup、Volta、系统安装包等），但需自行保证本机版本与 `mise.toml` 一致，避免版本漂移。

`mise.toml` 中的 `[env]` 仅对 mise 管理的开发环境生效；不使用 mise 时相关环境变量缺省，代码均保留 TypeScript 回退路径。

## 常用命令

```powershell
pnpm install       # 安装依赖（仓库根目录）
pnpm build:field   # 构建 Windows 现场包（详见 apps/AirRingSys/FIELD_DEPLOYMENT.md）
pnpm lint          # 静态检查
pnpm format        # 格式化
```
