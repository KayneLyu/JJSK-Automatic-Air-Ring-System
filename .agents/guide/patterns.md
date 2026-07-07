# patterns.md — 项目约定

## Pattern First

复用项目已有模式，不另起炉灶。

## 项目结构

```
JJSK-Automatic-Air-Ring-System/
├── apps/AirRingSys/              # Electron 主应用
│   ├── electron/                 # Electron 主进程代码
│   │   ├── main.ts               # 主进程入口
│   │   ├── renderer.ts           # 渲染进程 IPC
│   │   ├── adbox.ts              # ADBox 设备连接
│   │   └── calibrationBridge.ts  # 标定桥接
│   └── src/                      # Vue 前端代码
│       ├── views/                # 页面组件
│       ├── components/           # 可复用组件
│       ├── store/                # Pinia 状态管理
│       ├── router/               # Vue Router
│       └── api/                  # API 调用
├── packages/
│   ├── AirRingServer/            # 后端服务器与控制算法
│   │   ├── algorithms/           # 核心算法模块
│   │   ├── controllers/          # 控制器（标定、OPC UA）
│   │   ├── connections/          # 设备连接（风环、测厚）
│   │   └── types/                # 类型定义
│   ├── core/                     # 核心共享代码
│   └── Simulation/               # 设备仿真
└── config/                       # 全局配置（ESLint）
```

## 命名约定

- **文件名**：camelCase（`buildTripSegment.ts`，`calibrationBridge.ts`）
- **Vue 组件**：PascalCase（`UpperRotation.vue`）
- **类型/接口**：PascalCase（`TripSegment`、`CalibrateResult`）
- **常量**：UPPER_SNAKE_CASE（`SEARCH_MAX_POINTS`、`THICKNESS_UNIT_PULSE_DIS`）
- **变量/函数**：camelCase
- **文件命名按功能拆分**：`upperRotation.estimate.ts`、`upperRotation.pulse.ts`

## 算法模块结构

```
algorithms/
├── upperRotation/                # 上旋控制算法
│   ├── upperRotation.ts          # 入口函数
│   ├── upperRotation.config.ts   # 配置与类型
│   ├── upperRotation.estimate.ts # 主估算逻辑
│   ├── upperRotation.evaluation.ts # 目标函数评估
│   ├── upperRotation.offset.ts   # 偏移展开
│   ├── upperRotation.pulse.ts    # 脉冲展开兜底
│   └── upperRotation.landscape.ts # 损失函数景观
├── buildTripSegment.ts           # 上旋行程片段构建
├── calibration.ts                # 标定控制器
├── tractionSpeedSmooth.ts        # 牵引速度平滑
├── findMutation.ts               # 突变检测
└── mutationWindowSize.ts         # 突变窗口标定
```

## 控制器模块结构

```
controllers/
├── adjustments/                  # 自动调整控制器
├── calibration/                  # 校准控制器
└── opcua/                        # OPC UA 通信控制器
```

## 连接模块结构

```
connections/
├── airRing/                      # 风环设备连接
├── thickness/                    # 厚度计连接
└── base/                         # 基础连接类
```

## File Size Awareness

当代码文件过大（超过 250 行纯逻辑，不含注释/空行/导入）、职责混杂、局部变更成本持续升高时：
- 优先按现有目录与模块模式进行合理拆分
- 拆分应遵循既有模块边界，保持最小必要范围
- 避免为拆分而拆分，仅在维护成本明显上升时执行

## 添加新模块

### 添加新算法

1. 在 `packages/AirRingServer/algorithms/` 创建算法文件
2. 创建对应的 `.test.ts` 测试文件
3. 在算法文件中导出纯函数
4. 确保函数有完整的 TypeScript 类型定义

### 添加新控制器

1. 在 `packages/AirRingServer/controllers/` 创建控制器目录
2. 在 `types.ts` 中定义相关类型
3. 在 `index.ts` 中导出控制器

### 添加新设备连接

1. 在 `packages/AirRingServer/connections/` 创建设备目录
2. 继承 `base` 中的基础连接类
3. 实现设备特定的通信协议

### 前端开发

1. **视图**：在 `apps/AirRingSys/src/views/` 添加页面组件
2. **组件**：在 `apps/AirRingSys/src/components/` 添加可复用组件
3. **API**：在 `apps/AirRingSys/src/api/` 定义 API 调用
4. **状态**：在 `apps/AirRingSys/src/store/` 管理应用状态（Pinia）

## 测试约定

- 测试框架：vitest
- 运行方式：`pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts`
- 测试文件命名：`*.test.ts`
- 验收标准：真实数据集误差 < 5°，模拟器数据集误差 < 5°

## 调试技巧

### Electron 调试

- **主进程**：在 VSCode 中使用 Electron Main 调试配置
- **渲染进程**：打开 DevTools (Ctrl+Shift+I)

### OPC UA 调试

- 使用 UA Expert 连接测试
- 检查节点树结构
- 验证数据类型匹配

### 算法调试

- 使用仿真数据进行单元测试
- 导出中间计算结果进行分析
- 使用可视化工具查看曲线
- 启用 `UPPER_ROTATION_DEBUG=1` 环境变量查看详细日志
