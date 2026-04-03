# JJSK 自动风环系统 - Copilot 指引

## 项目概述

这是一个用于吹膜机的自动风环控制系统，采用 Electron + Vue 3 架构，包含前端界面和后端服务器。

### 吹膜系统组成与物理约束

系统包含四个核心模块：

#### 1️⃣ 风环系统

- 风环包含 **N 个风道**，将熔融原料吹成膜泡。
- 理想情况下膜泡可近似为**正圆柱体**。

#### 2️⃣ 上旋系统

- 上旋负责将膜泡压平。
- 理想状态下，上旋轴线为穿过膜泡圆心的直线（直径），但实际可能存在**偏心**。
- 上旋绕近似圆心旋转。
- 为保证厚度一致性，上旋的扫描角度满足：`180° < θ_max < 360°`
- 上旋为**往复旋转**，仅在到达 0° 与 θ_max
  时存在短暂加减速，其余时间近似匀速。
- 单程时间约 6--8 分钟，标定时正反单程时间相等。

#### 3️⃣ 测厚系统

- 测厚仪采集**压平后的双层薄膜厚度**。
- 测厚仪本身也进行往复扫描。
- 因测厚行程大于膜宽，数据中存在**出界点**。
- 测厚信号满足模型：`T(t) = f(θ(t)) + f(θ(t)+π)`
- 测厚单程时间较快，约 30 秒。

#### 4️⃣ 牵引系统

- 牵引辊以固定线速度收卷薄膜。

## 技术栈

### 前端 (apps/AirRingSys)

- **框架**: Electron + Vue 3 + TypeScript
- **构建工具**: Vite
- **UI组件**: 自定义组件
- **状态管理**: Pinia (store目录)
- **路由**: Vue Router
- **国际化**: i18n

### 后端 (packages/AirRingServer)

- **运行环境**: Node.js + TypeScript
- **协议**: OPC UA
- **核心功能**:
    - 风环控制算法
    - 厚度测量与计算
    - 设备通信与数据采集
    - 自动调整与校准

### 仿真系统 (packages/Simulation)

- **功能**: 模拟厚度计、风环、滚轮等设备
- **用途**: 开发测试和算法验证

## 项目结构

```
JJSK-Automatic-Air-Ring-System/
├── apps/AirRingSys/          # Electron主应用
│   ├── electron/             # Electron主进程代码
│   └── src/                  # Vue前端代码
├── packages/
│   ├── AirRingServer/        # 后端服务器与控制算法
│   ├── core/                 # 核心共享代码
│   └── Simulation/           # 设备仿真系统
```

## 开发规范

### 代码风格

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 使用 pnpm 作为包管理器
- 采用 monorepo 架构
- **重要**: 不要尝试修复代码格式问题，包括ESLint问题，除非我特别指出需要修复，一般编辑器会在代码输出后自动使用 Prettier
  进行格式化
- **重要**: 实现功能时优先使用成熟的第三方库，避免重复造轮子。引入新依赖时使用 `pnpm` 安装，并确保选择社区活跃、维护良好的包

### 命名约定

- **文件名**: 使用 camelCase (如 `buildTripSegment.ts`)
- **组件**: 使用 PascalCase
- **变量/函数**: 使用 camelCase
- **类型/接口**: 使用 PascalCase
- **常量**: 使用 UPPER_SNAKE_CASE

### 算法模块 (packages/AirRingServer/algorithms)

- `buildTripSegment`: 构建行程片段
- `findMutation`: 查找突变点
- `thickness`: 厚度计算
- `thicknessReverseCalculation`: 厚度反向计算
- `timeToAngle`: 时间到角度转换
- `tractionSpeedSmooth`: 牵引速度平滑
- `upperRotation`: 上旋转控制算法

### 控制器模块 (packages/AirRingServer/controllers)

- `adjustments`: 自动调整控制器
- `calibration`: 校准控制器
- `opcua`: OPC UA 通信控制器

### 连接模块 (packages/AirRingServer/connections)

- `airRing`: 风环设备连接
- `thickness`: 厚度计连接
- `base`: 基础连接类

## 开发指引

### 添加新算法

1. 在 `packages/AirRingServer/algorithms/` 创建算法文件
2. 创建对应的 `.test.ts` 测试文件
3. 在算法文件中导出纯函数
4. 确保函数有完整的 TypeScript 类型定义

### 添加新控制器

1. 在 `packages/AirRingServer/controllers/` 创建控制器
2. 在 `types.ts` 中定义相关类型
3. 在 `index.ts` 中导出控制器

### 添加新设备连接

1. 在 `packages/AirRingServer/connections/` 创建设备目录
2. 继承 `base` 中的基础连接类
3. 实现设备特定的通信协议

### 前端开发

1. **视图**: 在 `apps/AirRingSys/src/views/` 添加页面组件
2. **组件**: 在 `apps/AirRingSys/src/components/` 添加可复用组件
3. **API**: 在 `apps/AirRingSys/src/api/` 定义 API 调用
4. **状态**: 在 `apps/AirRingSys/src/store/` 管理应用状态

### 测试

- 所有算法必须有对应的单元测试
- 测试文件命名: `*.test.ts`
- 使用仿真系统进行集成测试
- **重要**: 除非用户明确要求使用单元测试验证结果，否则不要自动执行单元测试。如果用户取消了单元测试的执行，不要再次尝试执行，而是继续后续流程
- 使用`vitest`作为测试框架，例如：

```bash
cd packages/AirRingServer
pnpm exec vitest --run algorithms/upperRotation.test.ts -t=^模拟器A/B诊断测试
```

## 重要注意事项

### 性能要求

- 算法执行需要实时响应（< 100ms）
- 避免在主线程进行密集计算
- 使用 RingBuffer 处理实时数据流

### 数据处理

- 厚度数据需要平滑处理
- 牵引速度需要去噪
- 注意数据时间戳同步

### 错误处理

- 设备连接失败需要自动重连
- 数据异常需要记录日志
- 关键错误需要通知用户

### 安全性

- 设备控制指令需要验证
- 参数范围需要边界检查
- 避免频繁调整导致设备损坏

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式运行主应用
cd apps/AirRingSys
pnpm dev

# 构建应用
pnpm build

# 运行测试
pnpm test

# 运行仿真服务器
cd packages/Simulation
pnpm start
```

## 调试技巧

### Electron 调试

- 主进程: 在 VSCode 中使用 Electron Main 调试配置
- 渲染进程: 打开 DevTools (Ctrl+Shift+I)

### OPC UA 调试

- 使用 UA Expert 连接测试
- 检查节点树结构
- 验证数据类型匹配

### 算法调试

- 使用仿真数据进行单元测试
- 导出中间计算结果进行分析
- 使用可视化工具查看曲线

## 扩展阅读

- [OPC UA 规范](https://opcfoundation.org/)
- [Electron 文档](https://www.electronjs.org/)
- [Vue 3 文档](https://vuejs.org/)
- [TypeScript 文档](https://www.typescriptlang.org/)

