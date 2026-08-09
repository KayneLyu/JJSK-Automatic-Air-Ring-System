# Rust 性能迁移阶段 2 计划

## 目标

在现有标定 Worker 内加入默认关闭的 Rust 影子执行路径。TypeScript 继续产生唯一生产结果；Rust 仅用于比较主搜索结果、耗时与稳定性，任何加载、配置或执行错误都不得影响标定结果。

## 实施步骤

1. 抽取阶段 1 benchmark 中已验证的片段归一化与 TypedArray DTO 构建逻辑，供 benchmark 和 Worker 共用。
2. 为 Rust/Rayon 增加显式线程池配置 API，并在影子执行前设置保守线程上限。
3. 新增纯函数影子运行器，比较 TypeScript `baseThetaDeg` 与 Rust 主搜索 theta，输出结构化遥测。
4. 在 `calibrationWorker.ts` 中加入环境特性开关、Native 二进制路径解析、错误隔离与结构化日志；生产 `maxAngle` 保持不变。
5. 为 Electron Builder 增加 Windows x64 Native 资源复制规则，不修改设备、标定控制器或主进程入口。
6. 添加禁用、成功、不可比较、配置/执行失败、Direct/Expanded 和真实数据集测试。
7. 运行 Rust、Native、Worker、阶段 0/1 回归、Electron Worker 构建、lint、格式和 typecheck 验收。

## 安全门槛

- 默认不开启 Rust 影子路径。
- Rust 结果不覆盖 TypeScript `maxAngle`。
- Native 加载或执行失败只生成遥测，不使 Worker 请求失败。
- Rayon 默认最多使用 4 个线程，环境覆盖必须通过 1–32 整数校验。
- 不修改 `calibration.ts`、`calibrationBridge.ts`、设备连接或控制指令。
- 遥测不得包含原始厚度数组。

## 验收标准

- 影子关闭时不加载 Native 模块、不增加 DTO 构建开销。
- 影子开启且 Native 可用时，DS01–DS05 Rust theta 与 TypeScript base theta 满足显式容差。
- 所有异常路径返回原 TypeScript 生产结果。
- Worker 构建产物不静态打包 `.node`，安装包资源路径可解析。
- DS02 领域精度失败继续单独保留。
