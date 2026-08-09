import type { IPollingBatchData } from '@/types/ipc'
import type { PushData } from '@jjsk/adbox-sdk'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createCalibrationSession,
  type CalibrateResult,
  type PendingAngleEstimate,
  type RingData,
  type ThicknessData,
  type CalibrationConfig,
  type Scalar,
} from '@jjsk/air-ring-server/electron'
import type { CalibrationWorkerRequest } from './calibrationWorker'
import { createCalibrationWorkerClient } from './calibrationWorkerClient'

const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  roller: {
    numCycles: 10,
    maxIntervalMs: 10_000,
  },
  upperRotation: {},
}

const DEFAULT_STANDARDIZED: Scalar = {
  CHANNEL_COUNT: 48,
  THICKNESS_UNIT_PULSE_DIS: 0.1,
  ROLLER: {
    DIAMETER: 100,
  },
}

export interface ICalibrationBridge {
  feedModbusData(data: IPollingBatchData): CalibrateResult | null
  feedThicknessSample(sample: FeedThicknessSampleInput): CalibrateResult | null
  feedUpperRotationData(data: RingData): CalibrateResult | null
  feedAdboxPushData(push: PushData): CalibrateResult | null
  setManualTractionSpeed(speed: number, disturbanceTs?: number): void
  reset(disturbanceTs?: number): void
  getManualTractionSpeed(): number | undefined
  getDisturbanceTs(): number | undefined
  getResult(): CalibrateResult | null
}

export type CreateCalibrationBridgeOptions = {
  config?: CalibrationConfig
  standardized?: Scalar
  disturbanceTs?: number
  manualTractionSpeed?: number
  onResult?: (result: CalibrateResult) => void
}

type FeedThicknessSampleInput = Pick<
  ThicknessData,
  'timestamp' | 'ProbeValue' | 'HorizontalPulse'
> & { pos1?: number }

const moduleDirname = dirname(fileURLToPath(import.meta.url))

/**
 * 解析 Worker 脚本路径。
 * 主进程以 ESM 运行时仍需稳定定位到与当前模块同目录的 worker 输出。
 */
const resolveWorkerPath = () =>
  pathToFileURL(join(moduleDirname, 'calibrationWorker.js'))

/**
 * 进程内复用单个 Calibration Worker。
 * 正常请求完成后保持 Worker 存活；只有异常、超时或显式 shutdown 才回收。
 */
const angleWorkerClient = createCalibrationWorkerClient({
  workerPath: resolveWorkerPath(),
  onInternalError: (error) => {
    console.error('[CalibrationBridge] Worker 生命周期错误:', error)
  },
})

/**
 * 在独立 Worker 线程中执行上旋角度估算。
 * - 互斥：若上一次估算尚未完成，本次直接跳过（当前 segments 的下一次换向时会重算）。
 * - 非阻塞：立即返回，结果通过 onAngle 回调传回。
 */
const runAngleEstimateInWorker = (
  req: Omit<CalibrationWorkerRequest, 'id'>,
  onAngle: (maxAngle: number) => void
) => {
  const started = angleWorkerClient.tryRun(
    req,
    (response) => {
      onAngle(response.maxAngle)
    },
    (error) => {
      console.warn('[CalibrationBridge] Worker 角度估算失败:', error.message)
    }
  )
  if (!started) {
    console.debug('[CalibrationBridge] Worker 正在运行，本次角度估算已跳过')
  }
}

/**
 * Promise 版角度估算 Worker（用于历史数据标定等需要等待结果的场景）。
 *
 * 与 runAngleEstimateInWorker 共用同一个持久 Worker；请求按 FIFO 串行执行。
 *
 * @returns 估算的最大角度；失败时拒绝并保留具体原因
 */
export const runCalibrationAngleEstimate = (
  req: Omit<CalibrationWorkerRequest, 'id'>
): Promise<number> =>
  angleWorkerClient.run(req).then((response) => {
    if (response.rustPrimary) {
      console.info(
        `[CalibrationBridge][RustPrimary] ${JSON.stringify(response.rustPrimary)}`
      )
    }
    return response.maxAngle
  })

