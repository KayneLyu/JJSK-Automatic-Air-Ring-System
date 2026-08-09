# Windows 现场包构建与部署

## 构建机

构建只要求工具位于 `PATH`，不依赖特定版本管理器。可以使用 mise、rustup、Volta、系统安装包或其他方式准备：

- Windows x64
- Node.js 24.x
- pnpm 10.x
- Rust/Cargo 1.88+
- Visual Studio 2022 Build Tools，包含 C++ x64 工具链

安装依赖后，在仓库根目录执行：

```powershell
pnpm install
pnpm build:field
```

命令会构建 Rust Native、用 `prebuild-install` 下载与当前 Electron ABI 匹配的 `better-sqlite3` 预编译 addon、生成 `win-unpacked`、运行无设备自检，并由 electron-builder 生成 7z。若对应预编译 addon 不存在，构建会直接失败，不会回退到本地 `node-gyp` 编译。产物位于：

```text
apps/AirRingSys/release/<version>/win-unpacked/
apps/AirRingSys/release/<version>/JJSK-Windows-<version>-unpacked.7z
apps/AirRingSys/release/<version>/JJSK-Windows-<version>-unpacked.manifest.json
```

## 工控机

工控机不需要 Node.js、pnpm、Rust、Visual Studio 或 mise。

1. 将整个 7z 复制到工控机并完整解压，不要直接在压缩包内运行。
2. 保留 `win-unpacked` 的目录结构，不要单独复制 `JJSK.exe`。
3. 运行 `win-unpacked/JJSK.exe`。
4. 首次现场切换应保留上一版本目录，以便快速回滚。

正式发布前，使用同目录 manifest 中的 `archive.sha256` 校验传输文件：

```powershell
Get-FileHash .\JJSK-Windows-<version>-unpacked.7z -Algorithm SHA256
```

## 高频内容包

Electron 版本不变时，不必反复传输完整运行时。开发机可在仓库根目录执行：

```powershell
pnpm build:content
pnpm verify:content
```

`build:content` 仍会在开发机上构建 Rust Native、准备 Electron ABI 的 `better-sqlite3`、构建应用并生成权威 `win-unpacked/resources`，但交付物只包含应用内容。`verify:content` 会在系统临时目录创建完整基础包副本，实际执行一次替换和更新后自检，再验证错误 Electron 版本会被拒绝；不会启动主应用或连接设备。产物位于：

```text
apps/AirRingSys/release/<app-version>/content/JJSK-Content-<content-version>-electron-<electron-version>-win-x64.7z
apps/AirRingSys/release/<app-version>/content/JJSK-Content-<content-version>-electron-<electron-version>-win-x64.manifest.json
apps/AirRingSys/release/<app-version>/content/JJSK-Content-<content-version>-electron-<electron-version>-win-x64.verification.json
```

未指定内容版本时，脚本使用“应用版本 + Git 短提交 + dirty 标记 + UTC 时间”生成开发版本。候选或正式发布应显式指定稳定版本：

```powershell
$env:AIR_RING_CONTENT_VERSION = '1.2.7-rc.1'
pnpm build:content
Remove-Item Env:AIR_RING_CONTENT_VERSION
```

内容 7z 内的 `payload/resources` 是不可拆分的更新单元，包含 `app.asar`、`app.asar.unpacked`、Rust addon、现场文档等内容。不要只复制 `app.asar`，否则 JavaScript、Rust Native 和 Electron ABI 原生依赖可能错配。

### 在工控机应用内容包

1. 完全退出 JJSK；脚本检测到任何名为 `JJSK` 的进程都会拒绝覆盖。
2. 将内容 7z 解压到较短的临时路径，例如 `D:\JJSK-Update`。
3. 先执行只校验；脚本会探测目标 `JJSK.exe` 的真实 Electron 版本、平台、架构和 Node modules ABI，并逐文件校验 SHA-256：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\JJSK-Update\JJSK-Content\apply-content-update.ps1 `
  -InstallDirectory D:\JJSK\win-unpacked `
  -VerifyOnly
```

4. 校验通过后去掉 `-VerifyOnly` 再执行一次。脚本先在安装目录同卷暂存完整内容，再将旧 `resources` 移到带时间戳的 `resources.backup-*`，最后交换新目录；交换失败会自动恢复旧目录。
5. 确认输出中的 `ok=true` 和 `backupDirectory`，再启动 `JJSK.exe` 验证。至少保留最近一个备份；若需回滚，退出应用后将当前 `resources` 移开，再把输出所指的备份目录改回 `resources`。

以下变化必须重新下发完整基础包，不能使用内容包跨越：

- Electron 版本或 Node modules ABI；
- Windows 平台/CPU 架构；
- `JJSK.exe`、Electron DLL/pak/locale 或其他基础运行时文件；
- 安装目录结构或系统级安装行为。

内容清单和 SHA-256 提供传输完整性，但不等于发布者身份认证。正式生产发布时沿用同一内容分层，并在可信流水线中为归档/清单增加代码签名或独立签名文件，再通过受控渠道分发；未完成签名门禁的开发内容包不得当作正式生产发布件。

## Rust Native 默认值与回滚

打包态默认启用上旋和膜泡 Batch Rust Native，线程上限默认 4。Native 加载或执行失败时，Worker 会自动回退 TypeScript；RLS 始终使用 TypeScript。

需要临时禁用 Rust 主路径时，可在启动 `JJSK.exe` 的同一个 PowerShell 窗口中执行：

```powershell
$env:AIR_RING_RUST_PRIMARY_DISABLE = '1'
$env:AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE = '1'
.\JJSK.exe
```

只需回滚其中一条路径时，仅设置对应变量。关闭该 PowerShell 窗口后，这些临时变量即失效。
