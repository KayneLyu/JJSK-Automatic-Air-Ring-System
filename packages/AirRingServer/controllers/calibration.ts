/**
 * 数据标定
 * */
import { getCircumference } from '@jjsk/core'
import type { ThicknessData } from '../connections/thickness'
import type { RingData } from '../connections/airRing'
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
  /**
   * 手动设置的牵引速度，单位：mm/s
   * 当无辊速信号时优先使用该值
   * */
  manualTractionSpeed?: number
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

const hasCalibrationResultChanged = (
  previous: CalibrateResult | null,
  next: CalibrateResult
) => {
  if (!previous) {
    return true
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<
    keyof CalibrateResult
  >

  for (const key of keys) {
    if (previous[key] !== next[key]) {
      return true
    }
  }

  return false
}

const buildCalibrationResult = (
  result: Partial<CalibrateResult>
): CalibrateResult | null => {
  const nextResult: CalibrateResult = {}

  if (result.tractionSpeed !== undefined) {
    nextResult.tractionSpeed = result.tractionSpeed
  }
  if (result.distance !== undefined) {
    nextResult.distance = result.distance
  }
  if (result.maxAngle !== undefined) {
    nextResult.maxAngle = result.maxAngle
  }
  if (result.membraneWidth !== undefined) {
    nextResult.membraneWidth = result.membraneWidth
  }
  if (result.mutationWindowSize !== undefined) {
    nextResult.mutationWindowSize = result.mutationWindowSize
  }

  return Object.keys(nextResult).length > 0 ? nextResult : null
}

/**
 * 标定，用于设备特征标定
 * */
export const calibrate = ({
  config,
  disturbanceTs,
  manualTractionSpeed,
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
    const calculatedTractionSpeed = thickness
      ? TractionSpeedSmoothNext(thickness)
      : null
    const v = manualTractionSpeed ?? calculatedTractionSpeed

    // ---------- Step 2: 标定突变检测窗口大小 ----------
    const { fastSize, size } = MutationWindowSizeNext({ thickness, airRing })
    const baseResult: Partial<CalibrateResult> = {
      mutationWindowSize: size,
    }

    if (v !== null && v !== undefined && v > 0) {
      baseResult.tractionSpeed = v
    }

    // ---------- Step 3: 检测厚度突变 ----------
    const mutation = thickness ? FindMutationNext(thickness) : null

    // ---------- Step 4: 生成单程片段数据 ----------
    const tripSegment = BuildTripSegmentNext({
      airRing,
      thickness,
    })

    if (!v || v <= 0) {
      /* 无法计算牵引速度 */
      return buildCalibrationResult(baseResult)
    }
    if (!fastSize) {
      /* 突变窗口未完成标定 */
      return buildCalibrationResult(baseResult)
    }
    setWindowSize(fastSize)
    if (!mutation) {
      /* 未检测到有效扰动响应 */
      return buildCalibrationResult(baseResult)
    }
    // ---------- Step 5: 计算上旋人字架到测厚仪的距离 ----------
    const tau_ms = mutation.timestamp! - disturbanceTs

    const distance = v * (tau_ms / 1000)

    // ---------- Step 6: 提取测厚仪有效扫描段 ----------
    if (tripSegment.length < 2) {
      return buildCalibrationResult({
        ...baseResult,
        distance,
      })
    }
    const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      deltaRange,
      segments: CHANNEL_COUNT,
    })
    if (!maxAngle) {
      /* 无法上旋计算最大旋转角度 */
      return buildCalibrationResult({
        ...baseResult,
        distance,
      })
    }

    return buildCalibrationResult({
      ...baseResult,
      maxAngle: maxAngle,
      distance,
    })
  }
  return { next }
}

export const createCalibrationSession = ({
  config,
  disturbanceTs,
  manualTractionSpeed,
  standardized,
  onResult,
}: CreateCalibrationSessionOptions) => {
  let currentDisturbanceTs = disturbanceTs
  let currentManualTractionSpeed = manualTractionSpeed
  const buildCalibrator = (
    nextDisturbanceTs: number,
    nextManualTractionSpeed: number | undefined
  ) => {
    return calibrate({
      config,
      disturbanceTs: nextDisturbanceTs,
      manualTractionSpeed: nextManualTractionSpeed,
      standardized,
    })
  }
  let currentCalibrator = buildCalibrator(
    currentDisturbanceTs,
    currentManualTractionSpeed
  )
  let currentResult: CalibrateResult | null = null

  const feed = (input: CalibrationStreamInput) => {
    const result = currentCalibrator.next(input)

    if (result) {
      const nextResult = {
        ...currentResult,
        ...result,
      }

      if (hasCalibrationResultChanged(currentResult, nextResult)) {
        currentResult = nextResult
        onResult?.(nextResult)
      } else {
        currentResult = nextResult
      }
    }

    return currentResult
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
    getManualTractionSpeed: () => currentManualTractionSpeed,
    getDisturbanceTs: () => currentDisturbanceTs,
    setManualTractionSpeed: (
      nextManualTractionSpeed: number | undefined,
      nextDisturbanceTs: number = Date.now()
    ) => {
      currentManualTractionSpeed = nextManualTractionSpeed
      currentDisturbanceTs = nextDisturbanceTs
      currentResult = null
      currentCalibrator = buildCalibrator(
        currentDisturbanceTs,
        currentManualTractionSpeed
      )
    },
    reset: (
      nextDisturbanceTs: number = Date.now(),
      nextManualTractionSpeed: number | undefined = currentManualTractionSpeed
    ) => {
      currentManualTractionSpeed = nextManualTractionSpeed
      currentDisturbanceTs = nextDisturbanceTs
      currentResult = null
      currentCalibrator = buildCalibrator(
        currentDisturbanceTs,
        currentManualTractionSpeed
      )
    },
  }
}
