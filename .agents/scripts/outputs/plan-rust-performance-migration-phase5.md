# Rust 性能迁移阶段 5 计划：受控串行 Shadow 观测

## 目标

在阶段 4 已验证的持久单 Worker 拓扑上，为 Rust shadow 增加可审计、可限流、可自动停止的观测边界，并提供只含聚合指标的离线汇总工具。TypeScript 结果继续作为唯一生产输出，Rust 仍默认关闭。

## 约束

- 不修改设备连接、运动控制、`main.ts`、`calibration.ts`、`calibrationBridge.ts` 或生产上旋算法选择。
- 不引入新的运行时依赖，不自动修改部署环境变量。
- 只允许单个持久 Calibration Worker 内串行执行 Native shadow，禁止并行 Native Worker。
- 日志不得包含原始厚度测点、设备地址、数据库路径或其他敏感运行数据。
- 日志写入失败必须与标定响应隔离；Worker 正常关闭前应等待已排队日志写入完成。

## 实施步骤

1. [x] 增加确定性每 N 次采样、每 Worker 最大运行次数、连续异常熔断和角度差阈值配置解析。
2. [x] 将采样与熔断控制器接入 Calibration Worker 的 stateful runtime，保持 TypeScript `maxAngle` 不变。
3. [x] 增加可选绝对路径 NDJSON 聚合前日志，并在 shutdown/ack 前 flush；未配置路径时保留控制台 telemetry。
4. [x] 增加策略、采样、熔断、日志隔离和实际构建 Worker 的单元/集成测试。
5. [x] 增加仅输出聚合统计的离线汇总脚本与受控观测 runbook。
6. [x] 运行格式、lint、typecheck、Worker/Native 构建、Rust 检查及阶段回归矩阵。
7. [x] 更新 task/context/decisions/progress 与阶段 5 验收摘要；不执行真实设备或生产环境观测。

## 验收标准

- [x] Rust shadow 仍默认关闭，且任意采样/熔断状态都不改变 TypeScript 生产结果。
- [x] 默认每 Worker 最多执行 100 次 shadow；采样间隔、次数上限、连续异常阈值和角度差阈值均有严格边界校验。
- [x] 连续失败或超阈值达到默认 3 次后自动停止后续 shadow；成功样本可重置连续异常计数。
- [x] NDJSON 记录有版本、时间、进程、策略状态和既有 telemetry，不含原始测点；日志失败不导致 Worker 请求失败。
- [x] shutdown/ack 前完成日志 flush，实际构建 Worker 测试可稳定读取完整记录。
- [x] 离线汇总只输出状态计数与延迟/差值聚合，不回写逐条记录。
- [x] Native/Worker 回归、Rust 检查、lint 和格式通过；typecheck 不新增错误。
- [x] 不修改设备控制、标定 Bridge、主进程入口和部署配置。

## 预期产出

- Shadow 观测策略与有序 NDJSON writer。
- Calibration Worker stateful runtime 接入及 shutdown flush。
- 策略/Worker 集成测试和聚合脚本。
- 阶段 5 runbook、验证报告和 go/no-go 边界说明。
