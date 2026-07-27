# Plan: generalize-upper-rotation-angle 线性端部补偿

1. 新增独立端部补偿纯函数，不复用带历史默认时间的旧时间映射。
2. 按线性加速、匀速、线性减速拆分角度并计算最大角度候选。
3. 对速度、行程时长、端部时长、匀速区存在性和显式角度范围执行边界校验。
4. 增加公式分解性质、零端部、非法配置和角度越界测试。
5. 运行新增测试与 AirRingServer typecheck，追加 task plan、progress 和 decisions。

