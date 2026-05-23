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
   * 开始扰动时间戳（可选）
   * 扰动失败或未执行扰动时可为空
   * */
  disturbanceTs?: number
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

type CreateCalibrationSessionInput = Omit<
  CreateCalibrationSessionOptions,
  'disturbanceTs'
>

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
  /**
   * 缓存首次成功计算的距离值（一次性标定）
   * */
  let cachedDistance: number | null = null
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

    // ---------- Step 5: 计算上旋人字架到测厚仪的距离（一次性标定）----------
    // 首次检测到突变时记录距离，后续始终使用缓存值
    // 即使后续检测到突变，也不再更新 distance（保证距离的一次性标定）
    let distance: number | undefined
    if (mutation && disturbanceTs !== undefined) {
      const tau_ms = mutation.timestamp! - disturbanceTs
      const currentDistance = v * (tau_ms / 1000)
      // 首次成功时缓存距离值
      if (cachedDistance === null) {
        cachedDistance = currentDistance
        console.debug(
          `[Calibration] 首次距离标定成功: ${cachedDistance.toFixed(2)} mm`
        )
      }
      distance = cachedDistance
    } else if (cachedDistance !== null) {
      // 即使没有检测到突变，也使用已缓存的距离
      distance = cachedDistance
    }

    // ---------- Step 6: 提取测厚仪有效扫描段，计算最大旋转角度 ----------
    // 距离标定失败不影响 maxAngle 等其他值的标定
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
      /* 无法计算最大旋转角度，但不影响其他结果输出 */
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
  manualTractionSpeed,
  standardized,
  onResult,
}: CreateCalibrationSessionInput) => {
  let currentDisturbanceTs: number | undefined = undefined
  let currentManualTractionSpeed = manualTractionSpeed
  const buildCalibrator = (
    nextDisturbanceTs: number | undefined,
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
    /**
     * 触发扰动动作
     *
     * @param newDisturbanceTs 扰动时刻（默认当前时间）
     *
     * **当前实现**：仅记录日志，暂未接入 PLC 扰动动作。
     * 待后续实现 PLC 接口后，可通过此函数标记并重置标定会话。
     * */
    triggerDisturbance: (newDisturbanceTs: number = Date.now()) => {
      console.info(
        `[Calibration] 扰动触发标记: ${new Date(newDisturbanceTs).toISOString()}`
      )
      // TODO: 后续接入 PLC 扰动动作调用
      // 当前暂不更新 disturbanceTs，待 PLC 接口就位后启用以下逻辑：
      // currentDisturbanceTs = newDisturbanceTs
      // currentResult = null
      // currentCalibrator = buildCalibrator(
      //   currentDisturbanceTs,
      //   currentManualTractionSpeed
      // )
    },
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
