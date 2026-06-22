## Goal
- 在系统设置页膜泡原始厚度 Tab 实现"每一趟扫描数据 = 一幅极坐标图"的可视化（实时 + 历史），算法 `reconstructBubbleThickness` 物理已审查通过；当前专注前端图表交互 + 算法层平滑

## Constraints & Preferences
- 一趟扫描 = 一次 forward 或 reverse 完整行程（相邻两次 direction change 事件之间）
- 物理参数：`thetaMaxDeg` / `membraneWidthMm` / `airAD` / `gain` / `mmPerPulse`
- 极坐标图（不是 Cartesian 折线/热图）；折线要"绘制成圆形"（闭合环 + 实心填充）
- 数据格式：`BubbleReconstructionResult` 在前后端各定义一次
- 参考 `LongitudinalCharts` 的分页/导航模式：实时不显示 prev/next，历史显示
- 实模式/历史模式自动切换基于 `isConnected`；历史模式关闭自动刷新
- 角度顺时针方向（0° 在正上方、90° 在右、180° 在下、270° 在左）
- tooltip 显示的角度与图形轴标签一致（cardinal 角度 `v % 90 === 0`）
- 折线在数据稀疏时仍要"以圆形呈现"（加 MIN_RADIUS 基线）
- 算法层默认 `lambda=1e-4`、`mu=0.1`（弱平滑，二阶差分）

## Progress
### Done
- `dataPipeline.ts` 加 `getBubbleSweeps({startMs,endMs,...})`（按时间窗口拉扫描列表）
- `dataPipeline.ts` 加 `getLatestBubbleSweeps({count,beforeTs,...})`（按方向变化事件分页，N+1 事件配 N 趟），核心物理同 `buildProfile`
- `dataPipeline.ts` 加 `MAX_POINTS_PER_SWEEP=2000` 均匀下采样；`MIN_SWEEP_MS=30_000` 过滤过密的换向
- `sqliteService.ts` 加 `queryLatestDirectionChanges(count, beforeTs?)`：原生 SQL `WHERE (forwardDirChange>0 OR reverseDirChange>0) ORDER BY timestamp DESC LIMIT ?`
- `adbox.ts` 注册 `bubble-get-sweeps` + `bubble-get-latest-sweeps` IPC
- `ipc.d.ts` 加两个 IPC channel + `BubbleSweepResult extends BubbleReconstructionResult { id, time, direction, cycleDurationMs }`
- 文件拆分：`useBubbleSweeps.ts` / `useBubblePolarChart.ts` / `BubbleStatusBar.vue` / `BubbleNavBar.vue` / `BubblePolarChart.vue` / `BubbleRawThickness.vue`
- `useBubbleSweeps.ts` 实现 `LongitudinalCharts` 风格分页：`SWEEP_PAGE_SIZE=20`、prev 边界自动 `loadOlderSweeps(beforeTs)` 拼接到头部、hasOlderData 标记、refresh 覆盖前用 `prevId` 保留选中（必须在 `await` 之前捕获）
- `useBubbleSweeps.ts` 自动刷新：仅 live 模式 + `autoRefresh` 开；historical 模式直接 `stopAutoRefresh`
- 多次切换图表类型：`radar` → `polar+line+areaStyle` → `radar+line+areaStyle` → **`polar+line+custom`**（最终方案，clockwise:true + custom renderItem 自绘多边形）
- `useInitCharts.ts` 加可选 `onReady` 回调 + `requestAnimationFrame` 重试 0 尺寸容器
- `useBubblePolarChart.ts` 用 zrender 的 `mousemove` + `data.getItemLayout(0)` + centroid + atan2 找最近 vertex；自定义 HTML tooltip
- `onBeforeUnmount` 必须放在 composable 顶层（setup 阶段），通过 closure `cleanupHover` 传递
- `MIN_RADIUS=30` 基线让原始数据 0 的位置折线不塌在圆心，肉眼可见的环
- **`bubbleThicknessReconstruction.ts` 加二阶差分平滑正则 `mu·D^T D`**：D 是循环三对角差分算子（D[i][i-1]=1, D[i][i]=-2, D[i][i+1]=1），D^T D 是循环五对角 [1, -4, 6, -4, 1]；`solveNormalEquations` 加 `mu: number` 参数，构造 ATA 后 lambda 循环后再加 `mu*6` 到对角、`mu*-4` 到 ±1、`mu*1` 到 ±2（mod N 包裹）；`BubbleReconstructionOptions` 加 `mu?: number` 默认 0.1，mu=0 完全关闭
- 测试通过：`bubbleThicknessReconstruction.test.ts` 4 个测试 + `upperRotation.test.ts` 5 个测试全过（9 passed），`dataPipeline.ts` 实时调用未显式传 mu 使用默认 0.1

