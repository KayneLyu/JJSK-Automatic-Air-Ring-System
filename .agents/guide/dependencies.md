# dependencies.md — 依赖策略

## Third-Party First 优先级（从高到低）

1. **项目已有依赖**：检查 `package.json`，优先复用
2. **社区成熟库**：选择维护良好、文档完整的包（nanostores、neverthrow、dayjs 等）
3. **内部实现**：仅当第三方库不满足需求时
4. **自研**：最后才考虑，且需写入 `decisions.md` 记录原因

## 添加新依赖的规范

- 使用 `pnpm add <package>` 安装
- 新依赖必须同步更新 `pnpm-lock.yaml`
- 评估标准：
  - 周下载量 > 100k
  - 最近 6 个月有更新
  - 有 TypeScript 类型支持（或 @types 包）
  - 许可证兼容（MIT/Apache 2.0 优先）

## 当前项目依赖

### 运行时依赖（apps/AirRingSys）

| 包 | 用途 |
|----|------|
| vue / vue-router / pinia | UI 框架 |
| echarts | 数据可视化 |
| axios | HTTP 请求 |
| dayjs | 日期处理 |
| dexie | IndexedDB |
| element-plus | UI 组件库 |
| electron-store | 配置存储 |

### 运行时依赖（packages/AirRingServer）

| 包 | 用途 |
|----|------|
| node-opcua | OPC UA 协议 |
| nodes7 | S7 协议 |
| winston | 日志 |
| modbus-serial | ModBus 协议 |

### 开发依赖

| 包 | 用途 |
|----|------|
| typescript | 类型系统 |
| eslint + prettier | 代码规范 |
| vitest | 测试框架 |
| vite | 构建工具 |

## 决策记录

引入新依赖时，必须在 `decisions.md` 记录：
- 依赖名称与版本
- 选择原因
- 评估过的替代方案
