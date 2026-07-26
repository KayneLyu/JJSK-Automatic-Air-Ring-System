# Plan: bubble polar chart performance

> **2026-07-26 更新**：极坐标图已整体替换为上下双层笛卡尔折线图（`useBubblePolarChart.ts`），原来的性能优化思路（缓存引用稳定性）在新架构中不再适用。详见 `tasks/bubble-thickness-reconstruction/progress.md#2026-07-26`。

1. Inspect BubbleRawThickness and useBubblePolarChart update path to identify unnecessary recomputation when the raw thickness tab is open.
2. Apply the smallest change that stabilizes chart input identity across refreshes when the selected baseline and reconstruction payload are unchanged.
3. Run a focused TypeScript validation for the touched file(s) and confirm no new errors were introduced.
