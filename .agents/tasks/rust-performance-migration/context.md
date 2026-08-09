# Task: Rust 性能迁移

## 背景

项目计划评估并分阶段将 CPU 密集算法迁移到 Rust。阶段 0–6 已完成基线、PoC、影子集成、Worker 生命周期修复和历史数据观测；阶段 7 已将上旋目标函数、粗/细搜索与最终收敛 loss 计算接入 Rust Native primary。Phase 8A/8B 完成膜泡 Batch CSR Native、持久 Worker 和历史 shadow，Phase 8C 又完成同窗历史双跑及 300 次 primary 长跑，并仅在 mise 开发环境启用 Bubble Rust Batch primary。TypeScript 继续提供完整回退和全部领域后处理；RLS、非 mise 与安装包暂不迁移。

## 涉及文件

- `packages/AirRingServer/algorithms/upperRotation/`
- `packages/AirRingServer/algorithms/bubbleReconstruction/`
- `packages/AirRingServer/algorithms/benchmarks/`
- `packages/AirRingNative/`
- `apps/AirRingSys/electron/calibrationWorker.ts`
- `apps/AirRingSys/electron/calibrationWorkerClient.ts`
- `apps/AirRingSys/electron/calibrationBridge.ts`
- `apps/AirRingSys/electron/historicalCalibrationWorker.ts`
- `apps/AirRingSys/electron/historicalBubbleObservation.ts`
- `apps/AirRingSys/electron/bubbleQueryWorker.ts`
- `apps/AirRingSys/electron-builder.json5`
- `mise.toml`
- `.agents/tasks/rust-performance-migration/scripts/`
- `.agents/tasks/rust-performance-migration/scripts/outputs/`

## 约束

