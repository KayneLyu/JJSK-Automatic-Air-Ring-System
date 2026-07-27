# Plan: generalize-upper-rotation-angle 低置信度观测筛选

1. 在特征追踪证据之上增加独立置信度策略，所有门限由调用方显式提供。
2. 校验最低相关度、最低重叠率及可选的峰值突出度和 Fisher 分离度。
3. 将策略作为角速度观测的可选参数；未提供时保持现有接受行为。
4. 增加证据逐项越界、缺失 Fisher 证据、非法限值和角速度传播测试。
5. 运行 featureTracking 与 angularVelocity 最小测试集，并追加任务记录。

