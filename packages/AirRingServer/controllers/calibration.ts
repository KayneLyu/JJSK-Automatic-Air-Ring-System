/**
 * 数据标定
 * */
import { getCircumference } from '@jjsk/core'
import type { ThicknessData } from '../connections/thickness'
import type { RingData } from '../connections/airRing'
import type { CalibrationConfig, Scalar, TripSegment } from '../types'
import type { UpperRotationObjectiveMode } from '../algorithms/upperRotation/upperRotation.config'
import { WithRequired } from '@jjsk/core'
import { calibrateTractionSpeedSmooth } from '../algorithms/tractionSpeedSmooth'
import { calibrateMutationWindowSize as algoCalibrateMutationWindowSize } from '../algorithms/mutationWindowSize'
import { findMutation } from '../algorithms/findMutation'
import { buildTripSegment } from '../algorithms/buildTripSegment'
import { estimateThetaMaxWithPhaseCorrection } from '../algorithms/upperRotation/upperRotation.estimate'

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

/**
 * 当片段签名变化时，携带需要异步估算的上旋角度信息。
 * 上层（calibrationBridge）负责在 Worker 线程中执行估算，
 * 避免 CPU 密集型算法阻塞主进程事件循环。
 */
export type PendingAngleEstimate = {
  tripSegments: TripSegment[]
  options: {
    deltaRange: { min: number; max: number; step: number }
    objectiveMode?: UpperRotationObjectiveMode
  }
}

/** next() 的完整返回类型：同步结果 + 可选的待异步估算任务 */
export type CalibrateNextResult = {
  result: CalibrateResult | null
  pendingAngleEstimate: PendingAngleEstimate | null
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
    upperRotation: {
      deltaRange: { min = 180, max = 359, step = 1 } = {},
      objectiveMode = 'auto',
    },
  } = config
  const deltaRange = { min, max, step }
  const circumference = getCircumference(ROLLER)
  const { next: TractionSpeedSmoothNext } = calibrateTractionSpeedSmooth(
    circumference,
    numCycles,
    maxIntervalMs
  )
  const { next: MutationWindowSizeNext } = algoCalibrateMutationWindowSize({
    CHANNEL_COUNT,
  })
  const { next: FindMutationNext, setWindowSize } = findMutation()
  const { next: BuildTripSegmentNext } = buildTripSegment()
  /**
   * 缓存首次成功计算的距离值（一次性标定）
   * */
  let cachedDistance: number | null = null
  /**
   * 记录最近一次参与 maxAngle 估计的已完成片段签名，避免在同一批片段上重复重算。
   * */
  let lastEstimatedTripSignature: string | null = null
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }): CalibrateNextResult => {
    // ---------- Step 1: 计算牵引速度 ----------
    const calculatedTractionSpeed = thickness
      ? TractionSpeedSmoothNext(thickness)
      : null
    const v = manualTractionSpeed ?? calculatedTractionSpeed

    // ---------- Step 2: 标定突变检测窗口大小 ----------
    const { fastSize, size } = MutationWindowSizeNext({ thickness, airRing })
    const baseResult: Partial<CalibrateResult> = {
      mutationWindowSize: size ?? fastSize,
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
      return {
        result: buildCalibrationResult(baseResult),
        pendingAngleEstimate: null,
      }
    }
    if (!fastSize) {
      /* 突变窗口未完成标定 */
      return {
        result: buildCalibrationResult(baseResult),
        pendingAngleEstimate: null,
      }
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
      // 这里的 segments 是上旋目标函数的角度分箱数，不是风道数量。
      // 传入 CHANNEL_COUNT=48 会把 5 月 22 日这类片段推向高角度局部最优；
      // 保持估计器默认分箱可与算法层重放结果一致。
      distance = cachedDistance
    } else if (cachedDistance !== null) {
      distance = cachedDistance
    }

    // ---------- Step 6: 提取测厚仪有效扫描段，计算最大旋转角度 ----------
    // 距离标定失败不影响 maxAngle 等其他值的标定
    if (tripSegment.length < 2) {
      return {
        result: buildCalibrationResult({ ...baseResult, distance }),
        pendingAngleEstimate: null,
      }
    }

    const completedTripSignature = tripSegment
      .filter(
        (segment) => segment.duration > 0 && segment.measurements.length > 0
      )
      .map(
        (segment) =>
          `${segment.startTime}:${segment.duration}:${segment.measurements.length}`
      )
      .join('|')

    if (!completedTripSignature) {
      return {
        result: buildCalibrationResult({ ...baseResult, distance }),
        pendingAngleEstimate: null,
      }
    }

    if (completedTripSignature === lastEstimatedTripSignature) {
      // buildTripSegment 只会在片段结算时更新 measurements；
      // 若已完成片段集合未变化，则重复估计 maxAngle 不会产生新信息。
      return {
        result: buildCalibrationResult({ ...baseResult, distance }),
        pendingAngleEstimate: null,
      }
    }

    lastEstimatedTripSignature = completedTripSignature

    // 签名已变化——通知上层异步执行角度估算（Worker 线程），避免阻塞主进程。
    // 上层收到 pendingAngleEstimate 后，将在 Worker 中调用
    // estimateThetaMaxWithPhaseCorrection，完成后通过 onResult 回传 maxAngle。
    return {
      result: buildCalibrationResult({ ...baseResult, distance }),
      pendingAngleEstimate: {
        tripSegments: [...tripSegment],
        options:
          objectiveMode === 'auto'
            ? { deltaRange }
            : { deltaRange, objectiveMode },
      },
    }
  }
  return { next }
}

