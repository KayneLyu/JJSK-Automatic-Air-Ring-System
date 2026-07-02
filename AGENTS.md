# AGENTS.md — AI Agent 入口

## 项目概览

JJSK 自动风环系统，用于吹膜机上旋 + 测厚 + 风环控制的 Electron + Vue 3 + TypeScript monorepo。

```
apps/AirRingSys/          # Electron 主应用 + Vue 前端
packages/AirRingServer/   # 后端服务器与控制算法（核心）
packages/core/            # 核心共享代码
packages/Simulation/      # 设备仿真系统
```

## 核心规则

- TypeScript 严格模式，pnpm 管理依赖，ESLint + Prettier
- 算法命名：camelCase 文件，PascalCase 类型，UPPER_SNAKE_CASE 常量
- 优先使用成熟第三方库，不重复造轮子
- 除非明确要求，不自动执行测试
- 设备控制指令必须边界校验，避免频繁调整损坏设备

## 导航

| 文档 | 说明 |
|------|------|
| [execution.md](.agents/guide/execution.md) | 执行协议：最小 diff、Plan First、Script First |
| [patterns.md](.agents/guide/patterns.md) | 项目约定：结构、命名、组件模式 |
| [safety.md](.agents/guide/safety.md) | 安全约束：禁止操作与高风险确认清单 |
| [dependencies.md](.agents/guide/dependencies.md) | 依赖策略：Third-Party First 优先级 |
| [i18n.md](.agents/guide/i18n.md) | 国际化规则 |
| [context.md](.agents/memory/context.md) | 长期上下文：物理模型与技术约定 |
| [decisions.md](.agents/memory/decisions.md) | 技术决策记录 |
