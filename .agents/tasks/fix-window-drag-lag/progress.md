# Progress — 修复窗口拖动卡顿

## 2026-06-21 22:46
- 创建 task 目录与 plan.md

## 2026-06-21 22:50
- Fix 1 `side.vue`: RAF 合并 IPC 事件已落地
- Fix 2 `controller.vue`: 移除 inline `:style.filter`,改用 `:class` + scoped CSS `.auto-icon-on`
- Fix 3 `style.css`: 移除 `body` 的 `transition: color/background-color`
- typecheck: 我的 3 个改动 0 报错
- eslint: 0 errors(配置局限未覆盖 .vue/.css,pre-existing)
- 待确认: Fix 4 (`main.ts` Chromium QoS 开关)

## 2026-06-21 22:55 — 全部完成
- Fix 4 `main.ts`: 加 `enable-gpu-rasterization` + `disable-frame-rate-limit` 开关
- typecheck: Fix 4 无新增报错
- 总计 4 个文件,均为干净文件,in-progress 工作未受影响
- 任务完成,等待用户回归测试
