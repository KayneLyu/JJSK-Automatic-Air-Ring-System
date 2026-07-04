/**
 * 测厚仪运动控制策略
 *
 * 集成出膜检测器与状态机，连接 S7 控制层。
 * 每个 ThicknessData 采样点调用一次 next()，返回控制建议和状态。
 */
import type { ThicknessData } from '../connections/thickness'
import { outOfBoundsDetector, type OutOfBoundsDetectorOptions } from '../algorithms/outOfBoundsDetector'
import {
  scannerStateMachine,
  type ScannerState,
  type ControlAction,
  type BoundaryPulseMap,
  type ScannerStateMachineOptions,
} from '../algorithms/scannerStateMachine'

export interface ScannerMotionControlOptions {
  /** 空气 AD 值 */
  airAD: number
  /** 出膜检测器选项 */
  detector?: Partial<OutOfBoundsDetectorOptions>
  /** 状态机选项 */
  stateMachine?: ScannerStateMachineOptions
}

export interface ScannerMotionControlOutput {
  /** 当前状态 */
  state: ScannerState
  /** 推荐控制动作 */
  action: ControlAction
  /** 状态转换日志（发生转换时非 null） */
  log: string | null
  /** 左右出界脉冲记录 */
  boundaryPulses: BoundaryPulseMap
  /** 当前点厚度（μm） */
  thickness: number
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 出膜检测器内部状态（调试用） */
  detectorDebug?: {
    outCount: number
    inCount: number
    boundaryRecorded: boolean
  }
  /** 状态机内部计时器状态（调试用） */
  machineDebug?: {
    toleranceStartTime: number | null
    decelStartTime: number | null
    decelStableSince: number | null
    turnStartTime: number | null
  }
}

export const scannerMotionControl = (options: ScannerMotionControlOptions) => {
  const { airAD } = options
  const detector = outOfBoundsDetector({
    airAD,
    confirmCount: 3,
    ...options.detector,
  })
  const stateMachine = scannerStateMachine({
    toleranceMs: 200,
    stopConfirmMs: 200,
    decelTimeoutMs: 5000,
    turnTimeoutMs: 3000,
    ...options.stateMachine,
  })

  let lastLog: string | null = null

  const next = (data: ThicknessData): ScannerMotionControlOutput => {
    const now = data.timestamp ?? Date.now()
    const probeValue = data.ProbeValue ?? 0
    const pulse = data.HorizontalPulse ?? 0
    const direction = data.MotionDirection ?? true
    const leftLimit = Boolean(data.LeftLimit)
    const rightLimit = Boolean(data.RightLimit)

    const detection = detector.next(probeValue, pulse, direction)
    const machineOutput = stateMachine.next(detection, now, pulse, leftLimit, rightLimit)

    // 保留最新日志（状态转换时更新）
    if (machineOutput.log) {
      lastLog = machineOutput.log
    }

    return {
      state: machineOutput.state,
      action: machineOutput.action,
      log: machineOutput.log ?? lastLog,
      boundaryPulses: machineOutput.boundaryPulses,
      thickness: detection.inMembrane ? probeValue : 0, // 真实厚度需要 calcThickness，此处示意
      inMembrane: detection.inMembrane,
      detectorDebug: detector.getDebugInfo(),
      machineDebug: machineOutput.machineDebug,
    }
  }

  /** 批量处理 */
  const processBatch = (dataList: ThicknessData[]): ScannerMotionControlOutput[] => {
    return dataList.map((d) => next(d))
  }

  /** 复位 */
  const reset = () => {
    detector.reset()
    stateMachine.reset()
    lastLog = null
  }

  /** 获取当前状态 */
  const getState = () => stateMachine.getState()

  const getBoundaryPulses = () => stateMachine.getBoundaryPulses()

  return {
    next,
    processBatch,
    reset,
    resetEmergencyStop: () => stateMachine.resetEmergencyStop(),
    getState,
    getBoundaryPulses,
  }
}