// ════════════════════════════════════════
// 以下为 5 个独立标定函数（批次模式），
// 用于 UI 触发的单参数标定操作。
// ════════════════════════════════════════

/**
 * 标定 1：牵引速度
 * 通过辊速信号上升沿计算平均速度。
 */
export function calibrateTractionSpeed(
  data: ThicknessData[],
  config: {
    circumference: number
    numCycles?: number
    maxIntervalMs?: number
  }
): number | null {
  const { next } = calibrateTractionSpeedSmooth(
    config.circumference,
    config.numCycles ?? 10,
    config.maxIntervalMs ?? 10_000
  )
  let last: number | null = null
  for (const d of data) {
    const v = next(d)
    if (v !== null) last = v
  }
  return last
}

/**
 * 标定 2：突变窗口
 * 通过厚度 MotionDirection 换向和上旋 ForwardRotation 换向计算窗口。
 */
export function calibrateMutationWindowSize(
  thickness: ThicknessData[],
  airRing: RingData[],
  config: {
    channelCount: number
    alpha?: number
  }
): { fastSize: number | undefined; size: number | undefined } {
  const { next } = calibrateMutationWindowSize({
    CHANNEL_COUNT: config.channelCount,
    alpha: config.alpha,
  })

  let result: { fastSize: number | undefined; size: number | undefined } = {}
  // 按时间戳交错喂入
  const events: {
    ts: number
    thickness?: ThicknessData
    airRing?: RingData
  }[] = []
  for (const d of thickness) {
    events.push({ ts: d.timestamp ?? 0, thickness: d })
  }
  for (const d of airRing) {
    events.push({ ts: d.timestamp ?? 0, airRing: d })
  }
  events.sort((a, b) => a.ts - b.ts)

  for (const ev of events) {
    const r = next({ thickness: ev.thickness, airRing: ev.airRing })
    if (r.size !== undefined || r.fastSize !== undefined) {
      result = r as { fastSize: number | undefined; size: number | undefined }
    }
  }
  return result
}

/**
 * 标定 3：突变检测
 * 滑动窗口查找厚度突变点。
 */
export function detectMutation(
  data: ThicknessData[],
  windowSize: number,
  deviation: number = 0.05
): WithRequired<ThicknessData, 'timestamp'> | null {
  const { next, setWindowSize } = findMutation(deviation)
  setWindowSize(windowSize)
  for (const d of data) {
    const m = next(d)
    if (m) return m
  }
  return null
}

/**
 * 标定 4：扰动距离
 * distance = speed * (mutationTimestamp - disturbanceTs) / 1000
 */
export function calibrateDistance(
  tractionSpeed: number,
  mutationTimestamp: number,
  disturbanceTs: number
): number {
  return tractionSpeed * ((mutationTimestamp - disturbanceTs) / 1000)
}

