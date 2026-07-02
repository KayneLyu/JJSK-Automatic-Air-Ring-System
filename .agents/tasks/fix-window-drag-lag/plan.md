# Plan — 修复窗口拖动卡顿(最小范围)

## 范围(用户已确认:只改 4 个干净文件)

| 文件 | 类型 | 状态 |
|------|------|------|
| `apps/AirRingSys/src/views/settings/rack/side.vue` | 渲染层 / ECharts | 干净 |
| `apps/AirRingSys/src/views/control/controller.vue` | 渲染层 / 样式 | 干净 |
| `apps/AirRingSys/src/style.css` | 渲染层 / 全局样式 | 干净 |
| `apps/AirRingSys/electron/main.ts` | 主进程入口 | 干净(高风险,改动前再次确认) |

## 跳过(in-progress 改动)

- `apps/AirRingSys/src/views/settings/rack/LongitudinalCharts.vue`(60 行 dirty)
- `apps/AirRingSys/src/layout/index.vue`(166 行 dirty)

## 改动清单

### Fix 1 — `side.vue` RAF 合并(主因)

**问题**: 监听 `adbox-data` (20Hz),每次都 `updateCharts` → ECharts 整 series `setOption` + Canvas repaint,拖动时与合成器争 GPU。

**改动**: 用 `requestAnimationFrame` 把同一帧内的多次 IPC 事件合并为单次 ECharts 调用,50ms 内的事件被 RAF 合并。

**diff 概要**:
```diff
- const handleRealtimeThickness = (_, payload) => {
-   ...
-   updateCharts({ series: [...] })
- }
+ let pendingRaf: number | null = null
+ let pendingPreview: [number, number][] | null = null
+ let pendingDataList: [number, number][] | null = null
+
+ const flushChart = () => {
+   pendingRaf = null
+   updateCharts({
+     series: [
+       { data: pendingPreview ?? [] },
+       { data: pendingDataList ?? dataList },
+     ]
+   })
+   pendingPreview = null
+   pendingDataList = null
+ }
+
+ const handleRealtimeThickness = (_, payload) => {
+   ...
+   if (fullData) { dataList = ...; pendingDataList = dataList }
+   pendingPreview = preview
+   if (pendingRaf === null) pendingRaf = requestAnimationFrame(flushChart)
+ }
```

### Fix 2 — `controller.vue` inline filter → 静态 class

**问题**: `:style="{ filter: ... ? 'drop-shadow(...)' : '' }"` 让 el-icon 在 IsAuto 变化时通过 inline style 重算,filter 强制脱离 GPU 合成层。

**改动**: 改为 `:class="{ 'auto-icon-on': IsAuto }"`,在 `<style>` 块定义 `.auto-icon-on` 的 drop-shadow。

**diff 概要**:
```diff
- :style="{ color: store.apiAirRingData.IsAuto ? '#34e53a' : '', filter: store.apiAirRingData.IsAuto ? 'drop-shadow(0 0 5px rgba(30, 217, 39, 0.617)' : '' }">
+ :class="['auto-icon', { 'auto-icon-on': store.apiAirRingData.IsAuto }]"
```
+ `<style>` 内追加 `.auto-icon-on { color: #34e53a; filter: drop-shadow(0 0 5px rgba(30, 217, 39, 0.617)); }`

### Fix 3 — `style.css` 移除 body transition

**问题**: `transition: color 0.5s, background-color 0.5s` 持续让 body 处于待合成状态,拖动时每帧多一层合成开销。

**改动**: 删除该 transition。

**diff 概要**:
```diff
  body {
    width: 100%;
    min-height: 100vh;
-   transition: color 0.5s, background-color 0.5s;
    font-size: 15px;
    ...
  }
```

### Fix 4 — `main.ts` Chromium QoS 开关(待用户对实际内容二次确认)

**计划**:
- 在 `app.on('ready', ...)` 之前,加 `app.commandLine.appendSwitch('disable-renderer-backgrounding', false)` 等
- 注意:必须先在 `app.ready` 之前调用 `appendSwitch`
- 备选:`--enable-gpu-rasterization`、`--enable-zero-copy`

## 验收标准

1. `pnpm typecheck` 无错误
2. `pnpm lint` 无错误
3. 视觉等价:
   - side.vue 图表仍实时更新(只是 RAF 合并)
   - controller.vue 自动模式开启时仍有绿色阴影
4. 不修改 `LongitudinalCharts.vue` / `layout/index.vue`
5. 不引入新依赖
6. 不自动跑 `pnpm test`

## 风险

- `main.ts` 是高敏感入口(safety.md 列出),任何开关错配可能让 GPU 渲染退化。Fix 4 在改前必须再次确认具体 diff。
