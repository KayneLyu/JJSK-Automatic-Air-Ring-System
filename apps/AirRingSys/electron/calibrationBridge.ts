import type { IPollingModBusData } from '@/types/ipc'
import type { PushData } from '@jjsk/adbox-sdk'
import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCalibrationSession,
  type CalibrateResult,
  type PendingAngleEstimate,
  type RingData,
  type ThicknessData,
  type CalibrationConfig,
  type Scalar,
} from '@jjsk/air-ring-server/electron'
import type {
  CalibrationWorkerRequest,
  CalibrationWorkerResponse,
} from './calibrationWorker'

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
  feedModbusData(data: IPollingModBusData): CalibrateResult | null
  feedThicknessSample(sample: FeedThicknessSampleInput): CalibrateResult | null
  feedUpperRotationData(data: RingData): CalibrateResult | null
  feedAdboxPushData(push: PushData): CalibrateResult | null
  setManualTractionSpeed(speed: number, disturbanceTs?: number): void
  reset(disturbanceTs?: number): void
  getManualTractionSpeed(): number | undefined
  getDisturbanceTs(): number | undefined
  getResult(): CalibrateResult | null
}

export type CreateModbusCalibrationBridgeOptions = {
  config?: CalibrationConfig
  standardized?: Scalar
  disturbanceTs?: number
  manualTractionSpeed?: number
  onResult?: (result: CalibrateResult) => void
}

type FeedThicknessSampleInput = Pick<
  ThicknessData,
  'timestamp' | 'ProbeValue' | 'HorizontalPulse'
>

const moduleDirname = dirname(fileURLToPath(import.meta.url))

/**
 * 解析 Worker 脚本路径。
 * 主进程以 ESM 运行时仍需稳定定位到与当前模块同目录的 worker 输出。
 */
const resolveWorkerPath = () => join(moduleDirname, 'calibrationWorker.js')

/** 互斥锁：同一时刻只允许一个 Worker 在运行 */
let workerBusy = false
let workerIdCounter = 0

/**
 * 在独立 Worker 线程中执行上旋角度估算。
 * - 互斥：若上一次估算尚未完成，本次直接跳过（当前 segments 的下一次换向时会重算）。
 * - 非阻塞：立即返回，结果通过 onAngle 回调传回。
 */
const runAngleEstimateInWorker = (
  req: Omit<CalibrationWorkerRequest, 'id'>,
  onAngle: (maxAngle: number) => void
) => {
  if (workerBusy) {
    console.debug('[CalibrationBridge] Worker 正在运行，本次角度估算已跳过')
    return
  }

  workerBusy = true
  const id = ++workerIdCounter
  const workerPath = resolveWorkerPath()

  let worker: Worker
  try {
    worker = new Worker(workerPath)
  } catch (err) {
    workerBusy = false
    console.error('[CalibrationBridge] Worker 创建失败:', err)
    return
  }

  worker.on('message', (res: CalibrationWorkerResponse) => {
    workerBusy = false
    if (res.id !== id) return
    if (res.ok) {
      onAngle(res.maxAngle)
    } else {
      const errRes = res as Extract<CalibrationWorkerResponse, { ok: false }>
      console.warn('[CalibrationBridge] Worker 角度估算失败:', errRes.error)
    }
    worker.terminate().catch(() => {})
  })

  worker.on('error', (err) => {
    workerBusy = false
    console.error('[CalibrationBridge] Worker 运行错误:', err)
    worker.terminate().catch(() => {})
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      workerBusy = false
      console.error(`[CalibrationBridge] Worker 异常退出，code=${code}`)
    }
  })

  worker.postMessage({ ...req, id } satisfies CalibrationWorkerRequest)
}

export const createModbusCalibrationBridge = (
  options: CreateModbusCalibrationBridgeOptions = {}
) => {
  const session = createCalibrationSession({
    config: options.config ?? DEFAULT_CALIBRATION_CONFIG,
    standardized: options.standardized ?? DEFAULT_STANDARDIZED,
    manualTractionSpeed: options.manualTractionSpeed,
    onResult: options.onResult,
  })

  let previousPulse: number | undefined
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
    data: IPollingModBusData,
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
    const timestamp = sample.timestamp ?? Date.now()

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

    return {
      timestamp,
      ProbeValue: probeValue,
      HorizontalPulse: pulse,
      MotionDirection: motionDirection,
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

    const { calibrateResult, pendingAngleEstimate } = session.feedThickness(thicknessSample)
    if (pendingAngleEstimate) {
      handlePendingAngleEstimate(pendingAngleEstimate)
    }

    return calibrateResult
  }

  const feedModbusData = (data: IPollingModBusData) => {
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

      const { calibrateResult, pendingAngleEstimate } = session.feedThickness(thicknessSample)
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

    const thicknessSample: ThicknessData = {
      timestamp,
      ProbeValue: probeValue,
      HorizontalPulse: pulse,
      MotionDirection: motionDirection,
    }

    const { calibrateResult, pendingAngleEstimate } = session.feedThickness(thicknessSample)
    if (pendingAngleEstimate) {
      handlePendingAngleEstimate(pendingAngleEstimate)
    }

    return calibrateResult
  }

  const reset = (disturbanceTs: number = Date.now()) => {
    previousPulse = undefined
    previousMotionDirection = true
    latestThicknessTimestamp = undefined
    session.reset(disturbanceTs)
  }

  const setManualTractionSpeed = (
    manualTractionSpeed: number,
    disturbanceTs: number = Date.now()
  ) => {
    previousPulse = undefined
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
