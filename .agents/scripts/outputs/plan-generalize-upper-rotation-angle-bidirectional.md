# Plan: generalize-upper-rotation-angle 正反向速度一致性

1. 增加正向/反向角速度聚合的一致性比较函数，不接入生产入口。
2. 使用对称平均速度计算相对差，并同时输出绝对差。
3. 要求调用方显式提供绝对差与相对差容差，严格校验聚合方向和数值。
4. 增加顺序不变性、单项/联合越界、同向输入和非法限值测试。
5. 运行 angularVelocity 测试与 AirRingServer typecheck，追加任务记录。

