# Plan: bubble polar chart performance

1. Inspect BubbleRawThickness and useBubblePolarChart update path to identify unnecessary recomputation when the raw thickness tab is open.
2. Apply the smallest change that stabilizes chart input identity across refreshes when the selected baseline and reconstruction payload are unchanged.
3. Run a focused TypeScript validation for the touched file(s) and confirm no new errors were introduced.
