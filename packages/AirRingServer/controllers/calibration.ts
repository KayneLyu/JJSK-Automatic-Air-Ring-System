/**
 * 数据标定
 * */
import { getCircumference } from '@jjsk/core'
import type { ThicknessData } from '../connections/thickness/opcua'
import type { RingData } from '../connections/airRing/opcua'
import type { CalibrationConfig, Scalar } from '../types'
import { calibrateTractionSpeedSmooth } from '../algorithms/tractionSpeedSmooth'
import { calibrateMutationWindowSize } from '../algorithms/mutationWindowSize'
import { findMutation } from '../algorithms/findMutation'
import { buildTripSegment } from '../algorithms/buildTripSegment'
import { estimateThetaMaxWithPhaseCorrection } from '../algorithms/upperRotation/upperRotation'

export type CalibrateOptions = {
  standardized: Scalar
  config: CalibrationConfig
  /**
   * 开始扰动时间戳
   * */
  disturbanceTs: number
}

export type CalibrateResult = {
  /**
   * 膜的牵引速度 单位：mm/s
   * */
  tractionSpeed?: number
  /**
   * 上旋人字架到测厚仪的距离 单位：mm
   * */
  distance?: number
  /**
   * 上旋人字架最大旋转角度
   * */
  maxAngle?: number
  /**
   * 膜宽 单位：mm
   * */
  membraneWidth?: number
  /**
   * 突变窗口数
   * */
  mutationWindowSize?: number
}

export type CalibrationStreamInput = {
  thickness?: ThicknessData
  airRing?: RingData
}

export type CreateCalibrationSessionOptions = CalibrateOptions & {
  onResult?: (result: CalibrateResult) => void
}

/**
 * 标定，用于设备特征标定
 * */
export const calibrate = ({
  config,
  disturbanceTs,
  standardized,
}: CalibrateOptions) => {
  const { CHANNEL_COUNT, ROLLER } = standardized
  const {
    roller: { numCycles = 10, maxIntervalMs = 10_000 },
    upperRotation: { deltaRange: { min = 180, max = 359, step = 1 } = {} },
  } = config
  const deltaRange = { min, max, step }
  const circumference = getCircumference(ROLLER)
  const { next: TractionSpeedSmoothNext } = calibrateTractionSpeedSmooth(
    circumference,
    numCycles,
    maxIntervalMs
  )
  const { next: MutationWindowSizeNext } = calibrateMutationWindowSize({
    CHANNEL_COUNT,
  })
  const { next: FindMutationNext, setWindowSize } = findMutation()
  const { next: BuildTripSegmentNext } = buildTripSegment()
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }): CalibrateResult | null => {
    // ---------- Step 1: 计算牵引速度 ----------
    const v = thickness ? TractionSpeedSmoothNext(thickness) : null

    // ---------- Step 2: 标定突变检测窗口大小 ----------
    const { fastSize, size } = MutationWindowSizeNext({ thickness, airRing })

    // ---------- Step 3: 检测厚度突变 ----------
    const mutation = thickness ? FindMutationNext(thickness) : null

    // ---------- Step 4: 生成单程片段数据 ----------
    const tripSegment = BuildTripSegmentNext({
      airRing,
      thickness,
    })

    if (!v || v <= 0) {
      /* 无法计算牵引速度 */
      return null
    }
    if (!fastSize) {
      /* 突变窗口未完成标定 */
      return {
        tractionSpeed: v,
      }
    }
    setWindowSize(fastSize)
    if (!mutation) {
      /* 未检测到有效扰动响应 */
      return {
        tractionSpeed: v,
      }
    }
    // ---------- Step 5: 计算上旋人字架到测厚仪的距离 ----------
    const tau_ms = mutation.timestamp! - disturbanceTs

    const distance = v * (tau_ms / 1000)

    // ---------- Step 6: 提取测厚仪有效扫描段 ----------
    if (tripSegment.length < 2) {
      return {
        tractionSpeed: v,
        distance,
      }
    }
    const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      deltaRange,
      segments: CHANNEL_COUNT,
    })
    if (!maxAngle) {
      /* 无法上旋计算最大旋转角度 */
      return {
        tractionSpeed: v,
        distance,
      }
    }

    return {
      tractionSpeed: v,
      mutationWindowSize: size,
      maxAngle: maxAngle,
      distance,
    }
  }
  return { next }
}

export const createCalibrationSession = ({
  config,
  disturbanceTs,
  standardized,
  onResult,
}: CreateCalibrationSessionOptions) => {
  let currentDisturbanceTs = disturbanceTs
  let currentCalibrator = calibrate({
    config,
    disturbanceTs: currentDisturbanceTs,
    standardized,
  })
  let currentResult: CalibrateResult | null = null

  const feed = (input: CalibrationStreamInput) => {
    if (currentResult) {
      return currentResult
    }

    const result = currentCalibrator.next(input)

    if (result) {
      currentResult = result
      onResult?.(result)
    }

    return result
  }

  return {
    next: feed,
    feedThickness: (thickness: ThicknessData | ThicknessData[]) => {
      const list = Array.isArray(thickness) ? thickness : [thickness]

      for (const item of list) {
        const result = feed({ thickness: item })
        if (result) {
          return result
        }
      }

      return currentResult
    },
    feedAirRing: (airRing: RingData | RingData[]) => {
      const list = Array.isArray(airRing) ? airRing : [airRing]

      for (const item of list) {
        const result = feed({ airRing: item })
        if (result) {
          return result
        }
      }

      return currentResult
    },
    getResult: () => currentResult,
    reset: (nextDisturbanceTs: number = Date.now()) => {
      currentDisturbanceTs = nextDisturbanceTs
      currentResult = null
      currentCalibrator = calibrate({
        config,
        disturbanceTs: currentDisturbanceTs,
        standardized,
      })
    },
  }
}
