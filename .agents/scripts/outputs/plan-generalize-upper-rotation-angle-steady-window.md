# Plan: generalize-upper-rotation-angle 稳态观测窗口

1. 检查现有角速度观测、聚合类型和测试模式，保持生产入口不变。
2. 增加基于完整行程起止时间与显式端部排除时间的稳态观测筛选函数，输出结构化诊断与拒绝原因。
3. 增加性质测试，覆盖稳态区间保留、跨越端部剔除、非法物理时间配置拒绝。
4. 运行角速度最小测试集，并执行 AirRingServer typecheck 以区分本轮与既有错误。
5. 只追加更新任务 progress；若形成重要取舍，追加 task decisions。

