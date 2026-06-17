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

export type IPollingModBusData = {
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
}

export type ICalibrationResults = {
  rollerTractionSpeed?: number
  frameLengthMM?: number
  frameLengthPulse?: number
  mutationWindowSize?: number
  upperMaxAngle?: number
  upperDistance?: number
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
  'ModBus-read': {
    args: [data: IPollingModBusData]
    output: [data: IPollingModBusData]
  } // 获取modbus轮询数据

  // ═══ SQLite 历史数据查询 (数据管道) ═══
  'db-get-frames': {
    args: [startMs: number, endMs: number, limit?: number]
    output: FrameRow[]
  }
  'db-get-latest-frame': {
    args: []
    output: FrameRow | null
  }
  'db-get-thickness-raw': {
    args: [startMs: number, endMs: number]
    output: ThicknessRawRow[]
  }
  'db-get-pipeline-stats': {
    args: []
    output: {
      thicknessInRing: number
      rotationInRing: number
      thicknessTimeRange: { oldest: number | null; newest: number | null }
    }
  }
  'db-persist-frame': {
    args: [frame: FrameBatchItem]
    output: void
  }
  'db-get-frames-by-id': {
    args: [startId: number, endId: number]
    output: FrameRow[]
  }
  'db-import-sweep': {
    args: [sweep: { pulses: number[]; adValues: number[]; airAD: number; gain: number; source: string }]
    output: number
  }
  'db-get-latest-frames': {
    args: [count: number]
    output: FrameRow[]
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
  source: string
  airAD: number
  gain: number
  /** Deprecated: no longer stored in DB, may be undefined when queried historically */
  datalist?: string
  rawDatalist?: string
}

export interface ThicknessRawRow {
  id: number
  timestamp: number
  pos: number
  ad: number
  source: string
  airAD: number
  gain: number
}

export interface IHistoricalCalibrationProgress {
  processed: number
  total: number
}

export interface FrameBatchItem {
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
  IsBackw: boolean
  source: string
  airAD: number
  gain: number
  datalist?: number[]
  rawDatalist?: number[]
}
