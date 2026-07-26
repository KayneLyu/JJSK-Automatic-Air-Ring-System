import type { PushData, RunResult } from '@jjsk/adbox-sdk'
type IPlcValue = number | string | boolean
type IMessage = { address: string; value: IPlcValue }

export type IPlcControlResult = {
  FWD: boolean // "DB4,X0.0",
  REV: boolean // "DB4,X0.1",
  STOP: boolean //"DB4,X0.2",
  HOME: boolean // "DB4,X0.3",
  MEASURE: boolean // "DB4,X0.4",
}

export type IPlcParamData = {
  // 硬件
  frameLength: string // 机架长度
  rollerCircumference: string // 测速棍周长
  encoderRatio: string // 编码器1比例
  motorPulse: string // 电机脉冲
  codePulse: string // 编码脉冲
  zeroOffset: string // 零位偏移
  // adDelay: 'DB4,X0.6'
  // 速度
  scanSpeed: string // 扫描速度
  sampleSpeed: string // 采样速度
  debugSpeed: string // 调试速度
  startSpeed: string // 开始速度
  resetSpeed1: string // 归零速度1
  resetSpeed2: string // 归零速度2
  accelTime: string // 加速时间
  decelTime: string // 减速时间
  // 采样
  sampleInterval: string // 采样间隔
  samplePosition: string // 采样位置
  sampleRadius: string // 采样半径
}

export type IPlcParamResult = Record<keyof IPlcParamData, number | boolean>

export type IPlcWriteMessage = IMessage

export type IPlcWriteResult = {
  success: boolean
  address: string
  value: IPlcValue
  error?: string
}

export type IPollingBatchData = {
  timestamps: number[]
  adValues: number[]
  pulses: number[]
}

export type ICalibrationResult = {
  tractionSpeed?: number
  distance?: number
  maxAngle?: number
  membraneWidth?: number
  mutationWindowSize?: number
}

export type IUpperRotationDebugData = {
  timestamp?: number
  ForwardRotation?: boolean
  ReverseRotation?: boolean
  ForwardDirectionChange?: boolean
  ReverseDirectionChange?: boolean
  Reset?: boolean
  MotorFrequency?: number
  Heats?: number[]
}

export type ICalibrationControlData = {
  manualTractionSpeed: number
}

export type ICalibrationControlResult = {
  success: boolean
  manualTractionSpeed?: number
  disturbanceTs: number
  error?: string
}

export type IManualCalibrationParams = {
  tractionSpeed?: number
  distance?: number
  maxAngle?: number
  mutationWindowSize?: number
}

export type IDeviceConstants = {
  rollerMode: string
  rollerValue: string
  rollerNumCycles: string
  airAD: string
  materialGain: string
  upperDeltaMin: string
  upperDeltaMax: string
  upperObjectiveMode: string
  airDuctCount: string
  systemAirDuct1Angle: string
  /** B(φ) 剖面的角度偏移校准值（°），用于对齐重建 bin[0] 与实测膜泡 0° 参考点 */
  angleOffsetDeg: string
}

export type ICalibrationResults = {
  rollerTractionSpeed?: number
  frameLengthMM?: number
  frameLengthPulse?: number
  mmPerPulse?: number
  membraneWidthMm?: number
  mutationWindowSize?: number
  upperMaxAngle?: number
  upperDistance?: number
  scannerToleranceMs?: number
}

export type ICalibrationBridgeState = {
  manualTractionSpeed?: number
  disturbanceTs: number
  result: ICalibrationResult | null
}