- 阶段 2 仅修改现有校准 Worker 的可选影子路径，不修改标定控制器、Bridge、设备连接、Electron 主进程入口或控制器逻辑。
- 根目录 `mise.toml` 仅服务使用 mise 的开发者；现场构建只要求 Node 24、pnpm 10、Rust 1.88+ 位于 PATH，版本管理工具不限。Windows Rust 构建需要 Visual Studio 2022 C++ Build Tools。
- Node-API 输入必须使用批量 TypedArray DTO，并在 Rust 边界完成结构与数值校验。
- 基准必须与 TypeScript 参考实现使用同一输入和搜索语义。
- Rust/TypeScript 数值等价与真实数据集领域精度分开验收；DS02 的既有 10.452° 偏差继续作为生产切换阻断项。
- 基准默认串行执行，避免 Vitest 文件并行影响数据。
- 输出必须包含运行环境和配置，避免把不同机器或参数的结果直接比较。
- 设备联机测试不在阶段 0 自动执行范围内。
- Rust 影子默认关闭；`AIR_RING_RUST_SHADOW=1` 才加载 Native，线程数由 `AIR_RING_RUST_SHADOW_THREADS` 控制并限制为 1–32（默认最多 4）。
- `AIR_RING_RUST_NATIVE_PATH` 可覆盖 Native 路径；安装包默认从 `resources/native` 加载。
- Calibration Worker 必须保持持久单 Worker + FIFO 拓扑；不得恢复每请求创建/立即终止或并行 Native Worker。
- 正常响应不得调用 `terminate()`；短生命周期父 Worker 必须通过 shutdown/ack 优雅关闭子 Worker。
- Rust primary 只允许在持久单 Worker 中串行执行；`AIR_RING_RUST_PRIMARY_THREADS` 必须为 1–32，项目开发默认 4。
- primary 与 shadow 必须互斥；Native 异常、无效/越界结果或扫描路径失败必须回退 TypeScript。
- TypeScript 继续保留脉冲特征与领域规则编排；进一步迁移前必须建立逐规则最终结果等价门槛。
- 膜泡 Rust shadow 仅在 `AIR_RING_BUBBLE_RUST_SHADOW=1` 时启用；默认关闭且不得覆盖 TypeScript profile。
- 膜泡 Native 直接消费 CSR `Int32Array`/`Float64Array`；禁止逐点 Node-API 调用或跨边界传输 N×N 稠密矩阵。
- 膜泡 Worker 必须保持持久单 Worker + FIFO；正常响应不得 `terminate()`，显式关闭使用 shutdown/ack。
- Phase 8B 的 13 个有效历史 profile 全部精确等价；48-bin 完整重建中位加速 3.04 倍、求解中位加速 1.58 倍，合成端到端复跑为 1.15 倍。
- Phase 10 起，打包态默认设置 `AIR_RING_RUST_PRIMARY=1`、`AIR_RING_RUST_PRIMARY_THREADS=4` 和 `AIR_RING_BUBBLE_RUST_PRIMARY=1`；两个 `*_DISABLE=1` 继续具有禁用优先级，Native 异常继续完整回退 TypeScript。mise 只负责开发环境，不再是部署开关来源。
- Bubble primary 与 shadow 必须互斥；Native 或后处理失败必须完整重跑 TypeScript，RLS 始终走 TypeScript。
- 历史查询只读取 `rotation_raw`/`thickness_raw` 的稳定必要列；不得用 Drizzle `select(*)` 强迫旧历史库具备后续新增列。
- 异步历史 Bubble Query Worker 每趟最多向父线程传输 2000 个均匀采样点，同时保留 `sourceRowCount`；禁止恢复“完整 `.all()` → 跨线程复制 → 父线程降采样”的高峰值内存路径。
- Phase 9 已完成单库 13 个唯一 profile、1001 次 primary 的本机长跑；该结果只证明重复稳定性。原“至少 3 个独立历史库后才默认启用安装包”的保守门槛仍作为风险记录，但用户在 Phase 10 明确授权打包态默认启用，并依靠禁用开关与 TypeScript 回退控制风险。
- Phase 11 将 Electron Windows x64 运行时视为低频基础层，将完整 `resources` 视为原子更新的高频内容层；内容更新仅允许 Electron 精确版本、平台、架构和 Node modules ABI 全部匹配的目标目录。
- 内容包不得只替换 `app.asar`：必须同时携带 `app.asar.unpacked`、`resources/native` 与其他 `extraResources`，避免 JavaScript、Rust Native 和 Electron ABI 原生依赖版本错配。
- 内容替换必须在 JJSK 进程退出后执行，逐文件校验 SHA-256，先同卷暂存并备份旧 `resources`，失败自动恢复；现场设备仍不需要开发环境。

## 相关测试

```bash
pnpm --dir packages/AirRingServer exec vitest run algorithms/benchmarks/performanceBaseline.test.ts --pool=forks --maxWorkers=1 --fileParallelism=false
pnpm --dir packages/AirRingNative run build
pnpm --dir packages/AirRingNative run rust:test
pnpm --dir packages/AirRingNative run rust:clippy
pnpm --dir packages/AirRingServer exec vitest run algorithms/benchmarks/nativeUpperRotation.test.ts algorithms/benchmarks/nativePerformanceBaseline.test.ts --pool=forks --maxWorkers=1 --fileParallelism=false
pnpm --dir packages/AirRingServer exec vitest run algorithms/benchmarks/nativeShadow.test.ts algorithms/benchmarks/calibrationWorkerShadow.test.ts --pool=forks --maxWorkers=1 --fileParallelism=false
pnpm --dir packages/AirRingServer exec vitest run algorithms/bubbleReconstruction/bubbleReconstruction.test.ts algorithms/benchmarks/nativeBubbleReconstruction.test.ts algorithms/benchmarks/bubbleWorkerShadow.test.ts algorithms/benchmarks/bubbleWorkerClient.test.ts
pnpm --dir packages/AirRingServer exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"
pnpm exec tsc --noEmit -p packages/AirRingServer/tsconfig.json
pnpm lint
```

## 相关决策

见 `decisions.md`。