### In Progress
- (none)

### Blocked
- (none)

## Key Decisions
- **`MIN_RADIUS=30` 基线**：原始 profile 0 的位置折线会落圆心（不可见），加基线让"圆环"肉眼明显是环不是点；tooltip 仍用原始 `sweep.profile[bestIdx]` 不带基线
- **`polar+custom` 双 series 方案**：`polar+line+areaStyle` 的 fill 是"折线到圆心的扇形"而非"折线围成的内部"，必须用 `custom` series 在 `renderItem` 里 `api.coord([angleDeg, radius])` 自绘闭合多边形
- **`clockwise:true` 只能用 polar 不能用 radar**：`radar` 内部永远是 `startAngle + i*360/n` 逆时针布局
- **`trigger: 'axis'` 在 radar 不可靠**：5.5.x 行为不稳定且 `params.value` 常为 48 元素数组；改用 zrender `mousemove` + `getItemLayout(0)` 几何计算
- **裁掉"立即加载"**：实模式与 auto-refresh 重复，历史模式无意义（数据静态）
- **历史模式禁自动刷新**：`dataMode === 'historical'` 时 `startAutoRefresh` 直接 return
- **prev 边界自动 `loadOlderSweeps`**：用户在最旧幅时 `selectedIndex=0`，点击 prev 触发 `bubble-get-latest-sweeps(SWEEP_PAGE_SIZE, oldestTime-1)`，拼接去重后 `selectedIndex += older.length`
- **`canGoPrev` 三态条件**：`!isRefreshing && sortedSweeps.length>0 && (selectedIndex>0 || hasOlderData)`
- **`bubble-get-latest-sweeps` 而非"load all"**：分页加载避免一次拉太多趟卡主进程（O(N²·M)），每趟 ~30ms
- **tooltip 角度用 bin 下界**（`bestIdx * 360/numBins`）匹配轴标签"0°/90°/180°/270°"，不用 bin center
- **平滑正则用二阶差分而非一阶**：一阶差分惩罚"梯度"会强制 profile 水平，二阶差分惩罚"曲率"对均匀/低频信号零贡献、只对相邻 bin 突变（高频噪点）强惩罚，更符合"流延膜厚物理"——膜厚变化通常连续不会跳变
- **`mu=0.1` 默认值**：A^T A 对角 ≈ M/N = 16k/48 ≈ 333 时只占 0.18% 几乎无影响；稀疏场景（M≈2N=96）占 6.25% 仍弱但能抹掉尖刺；不破坏真实物理 shape
- **`mu=0` 完全禁用**：`if (mu > 0)` 守门，零成本关闭
- **不加 mu 到 dataPipeline 显式调用**：默认 0.1 一致；若需现场调可后续加 settings 页面板

## Next Steps
- 现场试跑新算法：观察真实数据下 mu=0.1 是否能抹掉尖刺（用户已确认图表视觉 OK）
- 可选：为 mu 写一个独立单元测试（用构造好的"含 1 个尖刺"profile 验证 mu>0 vs mu=0 的差别），但用户未要求不主动加
- 长期：现场调 mu 默认值；如真实数据稀疏场景下 0.1 太弱可考虑 1.0
- 其他挂起：历史模式加日期范围选择（用户未要求先不做）