// 定义所有 IPC 通道、参数、返回值类型
export interface IpcChannelMap {
  // 格式：[通道名]: [发送参数类型, 回调/接收参数类型]
  'win-minimize': { args: []; output: void } // 最小化
  'win-maximize': { args: []; output: void } // 最大化
  'win-close': { args: []; output: void } // 退出程序
  'win-toggle-fullscreen': { args: []; output: void } // 全屏
  'win-get-logo': { args: []; output: string | undefined } // 获取logo
  'win-open-client': { args: []; output: boolean | undefined } //打开客户端
  // 'change-State': { args: [message: IMessage]; output: void } // 改变测厚仪状态
  'adbox-start-scan': { args: []; output: [] } // 开始扫描
  'adbox-forward': { args: [message?: number]; output: void } // AD box前进
  'adbox-backward': { args: [message?: number]; output: void } // AD box 后退
  'adbox-stop': { args: []; output: void } // AD box 停止
  'adbox-home': { args: []; output: void } // AD box 归零
  'adbox-data': { args: [data: PushData]; output: [data: PushData] } // AD box 数据推送
  'adbox-connect': { args: []; output: [data: boolean] } // AD box 连接
  'adbox-run-result': { args: [data: RunResult]; output: [data: RunResult] } // AD box 运动结果
  'adbox-move-to': { args: [position: number]; output: [data: RunResult] } // AD box 移动到xx脉冲
  'adbox-status': {
    args: []
    output: [{ connected: boolean }]
  } // AD box 连接状态推送
  'adbox-get-connection-status': {
    args: []
    output: boolean
  } // AD box 连接状态
  'config-set-max-pulse': {
    args: [position: number]
    output: [data: RunResult]
  } // AD box 设置最大脉冲值

  'plc-controlData': {
    args: [data: IPlcControlResult]
    output: [data: IPlcControlResult]
  } // 轮询运行状态
  'plc-paramData': { args: [data: IPlcParamData]; output: IPlcParamResult } // 获取S7控制参数
  'plc-writeValue': {
    args: [message: IPlcWriteMessage]
    output: IPlcWriteResult
  } // 写入PLC值
  'calibration-result': {
    args: [data: ICalibrationResult]
    output: [data: ICalibrationResult]
  } // 标定结果推送
  'upperRotation-read': {
    args: [data: IUpperRotationDebugData]
    output: [data: IUpperRotationDebugData]
  } // 上旋调试数据推送
  'calibration-set-manual-traction-speed': {
    args: [data: ICalibrationControlData]
    output: ICalibrationControlResult
  } // 设置手动牵引速度并重置标定会话
  'calibration-get-state': {
    args: []
    output: ICalibrationBridgeState
  } // 获取当前标定桥状态
  'calibration-reset': {
    args: []
    output: ICalibrationControlResult
  } // 沿用当前速度重新开始本次标定
  'calibration-historical-progress': {
    args: [data: IHistoricalCalibrationProgress]
    output: [data: IHistoricalCalibrationProgress]
  } // 历史数据标定进度推送
  'calibration-feed-historical': {
    args: [input: {
      startMs: number
      endMs: number
      manualTractionSpeed?: number
      disturbanceTs?: number
    }]
    output: ICalibrationControlResult & { result?: ICalibrationResult }
  } // 从数据库历史数据标定
  'calibration-get-manual-params': {
    args: []
    output: IManualCalibrationParams
  } // 获取手动标定参数
  'calibration-set-manual-params': {
    args: [params: IManualCalibrationParams]
    output: { success: boolean }
  } // 保存手动标定参数
  // 设备常量持久化
  'config-get-device-constants': {
    args: []
    output: IDeviceConstants
  }
  'config-set-device-constants': {
    args: [params: IDeviceConstants]
    output: { success: boolean }
  }
  // 标定结果持久化
  'config-get-calibration-results': {
    args: []
    output: ICalibrationResults
  }
  'config-set-calibration-results': {
    args: [params: ICalibrationResults]
    output: { success: boolean }
  }
  // 单参数独立标定（历史数据）
  'calibration-run-traction-speed': {
    args: [input: {
      startMs: number
      endMs: number
      circumference: number
      numCycles?: number
    }]
    output: { success: boolean; tractionSpeed?: number; error?: string }
  }
  'calibration-auto-traction-speed': {
    args: [input: {
      circumference: number
      numCycles?: number
    }]
    output: { success: boolean; tractionSpeed?: number; source?: string; error?: string }
  }
  'calibration-run-mutation-window': {
    args: [input: {
      startMs: number
      endMs: number
      channelCount: number
      alpha?: number
    }]
    output: { success: boolean; mutationWindowSize?: number; error?: string }
  }
  'calibration-run-max-angle': {
    args: [input: {
      startMs: number
      endMs: number
      deltaMin?: number
      deltaMax?: number
      objectiveMode?: string
    }]
    output: { success: boolean; maxAngle?: number; error?: string }
  }
  'calibration-max-angle-historical': {
    args: [input: {
      deltaMin?: number
      deltaMax?: number
      objectiveMode?: string
    }]
    output: { success: boolean; maxAngle?: number; error?: string }
  }
  'calibration-run-distance': {
    args: [input: {
      startMs: number
      endMs: number
      tractionSpeed: number
      disturbanceTs: number
      windowSize: number
      deviation?: number
    }]
    output: { success: boolean; distance?: number; error?: string }
  }
  // 膜宽标定：测厚仪最近 10 趟扫描，每趟做 AD 寻边（双峰阈值 + 首末在膜 pulse 位置）取中位数
  'calibration-run-membrane-width': {
    args: [input: {
      mmPerPulse: number
    }]
    output: {
      success: boolean
      membraneWidthMm?: number
      sampleCount?: number
      sweepCount?: number
      edgeSweepCount?: number
      error?: string
    }
  }
  'ModBus-read': {
    args: [data: IPollingBatchData]
    output: [data: IPollingBatchData]
  } // 获取modbus轮询数据

