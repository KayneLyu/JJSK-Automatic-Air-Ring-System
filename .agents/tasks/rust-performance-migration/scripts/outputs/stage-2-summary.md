# Rust 性能迁移阶段 2 验收摘要

## 结论

阶段 2 通过。Rust 上旋搜索已作为默认关闭的影子路径接入现有校准 Worker；TypeScript 仍是唯一生产 `maxAngle`。Native 加载、线程配置或搜索失败只产生结构化 telemetry，不会使标定请求失败，也不会触发设备控制变化。

## 运行开关

- `AIR_RING_RUST_SHADOW=1`：启用影子计算；未设置时不加载 Native、不构建 DTO。
- `AIR_RING_RUST_SHADOW_THREADS=4`：Rayon 线程上限，必须为 1–32 的整数；默认不超过 4。
- `AIR_RING_RUST_NATIVE_PATH=<path>`：可选 Native 路径覆盖；安装包默认使用 `resources/native/air-ring-native.win32-x64-msvc.node`。

## 实现与安全边界

- 共享 Native 归一化与 TypedArray DTO，保持生产搜索的过滤、反向行程翻转、扫描器偏移、降采样和加减速语义。
- Rust 线程池只允许一次性配置；同值重复配置幂等，不同值冲突返回错误并由影子层隔离。
- 影子比较目标为 TypeScript 主搜索的 `baseThetaDeg`，不与规则修正后的最终角度混淆。
- telemetry 仅包含状态、目标函数、角度/差值、loss、评估次数、片段/点数、线程上限和耗时；不包含原始厚度测点。
- 未修改 `calibration.ts`、`calibrationBridge.ts`、Electron 主入口、设备连接或控制指令。

## 性能回归

Windows x64、Node 24.18.0、Rust 1.88.0、napi-rs 3.12.0、1 次预热和 3 次采样：

| 数据集 | Rust 核心加速 | 含 DTO 端到端加速 |
| ------ | ------------: | ----------------: |
| DS01   |        17.15× |            15.48× |
| DS02   |        18.23× |            18.44× |
| DS03   |        19.89× |            18.91× |
| DS04   |        19.15× |            19.59× |
| DS05   |        19.69× |            18.87× |

核心至少 3 倍、端到端至少 2 倍的门槛全部通过。详细数据见 `native-performance-baseline.json`。

## 验证结果

- Rust 单元测试 3/3、Clippy、`cargo fmt --check`：通过。
- Native 数值/性能/影子矩阵 16/16：通过。
- Calibration Worker 禁用、加载失败、线程边界和结果不覆盖测试 4/4：通过。
- Vite 生产构建：通过；`calibrationWorker.js` 保留环境开关和 `process.resourcesPath` 动态查找。
- Windows unpacked 打包：通过；`.node` 位于 `resources/native`，可加载并导出 5 个阶段 2 API。
- Prettier、仓库 oxlint：通过；lint 仅保留仓库既有 warnings。
- Server/App 全量 typecheck：仍被仓库既有 `fft-js` 声明、旧 import assertion、历史无效导入和未使用变量阻断，本阶段文件不在错误列表。
- 真实数据领域精度：DS01/03/04/05 通过；DS02 仍为 309.748° 对 320.2°，偏差 10.452°，与迁移前一致。

## 后续前置条件

1. 在非设备控制环境显式开启影子模式，收集多 Worker/长时间运行下的差异、P95 耗时、错误率和 CPU 占用。
2. 单独修复 DS02 领域精度并恢复 5/5 小于 5°。
3. 为 CI 固化 Windows x64 Native 构建和 unpacked 资源加载验证。
4. 满足上述条件后，另行评审生产切换；阶段 2 不授权 Rust 接管输出。
