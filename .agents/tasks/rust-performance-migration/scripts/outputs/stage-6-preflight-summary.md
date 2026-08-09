# 阶段 6：受控环境观测联机前预检摘要

## 结论

技术预检通过，结果为 `technicalReadyForOperatorConfirmation=true`。当前机器具备进入现场人工确认的技术条件，但尚未授权启动完整 Electron 应用，也没有建立 ADBox/S7 连接或发送设备指令。阶段 6 真实环境观测保持待确认。

## 预检结果

- mise 工具链匹配：Node 24.18.0、pnpm 10.18.3、Rust 1.88.0。
- Native addon、Calibration Worker、Electron 主进程三个构建产物均存在，并记录 SHA-256。
- 没有活动的 AirRing/Electron 应用进程。
- 八个 Rust shadow 相关环境变量均未在当前进程设置。
- 默认绝对日志路径尚不存在，未读取或修改任何运行日志。
- JSON 数据最小化检查通过：不包含原始测点、设备地址、密钥、`measurements`、`tripSegments` 或 `samplesMs`。
- 相对日志路径负向测试通过：预检以 `observationLogPathAbsolute` 门槛拒绝。

## 设备风险

源码链路确认完整应用启动会调用 `initMotionControl`，随后初始化 ADBox，并尝试执行上旋 S7 `connect()`。因此启动应用会改变外部设备连接状态，不能由自动测试替代现场授权。

## 已建立门禁

- 新增 `checkRustShadowObservationReadiness.ps1`，只检查本地工具、产物、进程、环境和日志元数据。
- 新增 `stage-6-operator-gate.md`，要求确认现场值守、急停、生产窗口、自动控制停用、单实例、停止条件和回滚责任人。
- Rust shadow 继续默认关闭；技术预检通过不等于联机授权，Rust 生产接管继续 no-go。

## 下一步

现场人员完成门禁清单并由用户再次明确授权启动会自动连接设备的 Electron 应用后，执行小批量真实环境观测；否则保持当前安全停止点。
