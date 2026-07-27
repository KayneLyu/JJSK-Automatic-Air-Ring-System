# safety.md — 安全约束

## 禁止操作（严格遵守）

| 禁止项 | 原因 |
|--------|------|
| `git push --force` 强制推送 | 破坏 git 历史 |
| `git add .` 或 `git add -A` | 容易意外提交配置文件 |
| 修改 gitconfig（除非明确要求） | 影响用户环境 |
| 删除或重写用户已有内容 | 可能丢失自定义规则 |
| 手动修复 ESLint/Prettier 格式问题 | 编辑器会自动格式化 |
| 修改 `*.log` 文件 | 属于运行时数据 |
| 修改 `pnpm-lock.yaml`（除非变更依赖） | 包锁定文件 |

## 高风险操作（需用户确认）

执行以下操作前，必须先向用户确认：

- 删除任何文件或目录
- 修改全局配置文件（`package.json`、`pnpm-workspace.yaml`）
- 引入新的运行时依赖（`dependencies`，区别于 `devDependencies`）
- 修改 Electron 主进程入口（`main.ts`）
- 修改设备连接代码（`adbox.ts`、S7 连接）
- 修改标定控制器（`calibration.ts`、`calibrationBridge.ts`）的逻辑分支

## 设备安全

- 设备控制指令必须做边界校验（位置范围、速度范围）
- 避免频繁调整导致设备机械损坏
- 急停（`stopEmergency`）状态下必须拒绝所有运动指令
- 修改运动控制逻辑后，必须验证 `handleRunResult` 的状态流转正确性

## 数据安全

- 不要将任何密钥、token、密码写入代码
- 不要将设备 IP 地址硬编码（从配置文件或 electron-store 读取）
- 不要在 commit 中包含日志文件（`.gitignore` 已覆盖）

## 性能约束

- 算法实时响应要求 < 100ms（单次估算）
- 避免在 Electron 主线程执行 CPU 密集计算（已迁移到 Worker）
- 使用 RingBuffer 处理实时数据流
- ADBox 1ms 推送时，注意不要阻塞事件循环

## 数据处理

- 厚度数据需要平滑处理（使用 `tractionSpeedSmooth`）
- 牵引速度需要去噪
- 注意数据时间戳同步（不同设备的时钟可能不一致）
- 设备连接失败需要自动重连
- 数据异常需要记录日志
- 关键错误需要通知用户
