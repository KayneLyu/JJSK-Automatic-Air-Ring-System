# Phase 11：Electron 运行时与内容分层发布摘要

## 结论

Phase 11 完成。Electron 版本不变时，开发机执行 `pnpm build:content` 可生成仅含应用 `resources` 的 7z；工控机不需要 Node、Rust、mise 或 Visual Studio，解压后运行包内 PowerShell 脚本即可校验并替换内容。`pnpm verify:content` 已在完整基础目录副本上通过真实替换、备份、更新后自检和错误版本拒绝。

## 分层边界

- 低频基础层：`JJSK.exe`、DLL、pak、locale、ICU、snapshot 等 Electron Windows x64 运行时，由 `pnpm build:field` 完整交付。
- 高频内容层：完整 `resources`，包含 `app.asar`、`app.asar.unpacked`、Rust Native、Electron ABI `better-sqlite3` 和 `extraResources` 文档。
- `resources` 必须整体更新；不允许只替换 `app.asar`。
- Electron 精确版本、平台、架构或 Node modules ABI 改变时，必须重新发布完整基础包。

## 构建与替换

- `pnpm build:content` 复用 Rust release、`prebuild-install`、Vite、electron-builder `dir` 和打包态无设备自检，只把内容目录交给通用 7-Zip CLI。
- 内容清单包含独立 content version、Git 状态、工具链、Electron 36.9.5、modules ABI 135、N-API 10、51 个文件大小与 SHA-256。
- 更新脚本兼容 Windows PowerShell 5.1，不依赖 `Get-FileHash`；拒绝运行中的 JJSK、路径逃逸、重解析点、额外/缺失文件、哈希错误与运行时不匹配。
- 更新先在安装目录同卷复制并再次校验内容，再备份旧 `resources` 并交换目录；交换失败自动恢复，成功后保留带时间戳备份。

## 验证结果

- 内容 payload：269,549,687 bytes，51 个文件。
- 内容 7z：24,286,956 bytes，SHA-256 `3d6585e9ca63f4115936058240d11f428553ae941f09054dcab3d94380ea7b97`。
- 对照完整 7z 103,169,923 bytes，传输量降至 23.54%，减少 76.46%。
- 7z `test` 通过；归档不含 `JJSK.exe`、基础 DLL/pak/locale。
- 完整目录副本 `VerifyOnly`、实际替换、旧内容备份、基础运行时哈希不变全部通过。
- 更新后上旋 Rust 导出、Bubble Rust 实际求解、SQLite 内存查询和 7 个 Electron 入口自检通过。
- 将清单 Electron 改为不兼容版本后，替换脚本在目录暂存/交换前明确拒绝。

## 正式发布门禁

现阶段的逐文件 SHA-256 与 sidecar hash 只验证完整性，不能证明发布者身份。正式生产内容发布可沿用相同分层、兼容性和原子替换协议，但必须在可信流水线中增加归档/清单签名与受控分发，并从干净 commit 以显式内容版本重新构建。
