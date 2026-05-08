import type { IPollingModBusData } from '@/types/ipc'
import {
  createCalibrationSession,
  type CalibrateResult,
  type RingData,
  type ThicknessData,
  type CalibrationConfig,
  type Scalar,
} from '@jjsk/air-ring-server/electron'

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

export type CreateModbusCalibrationBridgeOptions = {
  config?: CalibrationConfig
  standardized?: Scalar
  disturbanceTs?: number
  manualTractionSpeed?: number
  onResult?: (result: CalibrateResult) => void
}

export const createModbusCalibrationBridge = (
  options: CreateModbusCalibrationBridgeOptions = {}
) => {
  const session = createCalibrationSession({
    config: options.config ?? DEFAULT_CALIBRATION_CONFIG,
    standardized: options.standardized ?? DEFAULT_STANDARDIZED,
    disturbanceTs: options.disturbanceTs ?? Date.now(),
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

      const result = session.feedThickness(thicknessSample)
      if (result) {
        return result
      }
    }

    return session.getResult()
  }

  const feedUpperRotationData = (data: RingData) => {
    const timestamp = data.timestamp ?? latestThicknessTimestamp ?? Date.now()

    return session.feedAirRing({
      ...data,
      timestamp,
    })
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
    feedUpperRotationData,
    setManualTractionSpeed,
    reset,
    getManualTractionSpeed: session.getManualTractionSpeed,
    getDisturbanceTs: session.getDisturbanceTs,
    getResult: session.getResult,
  }
}
