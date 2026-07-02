# Plan: 上旋趟去抖与短趟过滤

1. 在 dataPipeline 的实时上旋事件处理中加入同向事件去抖与最短趟时长门槛。
2. 在 SQLite 查询层过滤短时 rotation_trip，避免历史短趟污染重建匹配。
3. 在 fallback 方向变化拼趟逻辑同步最短时长门槛。
4. 在重建前端状态中增加 transportDelay 回退提示，提升可观测性。
5. 进行文件级错误检查。