  // ═══ SQLite 历史数据查询 (数据管道) ═══
  'db-get-thickness-raw': {
    args: [startMs: number, endMs: number]
    output: ThicknessRawRow[]
  }
  'db-get-latest-thickness-raw': {
    args: [count: number]
    output: ThicknessRawRow[]
  }
  'db-get-sweep-summaries': {
    args: [count: number, beforeTs?: number]
    output: SweepSummaryRow[]
  }
  'db-get-latest-rotation-trips': {
    args: [count: number, beforeTs?: number]
    output: RotationTripSummaryRow[]
  }
  'db-get-latest-rotation-trips-fallback': {
    args: [count: number, beforeTs?: number]
    output: RotationTripSummaryRow[]
  }
  'db-get-sweep-points-by-range': {
    args: [startTs: number, endTs: number]
    output: SweepPoint[]
  }
  'db-get-frames': {
    args: [startMs: number, endMs: number, count?: number]
    output: FrameRow[]
  }
  'db-get-pipeline-stats': {
    args: []
    output: {
      thicknessInRing: number
      rotationInRing: number
      thicknessTimeRange: { oldest: number | null; newest: number | null }
    }
  }
  'db-import-sweep': {
    args: [sweep: { pulses: number[]; adValues: number[]; source: string }]
    output: number
  }

  // ═══ 纵向单层膜厚重建（reconstructBubbleThickness） ═══
  'bubble-reconstruct': {
    args: [
      params: {
        membraneWidthMm: number
        thetaMaxDeg: number
        mmPerPulse: number
        airAD: number
        gain: number
        numBins?: number
        processDeformationFactor?: number
        transportDelayMs?: number
        startMs?: number
        endMs?: number
        useLatestWindowMs?: number
      }
    ]
    output: BubbleReconstructionResult | null
  }

  'bubble-reconstruct-window': {
    args: [
      input: {
        measurements: MeasurementTripleInput[]
        membraneWidthMm: number
        numBins?: number
        processDeformationFactor?: number
        preferAfterTs?: number
      }
    ]
    output: BubbleWindowReconstructionResult | null
  }

  // ═══ 膜泡厚度：按趟重建（每趟扫描 = 一幅 profile）═══
  'bubble-get-sweeps': {
    args: [
      params: {
        membraneWidthMm: number
        thetaMaxDeg: number
        mmPerPulse: number
        airAD: number
        gain: number
        numBins?: number
        processDeformationFactor?: number
        transportDelayMs?: number
        startMs?: number
        endMs?: number
        useLatestWindowMs?: number
        limit?: number
      }
    ]
    output: BubbleSweepResult[]
  }

  // ═══ 膜泡厚度：最近 N 趟（分页模式）═══
  'bubble-get-latest-sweeps': {
    args: [
      params: {
        count: number
        beforeTs?: number
        membraneWidthMm: number
        thetaMaxDeg: number
        mmPerPulse: number
        airAD: number
        gain: number
        numBins?: number
        processDeformationFactor?: number
        transportDelayMs?: number
      }
    ]
    output: BubbleSweepResult[]
  }

  'bubble-get-current-sweep': {
    args: [
      params: {
        membraneWidthMm: number
        thetaMaxDeg: number
        mmPerPulse: number
        airAD: number
        gain: number
        numBins?: number
        processDeformationFactor?: number
        transportDelayMs?: number
      }
    ]
    output: BubbleSweepResult | null
  }
}