/**
 * 辅助：构建行程分段
 */
export function buildTripSegments(
  thickness: ThicknessData[],
  airRing: RingData[]
): TripSegment[] {
  const { next } = buildTripSegment()
  const events: {
    ts: number
    thickness?: ThicknessData
    airRing?: RingData
  }[] = []
  for (const d of thickness) {
    events.push({ ts: d.timestamp ?? 0, thickness: d })
  }
  for (const d of airRing) {
    events.push({ ts: d.timestamp ?? 0, airRing: d })
  }
  events.sort((a, b) => a.ts - b.ts)
  for (const ev of events) {
    next({ thickness: ev.thickness, airRing: ev.airRing })
  }
  const segs: TripSegment[] = []
  for (const ev of events) {
    const r = next({ thickness: ev.thickness, airRing: ev.airRing })
    if (r.length > segs.length) segs.push(...r.slice(segs.length))
  }
  return segs
}

/**
 * 标定 5：上旋最大角度
 */
export function calibrateMaxAngle(
  tripSegments: TripSegment[],
  options?: {
    deltaRange?: { min: number; max: number; step: number }
    objectiveMode?: UpperRotationObjectiveMode
  }
): number | null {
  if (tripSegments.length < 2) return null
  const opt = options ?? {}
  const deltaRange = opt.deltaRange ?? { min: 180, max: 359, step: 1 }
  return estimateThetaMaxWithPhaseCorrection(tripSegments, {
    deltaRange,
    objectiveMode: opt.objectiveMode,
  })
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

  const feed = (
    input: CalibrationStreamInput
  ): {
    calibrateResult: CalibrateResult | null
    pendingAngleEstimate: PendingAngleEstimate | null
  } => {
    const { result, pendingAngleEstimate } = currentCalibrator.next(input)

    if (result) {
      const nextResult = {
        ...currentResult,
        ...result,
      }

      if (hasCalibrationResultChanged(currentResult, nextResult)) {
        currentResult = nextResult
        // 仅在没有待异步角度估算时立即通知（有 pending 时由 bridge 在 Worker 完成后通知）
        if (!pendingAngleEstimate) {
          onResult?.(nextResult)
        }
      } else {
        currentResult = nextResult
      }
    }

    return { calibrateResult: currentResult, pendingAngleEstimate }
  }

  return {
    next: feed,
    feedThickness: (thickness: ThicknessData | ThicknessData[]) => {
      const list = Array.isArray(thickness) ? thickness : [thickness]
      let lastPending: PendingAngleEstimate | null = null

      for (const item of list) {
        const { calibrateResult, pendingAngleEstimate } = feed({
          thickness: item,
        })
        if (pendingAngleEstimate) {
          lastPending = pendingAngleEstimate
        }
        if (calibrateResult && !pendingAngleEstimate) {
          return { calibrateResult, pendingAngleEstimate: null }
        }
      }

      return {
        calibrateResult: currentResult,
        pendingAngleEstimate: lastPending,
      }
    },
    feedAirRing: (airRing: RingData | RingData[]) => {
      const list = Array.isArray(airRing) ? airRing : [airRing]
      let lastPending: PendingAngleEstimate | null = null

      for (const item of list) {
        const { calibrateResult, pendingAngleEstimate } = feed({
          airRing: item,
        })
        if (pendingAngleEstimate) {
          lastPending = pendingAngleEstimate
        }
        if (calibrateResult && !pendingAngleEstimate) {
          return { calibrateResult, pendingAngleEstimate: null }
        }
      }

      return {
        calibrateResult: currentResult,
        pendingAngleEstimate: lastPending,
      }
    },
    /**
     * 将 Worker 异步计算得到的 maxAngle 合并回结果，并触发 onResult 回调。
     * 由 calibrationBridge 在 Worker 完成后调用。
     */
    applyAngleEstimate: (maxAngle: number) => {
      if (currentResult === null) {
        currentResult = { maxAngle }
      } else {
        currentResult = { ...currentResult, maxAngle }
      }
      onResult?.(currentResult)
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
      currentDisturbanceTs = newDisturbanceTs
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