## Critical Context
- **`trigger: 'item'` 在 radar 5.5.x 失效**：`params.value` 常是 48 元素数组
- **`radar.convertFromPixel` 在 5.5.1 没实现**（`return null`），必须用 `data.getItemLayout(0)` 自算
- **`onBeforeUnmount` 必须在 setup 阶段调用**：在 `onReady` 回调里调用会触发 `[Vue warn]: onBeforeUnmount is called when there is no active component instance`
- **`await` 排空 microtask 队列**：refresh() 里必须先 `const prevId = lastSelectedId.value` 再 `await fetchSweeps`
- **`useInitCharts` 必须在 `el.clientWidth/Height != 0` 时 init**：flex 子元素 0 尺寸会触发 `Can't get DOM width or height` warning；用 `requestAnimationFrame` 重试
- **`polar+line+areaStyle` fill 行为**：fill 是"折线到圆心的扇形"，不是"折线围成的内部"
- **`radar` 永远逆时针**：ECharts 5.5.1 `radar` 内部 `(startAngle + i*360/n) % 360` 顺序布局
- **数据稀疏导致"折线不是圆"**：真实 bubble 数据大半 bin 是 0，线塌在圆心，加 `MIN_RADIUS` 基线让 ring 可见
- **数据真实范围 max ≈ 175μm**（在 forward scan 早期）
- **D^T D 推导**：`D[i][i-1]=1, D[i][i]=-2, D[i][i+1]=1`（mod N）→ D^T D 行模式 `[1, -4, 6, -4, 1]`（对角 4+1+1=6，±1 位置 -2+-2=-4，±2 位置 1*1=1，循环）
- **mu 选型量化**：A^T A 对角 ≈ M/N，测量数 M 大时 mu 相对量小（弱），M 小时 mu 相对量大（强）——自适应"过定/欠定"场景
- **测试通过但可能掩盖问题**：simulator 测试用 16k 测量（过定），mu=0.1 重构 vs GT 误差 1.87µm < 5µm 通过；但实际现场稀疏数据下表现需现场验证
- **多谐波测试**：1.5*sin + 0.8*sin(2θ+0.5) + 0.6*sin(4θ+1.0) 下 profile[0..11] = 98.2, 97.9, 97.6, 98.0, 98.3... 重建方差 1.867 vs GT 6.244（高频被滤，符合预期）

## Relevant Files
- `apps/AirRingSys/src/views/settings/rack/useBubblePolarChart.ts`：极坐标 + custom 多边形 + 顺时针 + MIN_RADIUS=30 基线 + zrender hover 自定义 tooltip；`cleanupHover` closure 模式
- `apps/AirRingSys/src/views/settings/rack/useBubbleSweeps.ts`：分页数据加载，prev 边界自动 loadOlderSweeps，prevId await 前捕获，historical 禁自动刷新
- `apps/AirRingSys/src/views/settings/rack/BubbleRawThickness.vue`：主入口，组合 StatusBar + NavBar (`v-if="dataMode === 'historical'"`) + PolarChart
- `apps/AirRingSys/src/views/settings/rack/BubbleStatusBar.vue`：状态栏 + 自动刷新 checkbox（仅 live 显示）
- `apps/AirRingSys/src/views/settings/rack/BubbleNavBar.vue`：prev/next 导航（仅 historical 显示）
- `apps/AirRingSys/src/views/settings/rack/BubblePolarChart.vue`：图表容器 + 浮动 HTML tooltip
- `apps/AirRingSys/src/views/settings/rack/bubbleRawThickness.constants.ts`：`SWEEP_PAGE_SIZE=20`、`REFRESH_INTERVAL_MS=2000`
- `apps/AirRingSys/src/hooks/useInitCharts.ts`：`onReady` 回调 + `requestAnimationFrame` 重试 0 尺寸容器
- `apps/AirRingSys/electron/dataPipeline.ts:306-405` `getBubbleSweeps`（按时间窗口） + `:407-485` `getLatestBubbleSweeps`（按方向变化事件分页）
- `apps/AirRingSys/electron/dataPipeline.ts:693-701` `downsampleUniform<T>(arr, target)` 均匀下采样
- `apps/AirRingSys/electron/dataPipeline.ts:763-767` `reconstructBubbleThickness` 实时调用（未显式传 mu 用默认 0.1）
- `apps/AirRingSys/electron/sqliteService.ts` 新增 `queryLatestDirectionChanges(count, beforeTs?)`
- `apps/AirRingSys/electron/adbox.ts:777-800` 两个新 IPC handler
- `apps/AirRingSys/src/types/ipc.d.ts:320-360` `bubble-get-sweeps` / `bubble-get-latest-sweeps` channel 类型
- `apps/AirRingSys/src/views/annular/loop-charts.vue`：分页/导航参考实现
- `packages/AirRingServer/algorithms/bubbleThicknessReconstruction.ts`：
  - `:30-35` `BubbleReconstructionOptions` 加 `mu?: number`
  - `:103-119` `solveNormalEquations` 加 `mu: number` 形参
  - `:146-159` **核心修改**：mu>0 时加 D^T D 五对角平滑（对角 +6, ±1 位置 -4, ±2 位置 +1，mod N 循环）
  - `:220-222` `mu = options?.mu ?? 0.1` 默认值
  - `:239` `solveNormalEquations(A, b, lambda, mu)` 调用点
- `packages/AirRingServer/algorithms/bubbleThicknessReconstruction.test.ts`：4 个测试全过
