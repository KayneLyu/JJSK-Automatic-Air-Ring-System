# 修复窗口拖动卡顿

## 背景
JJSK 自动风环系统拖动窗口时偶发"不跟手"。根因是 renderer 主线程被 20Hz IPC 数据流驱动的高频 ECharts 重绘 + 响应式重渲持续占用,Chromium 合成器在拖动期间无法按时提交 compositor frame。

详细根因分析见对话历史与 `.agents/memory/context.md`(待回填)。

## 涉及文件
- `apps/AirRingSys/src/views/settings/rack/side.vue` — 20Hz ECharts setOption
- `apps/AirRingSys/src/views/control/controller.vue` — inline filter 强制脱离 GPU 合成
- `apps/AirRingSys/src/style.css` — body transition 持续待合成
- `apps/AirRingSys/electron/main.ts` — Chromium QoS 开关(待确认)

## 约束
- 范围:只改干净文件;`LongitudinalCharts.vue` / `layout/index.vue` 在 dirty 列表,本轮不动
- 不引入新依赖
- 不自动跑测试
- 完成后跑 `pnpm typecheck` + `pnpm lint`

## 验收
- 视觉等价(side.vue 实时性保留,controller.vue 自动模式阴影保留)
- 拖动窗口主观测感顺滑
