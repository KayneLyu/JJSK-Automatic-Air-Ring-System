import type { IPollingModBusData } from '@/types/ipc'
import {
  createCalibrationSession,
  type CalibrateResult,
} from '../../../packages/AirRingServer/controllers/calibration.ts'
import type { RingData } from '../../../packages/AirRingServer/connections/airRing/opcua.ts'
import type { ThicknessData } from '../../../packages/AirRingServer/connections/thickness/opcua.ts'
import type {
  CalibrationConfig,
  Scalar,
} from '../../../packages/AirRingServer/types/index.ts'

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
  onResult?: (result: CalibrateResult) => void
}

export const createModbusCalibrationBridge = (
  options: CreateModbusCalibrationBridgeOptions = {}
) => {
  const session = createCalibrationSession({
    config: options.config ?? DEFAULT_CALIBRATION_CONFIG,
    standardized: options.standardized ?? DEFAULT_STANDARDIZED,
    disturbanceTs: options.disturbanceTs ?? Date.now(),
    onResult: options.onResult,
  })

  let previousPulse: number | undefined
  let previousMotionDirection = true
  let latestThicknessTimestamp: number | undefined

  const buildThicknessSample = (
    data: IPollingModBusData,
    index: number
  ): ThicknessData | null => {
    const probeValue = data.adValues[index]
    const pulse = data.pulses[index]
    const timestamp = data.timestamps[index]

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

  const feedModbusData = (data: IPollingModBusData) => {
    const sampleCount = Math.min(
      data.adValues.length,
      data.pulses.length,
      data.timestamps.length
    )

    for (let index = 0; index < sampleCount; index += 1) {
      const thicknessSample = buildThicknessSample(data, index)

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

  return {
    feedModbusData,
    feedUpperRotationData,
    reset,
    getResult: session.getResult,
  }
}