// IPC 通道名
export type IpcChannelName = keyof IpcChannelMap

// 对应通道的参数类型
export type IpcChannelArgs<T extends IpcChannelName> = IpcChannelMap[T]['args']
// 对应通道的返回值类型
export type IpcChannelOutput<T extends IpcChannelName> =
  IpcChannelMap[T]['output']

// ═══ SQLite 数据管道类型 (v3) ═══

export interface ThicknessRawRow {
  id: number
  timestamp: number
  pulse: number
  ad: number
  source: string
  /** 辊编码器计数，每转+1 */
  pos1: number
}

export interface SweepPoint {
  pos: number
  ad: number
  ts: number
}

export interface SweepSummaryRow {
  sweepId: string
  direction: 'forward' | 'backward'
  startTs: number
  endTs: number
  pointCount: number
  membranePulseMin?: number | null
  membranePulseMax?: number | null
}

export interface FrameRow {
  frameId: number
  startTime: string
  endTime: string
  startTimestamp: number
  endTimestamp: number
  speed: number
  width: number
  rotateSpeed: number
  sigmaVal: number
  sigmaPercent: number
  mean: number
  minVal: number
  minPercent: number
  maxVal: number
  maxPercent: number
  IsBackw: number
  datalist: string
  rawDatalist: string
  source: string
}

export interface IHistoricalCalibrationProgress {
  processed: number
  total: number
}

// ═══ 膜泡单层厚度重建结果（reconstructBubbleThickness 输出） ═══
// 正模型：T_k = η × (B(φ₁_k) + B(φ₂_k))
// profile[] 为求解出的单层膜厚分布 B(φ)，单位 μm
export interface BubbleReconstructionResult {
  /** 单层膜厚剖面 B[0..N-1] (μm) */
  profile: number[]
  /** 求解器直接输出（仅做非负截断） */
  rawProfile?: number[]
  numBins: number
  binWidthDeg: number
  rmsError: number
  maxError: number
  /** rawProfile 对应的均方根误差 (μm) */
  rawRmsError?: number
  numMeasurements: number
  binCoverage: number[]
  /** 正模型使用的工艺变形因子 η */
  processDeformationFactor?: number
  binTimestamps?: number[]
  rawThickness?: number[]
  predictedThickness?: number[]
}

// ═══ 一趟扫描（forward 或 reverse）的单层膜厚重建结果 ═══
export interface BubbleSweepResult extends BubbleReconstructionResult {
  id: string // 唯一 id：`sweep-{timestamp}-{direction}`
  time: number // 这一趟的起点时间戳 (ms)
  direction: 'forward' | 'reverse'
  cycleDurationMs: number // 这一趟的实测时长
  inProgress?: boolean
}

export interface MeasurementTripleInput {
  upperAngleDeg: number
  scannerPosMm: number
  thickness: number
  timestamp: number
}

/** 单条测量的双层→单层分解：b1/b2 为从 B(φ) 插值得出的前/后层单层膜厚 */
export interface BinDecompositionRow {
  ts: number
  /** 前层膜泡角度 */
  phi1: number
  /** 后层膜泡角度 */
  phi2: number
  /** 前层单层膜厚 (μm)，从 B(φ₁) 插值 */
  b1: number
  /** 后层单层膜厚 (μm)，从 B(φ₂) 插值 */
  b2: number
  /** 测厚仪实测双层总厚度 T_k (μm) */
  tMeasured: number
  /** 模型预测双层总厚度 η×(b1+b2) (μm) */
  tPredicted: number
}

/** 与 BinDecompositionRow 相同结构，per-sample 级别 */
export interface SampleDecompositionRow {
  ts: number
  phi1: number
  phi2: number
  b1: number
  b2: number
  tMeasured: number
  tPredicted: number
}

/** 滑动窗口重建结果：在单层剖面基础上附加逐点双层分解 */
export interface BubbleWindowReconstructionResult extends BubbleReconstructionResult {
  binDecompositions?: BinDecompositionRow[]
  sampleDecompositions?: SampleDecompositionRow[]
}

export interface RotationTripSummaryRow {
  id: string
  time: number
  direction: 'forward' | 'reverse'
  cycleDurationMs: number
}
