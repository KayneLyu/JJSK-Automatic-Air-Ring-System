# Decisions

## 2026-06-21 22:46

### D1: 范围缩窄为 4 个干净文件
**触发**: 用户选择"只改 4 个干净文件 (Recommended)",放弃 LongitudinalCharts / layout 两条修复。
**影响**: 仍能解决主因(ECharts 高频重绘 + 合成成本),但 layout 中 `processThicknessData` 满圈计算仍占主线程,LongitudinalCharts 的 deep watch 仍触发整树重渲。如卡顿未完全消除,后续可在 in-progress 工作合入后再补两条。
**回退**: 改完 4 条后用户复测,如仍卡顿,可恢复 6 条全量方案。

## 2026-06-21 22:55

### D2: Fix 4 采用 GPU 加速开关
**触发**: 用户选择"加 GPU 加速 QoS 开关 (Recommended)"。
**影响**: `enable-gpu-rasterization` 已在 Electron 36 默认开启,这里显式重申以防御未来版本默认变更;`disable-frame-rate-limit` 默认仅在某些场景下生效,显式开启可让 drag 时合成器不被 60Hz 上限节流。
**风险**: 若用户在 Wayland/无 GPU 环境下运行,可能回退到软件渲染——但本项目运行在 Windows + 桌面环境,GPU 可用。
