# 阶段 5：受控串行 Rust Shadow 观测验收

## 结论

阶段 5 的离线实现与验收通过。Rust shadow 已具备确定性采样、单 Worker 预算、连续异常熔断、可选有序 NDJSON 和只含聚合指标的离线汇总能力。Rust 仍默认关闭，TypeScript `maxAngle` 仍是唯一生产结果；本阶段没有执行真实设备或生产环境观测，也不允许 Rust 生产接管。

## 实现边界

- 从每个 Worker 的首个请求开始按每 N 次确定性采样，默认 `everyN=1`。
- 单 Worker 默认最多 100 次；连续 3 次 `loadError`、`executionError`、`notComparable` 或角度差超过 `1e-9°` 后熔断。
- 所有配置使用 `AIR_RING_RUST_SHADOW_*` 环境变量并有数值/路径边界；项目未自动修改 `mise.toml` 或部署环境。
- 可选绝对路径 NDJSON 只记录时间、进程、策略状态和既有 telemetry，不包含原始测点；写入失败与请求隔离，shutdown/ack 前 flush。
- 离线脚本只输出状态计数与角度差、Native/总延迟聚合，不回写逐条记录。
- 未修改设备控制、`calibrationBridge.ts`、`calibration.ts`、`main.ts` 或生产算法选择。

## 验证结果

- Native/Shadow/Worker 阶段回归 28/28 通过。
- 实际 production Worker：7 个请求仅第 1/3/5 次运行 shadow，单 Worker 复用；3 条日志在 shutdown 前完整刷新，全部 `success`，角度差最大 0。
- 实际 Worker 聚合：Native P95 5.559ms、shadow 总耗时 P95 7.633ms，最终状态 `maxRunsReached`。
- 追加持久单 Worker shadow 耐久 15/15 通过，报告全部硬门槛通过。
- Rust 单测 4/4、Clippy、`cargo fmt --check`、Native release build、Vite production build、Prettier 和 lint 通过。
- 阶段 5 Worker 文件独立严格 Node typecheck 通过；App/Server 全量 typecheck 仅保留仓库既有 `fft-js`、旧 import assertion、历史无效导入、`confirmCount` 等错误，本阶段文件不在错误列表。
- 最新 Rust 核心加速 11.44–16.78 倍、含 DTO 端到端加速 11.98–16.78 倍，继续超过 3 倍/2 倍门槛。

## 独立质量阻断

完整上旋测试树当前为 162/175：DS02 仍偏差 10.452°；另有 9 个随机模拟器和 3 个模拟器 A/B 用例失败。阶段 5 没有修改上旋算法语义或这些失败栈中的文件，因此不在本阶段越界修复，但这些结果与 DS02 一起继续阻断 Rust 生产接管。

## 下一步边界

- 如需进入真实环境受控观测，应按 `stage-5-runbook.md` 另行授权、值守，并保持持久单 Worker 拓扑。
- 如需修复 DS02/模拟器精度，应建立独立算法质量任务，避免与性能观测混合。
- 在真实观测与领域精度门槛全部通过前，Rust 生产接管保持 no-go。
