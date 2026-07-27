# AGENTS.md — AI Agent 入口

## 项目概览

JJSK 自动风环系统，用于吹膜机上旋 + 测厚 + 风环控制的 Electron + Vue 3 + TypeScript monorepo。

```
apps/AirRingSys/          # Electron 主应用 + Vue 前端
packages/AirRingServer/   # 后端服务器与控制算法（核心）
packages/core/            # 核心共享代码
packages/Simulation/      # 设备仿真系统
```

## 开始工作前

⚠️ 在开始任何工作前，你必须**首先读取以下文件**：
1. `README.md`（如存在）— 理解项目目标、结构和技术栈
2. `.agents/README.md` — 理解 Agent OS 目录结构与场景化的行为契约

## 核心规则

- TypeScript 严格模式，pnpm 管理依赖，ESLint + Prettier
- 算法命名：camelCase 文件，PascalCase 类型，UPPER_SNAKE_CASE 常量
- 优先使用成熟第三方库，不重复造轮子
- 代码修改后主动执行与风险相称的相关测试，阶段验收时运行对应测试矩阵
- 设备控制指令必须边界校验，避免频繁调整损坏设备
