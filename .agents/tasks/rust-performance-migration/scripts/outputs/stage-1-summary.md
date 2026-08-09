# Rust 性能迁移阶段 1 验收摘要

## 结论

阶段 1 Rust Node-API PoC 通过。Rust 核心和包含 TypedArray DTO 的端到端性能均显著超过继续迁移门槛，数值结果与 TypeScript 参考实现等价。当前实现仍是离线影子 PoC，没有修改生产估算或设备控制链路。

## 环境与实现

- Windows x64，Node.js 24.18.0，AMD Ryzen 9 9950X3D（32 逻辑核）
- mise 固定 Node 24.18.0、pnpm 10.18.3 与 Rust 1.88.0
- napi-rs 3.12.0、Node-API 8、Rayon 1.12.0
- 包级构建直接执行 Cargo release 并复制为 `.node`，无 npm 构建依赖
- 1 次预热、3 次正式采样；以下均为中位数

## 正式结果

| 数据集 |   点数 | TypeScript | Rust 核心 | Rust 端到端 | 核心加速 | 端到端加速 |
| ------ | -----: | ---------: | --------: | ----------: | -------: | ---------: |
| DS01   |  7,787 |  31.002 ms |  1.647 ms |    1.880 ms |   18.82× |     16.49× |
| DS02   | 14,346 |  57.115 ms |  2.990 ms |    3.063 ms |   19.10× |     18.65× |
| DS03   | 13,934 |  55.833 ms |  2.946 ms |    3.220 ms |   18.95× |     17.34× |
| DS04   | 15,143 |  60.879 ms |  3.447 ms |    3.422 ms |   17.66× |     17.79× |
| DS05   | 15,774 |  63.611 ms |  3.470 ms |    3.725 ms |   18.33× |     17.08× |

- 核心至少 3 倍：通过
- 端到端至少 2 倍：通过
- 详细机器可读报告：`native-performance-baseline.json`

## 正确性与工程验收

- Rust 单元测试：2/2 通过
- Rust/TypeScript 数值等价：7/7 通过
- 阶段 0 + 阶段 1 串行 benchmark 矩阵：9/9 通过
- Clippy（warnings as errors）、Rust fmt、仓库 lint：通过
- 真实数据领域精度：DS01/03/04/05 通过，DS02 仍偏差 10.452°；与阶段 0 相同
- AirRingServer typecheck：被仓库既有错误阻断，新增 Native/benchmark 文件不在错误列表

## 阶段 2 前置条件

1. 只在现有标定 Worker 中做影子执行，使用特性开关，TypeScript 继续提供生产结果和回退。
2. 配置 Rayon 线程池上限，验证多 Worker 并发下没有 CPU 过度订阅。
3. 记录 Rust/TypeScript 结果差异、耗时、原生加载错误与回退原因。
4. 补齐 Electron 打包和 CI 的 Windows x64 原生模块验证。
5. DS02 精度问题单独修复并通过小于 5°门槛后，才评估生产切换。