/**
 * 短生命周期父 Worker（例如历史标定）完成后调用，等待子 Worker 优雅退出。
 */
export const shutdownCalibrationAngleWorker = (): Promise<void> =>
  angleWorkerClient.shutdown()

export const createCalibrationBridge = (
  options: CreateCalibrationBridgeOptions = {}
) => {
  const session = createCalibrationSession({
    config: options.config ?? DEFAULT_CALIBRATION_CONFIG,
    standardized: options.standardized ?? DEFAULT_STANDARDIZED,
    manualTractionSpeed: options.manualTractionSpeed,
    onResult: options.onResult,
  })

  let previousPulse: number | undefined
  let previousPos1: number | undefined
  let previousMotionDirection = true
  let latestThicknessTimestamp: number | undefined

  const normalizeThicknessTimestamp = (
    relativeTimestampMs: number,
    nowMs: number
  ) => {
    const now = new Date(nowMs)
    const dayStartMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )

    let candidate = dayStartMs + relativeTimestampMs

    // 以最近一次测厚时间戳为参考，避免跨午夜时产生 24h 跳变。
    if (latestThicknessTimestamp !== undefined) {
      const dayMs = 24 * 60 * 60 * 1000
      const prev = latestThicknessTimestamp
      const delta = candidate - prev

      if (delta > dayMs / 2) {
        candidate -= dayMs
      } else if (delta < -dayMs / 2) {
        candidate += dayMs
      }
    }

    return candidate
  }

  const buildThicknessSample = (
    data: IPollingBatchData,
    index: number,
    nowMs: number
  ): ThicknessData | null => {
    const probeValue = data.adValues[index]
    const pulse = data.pulses[index]
    const rawTimestamp = data.timestamps[index]

    if (
      !Number.isFinite(probeValue) ||
      !Number.isFinite(pulse) ||
      !Number.isFinite(rawTimestamp)
    ) {
      return null
    }

    const timestamp = normalizeThicknessTimestamp(rawTimestamp, nowMs)

    const motionDirection =
      previousPulse === undefined
        ? previousMotionDirection
        : pulse >= previousPulse

    previousPulse = pulse
    previousMotionDirection = motionDirection
    latestThicknessTimestamp = timestamp

    return {
      timestamp,
      ProbeValue: probeValue,
      HorizontalPulse: pulse,
      MotionDirection: motionDirection,
    }
  }

  const normalizeThicknessSample = (
    sample: FeedThicknessSampleInput
  ): ThicknessData | null => {
    const probeValue = sample.ProbeValue
    const pulse = sample.HorizontalPulse
    const pos1 = sample.pos1
    const timestamp = sample.timestamp ?? Date.now()

    if (pulse === undefined) {
      return null
    }

    if (
      !Number.isFinite(probeValue) ||
      !Number.isFinite(pulse) ||
      !Number.isFinite(timestamp)
    ) {
      return null
    }

    const motionDirection =
      previousPulse === undefined
        ? previousMotionDirection
        : pulse >= previousPulse

    previousPulse = pulse
    previousMotionDirection = motionDirection
    latestThicknessTimestamp = timestamp

    // 辊编码器计数变化 → RollSpeedSignal 上升沿
    const rollSpeedSignal =
      pos1 !== undefined && previousPos1 !== undefined && pos1 !== previousPos1
    if (pos1 !== undefined) {
      previousPos1 = pos1
    }

    return {
      timestamp,
      ProbeValue: probeValue,
      HorizontalPulse: pulse,
      MotionDirection: motionDirection,
      RollSpeedSignal: rollSpeedSignal || undefined,
    }
  }

  /** 处理 pendingAngleEstimate：启动 Worker，完成后将 maxAngle 合并回 session */
  const handlePendingAngleEstimate = (pending: PendingAngleEstimate) => {
    runAngleEstimateInWorker(
      { tripSegments: pending.tripSegments, options: pending.options },
      (maxAngle) => {
        session.applyAngleEstimate(maxAngle)
      }
    )
  }

  const feedThicknessSample = (sample: FeedThicknessSampleInput) => {
    const thicknessSample = normalizeThicknessSample(sample)

    if (!thicknessSample) {
      return session.getResult()
    }

    const { calibrateResult, pendingAngleEstimate } =
      session.feedThickness(thicknessSample)
    if (pendingAngleEstimate) {
      handlePendingAngleEstimate(pendingAngleEstimate)
    }

    return calibrateResult
  }

  const feedModbusData = (data: IPollingBatchData) => {
    const nowMs = Date.now()
    const sampleCount = Math.min(
      data.adValues.length,
      data.pulses.length,
      data.timestamps.length
    )

    for (let index = 0; index < sampleCount; index += 1) {
      const thicknessSample = buildThicknessSample(data, index, nowMs)
      if (!thicknessSample) {
        continue
      }

      const { calibrateResult, pendingAngleEstimate } =
        session.feedThickness(thicknessSample)
      if (pendingAngleEstimate) {
        handlePendingAngleEstimate(pendingAngleEstimate)
        return calibrateResult
      }
      if (calibrateResult) {
        return calibrateResult
      }
    }

    return session.getResult()
  }

  const feedUpperRotationData = (data: RingData) => {
    const timestamp = data.timestamp ?? latestThicknessTimestamp ?? Date.now()

    const { calibrateResult, pendingAngleEstimate } = session.feedAirRing({
      ...data,
      timestamp,
    })
    if (pendingAngleEstimate) {
      handlePendingAngleEstimate(pendingAngleEstimate)
    }
    return calibrateResult
  }

  const feedAdboxPushData = (push: PushData) => {
    const probeValue = push.ad0
    const pulse = push.pos0 ?? 0
    const nowMs = Date.now()

    if (!Number.isFinite(probeValue)) {
      return session.getResult()
    }

    // sysTick 是 7-bit 硬件帧计数器 (0-127)，不可作为时间戳
    // 使用 Date.now() 转为毫秒级午夜偏移，与 ModBus 时间戳格式一致
    const now = new Date(nowMs)
    const rawTimestamp =
      nowMs -
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
      )

    const timestamp = normalizeThicknessTimestamp(rawTimestamp, nowMs)

    const motionDirection =
      previousPulse === undefined
        ? previousMotionDirection
        : pulse >= previousPulse

    previousPulse = pulse
    previousMotionDirection = motionDirection
    latestThicknessTimestamp = timestamp

    // 辊编码器计数变化 → RollSpeedSignal 上升沿
    const pos1 = push.pos1
    const rollSpeedSignal =
      pos1 !== undefined && previousPos1 !== undefined && pos1 !== previousPos1
    if (pos1 !== undefined) {
      previousPos1 = pos1
    }

    const thicknessSample: ThicknessData = {
      timestamp,
      ProbeValue: probeValue,
      HorizontalPulse: pulse,
      MotionDirection: motionDirection,
      RollSpeedSignal: rollSpeedSignal || undefined,
    }

    const { calibrateResult, pendingAngleEstimate } =
      session.feedThickness(thicknessSample)
    if (pendingAngleEstimate) {
      handlePendingAngleEstimate(pendingAngleEstimate)
    }

    return calibrateResult
  }

  const reset = (disturbanceTs: number = Date.now()) => {
    previousPulse = undefined
    previousPos1 = undefined
    previousMotionDirection = true
    latestThicknessTimestamp = undefined
    session.reset(disturbanceTs)
  }

  const setManualTractionSpeed = (
    manualTractionSpeed: number,
    disturbanceTs: number = Date.now()
  ) => {
    previousPulse = undefined
    previousPos1 = undefined
    previousMotionDirection = true
    latestThicknessTimestamp = undefined
    session.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
  }

  return {
    feedModbusData,
    feedThicknessSample,
    feedUpperRotationData,
    feedAdboxPushData,
    setManualTractionSpeed,
    reset,
    getManualTractionSpeed: session.getManualTractionSpeed,
    getDisturbanceTs: session.getDisturbanceTs,
    getResult: session.getResult,
  }
}
