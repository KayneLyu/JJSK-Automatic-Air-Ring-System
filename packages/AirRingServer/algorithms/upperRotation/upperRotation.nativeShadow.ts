import type { TripSegment } from '../../types'
import type {
  UpperRotationDetailedEstimate,
  UpperRotationEstimateOptions,
} from './upperRotation.estimate'
import {
  buildUpperRotationNativeDto,
  normalizeUpperRotationNativeSegments,
} from './upperRotation.native'

export type UpperRotationNativeSearchResult = {
  theta: number
  loss: number
  evaluations: number
  sampleThetas?: number[]
  sampleLosses?: number[]
}

type NativeEvaluate = (
  times: Float64Array,
  values: Float64Array,
  offsetDegrees: Float64Array,
  segmentOffsets: Uint32Array,
  durations: Float64Array,
  accelRatios: Float64Array,
  thetaMaxDegrees: number,
  numBins: number
) => number

type NativeSearch = (
  times: Float64Array,
  values: Float64Array,
  offsetDegrees: Float64Array,
  segmentOffsets: Uint32Array,
  durations: Float64Array,
  accelRatios: Float64Array,
  minDegrees: number,
  maxDegrees: number,
  stepDegrees: number,
  numBins: number
) => UpperRotationNativeSearchResult

export type UpperRotationNativeBinding = {
  configureThreadPool(maxThreads: number): number
  evaluateDirect?: NativeEvaluate
  evaluateExpanded?: NativeEvaluate
  searchBestDirect: NativeSearch
  searchBestExpanded: NativeSearch
}

export type UpperRotationRustShadowStatus =
  'success' | 'notComparable' | 'loadError' | 'executionError'

export type UpperRotationRustShadowTelemetry = {
  schemaVersion: 1
  status: UpperRotationRustShadowStatus
  objectiveUsed: 'direct' | 'expanded' | null
  productionThetaDeg: number | null
  productionBaseThetaDeg: number | null
  nativeThetaDeg: number | null
  angleDeltaDeg: number | null
  absoluteAngleDeltaDeg: number | null
  nativeLoss: number | null
  evaluations: number
  segmentCount: number
  pointCount: number
  threadLimit: number
  nativeElapsedMs: number
  totalElapsedMs: number
  error: string | null
}

export type RunUpperRotationRustShadowOptions = {
  threadLimit: number
  estimateOptions?: UpperRotationEstimateOptions
}

const sanitizeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

const createBaseTelemetry = (
  production: UpperRotationDetailedEstimate,
  threadLimit: number
): UpperRotationRustShadowTelemetry => ({
  schemaVersion: 1,
  status: 'notComparable',
  objectiveUsed:
    production.diagnostics.objectiveUsed === 'direct' ||
    production.diagnostics.objectiveUsed === 'expanded'
      ? production.diagnostics.objectiveUsed
      : null,
  productionThetaDeg: production.thetaMaxDeg,
  productionBaseThetaDeg: production.diagnostics.baseThetaDeg,
  nativeThetaDeg: null,
  angleDeltaDeg: null,
  absoluteAngleDeltaDeg: null,
  nativeLoss: null,
  evaluations: 0,
  segmentCount: 0,
  pointCount: 0,
  threadLimit,
  nativeElapsedMs: 0,
  totalElapsedMs: 0,
  error: null,
})

export const createUpperRotationRustShadowFailure = (
  production: UpperRotationDetailedEstimate,
  threadLimit: number,
  status: Extract<
    UpperRotationRustShadowStatus,
    'loadError' | 'executionError'
  >,
  error: unknown
): UpperRotationRustShadowTelemetry => ({
  ...createBaseTelemetry(production, threadLimit),
  status,
  error: sanitizeError(error),
})

export const runUpperRotationRustShadow = (
  tripSegments: TripSegment[],
  production: UpperRotationDetailedEstimate,
  binding: UpperRotationNativeBinding,
  options: RunUpperRotationRustShadowOptions
): UpperRotationRustShadowTelemetry => {
  const startedAt = performance.now()
  const telemetry = createBaseTelemetry(production, options.threadLimit)
  const objective = telemetry.objectiveUsed
  const baseTheta = telemetry.productionBaseThetaDeg

  if (baseTheta === null || objective === null) {
    telemetry.error = 'TypeScript 主搜索没有可比较结果'
    telemetry.totalElapsedMs = performance.now() - startedAt
    return telemetry
  }

  try {
    const estimateOptions = options.estimateOptions ?? {}
    const normalized = normalizeUpperRotationNativeSegments(tripSegments, {
      offsetMode: estimateOptions.debug?.offsetMode,
      accelDecelMs: estimateOptions.debug?.accelDecelMs,
    })
    telemetry.segmentCount = normalized.length
    if (normalized.length < 2) {
      telemetry.error = 'Native 归一化后的有效片段少于 2'
      telemetry.totalElapsedMs = performance.now() - startedAt
      return telemetry
    }

    const dto = buildUpperRotationNativeDto(normalized)
    telemetry.pointCount = dto.times.length
    binding.configureThreadPool(options.threadLimit)

    const { min = 180, max = 360, step = 1 } = estimateOptions.deltaRange ?? {}
    const numBins = estimateOptions.segments ?? 36
    const search =
      objective === 'expanded'
        ? binding.searchBestExpanded
        : binding.searchBestDirect
    const nativeStartedAt = performance.now()
    const native = search(
      dto.times,
      dto.values,
      dto.offsetDegrees,
      dto.segmentOffsets,
      dto.durations,
      dto.accelRatios,
      min,
      max,
      step,
      numBins
    )
    telemetry.nativeElapsedMs = performance.now() - nativeStartedAt
    telemetry.nativeThetaDeg = native.theta
    telemetry.nativeLoss = native.loss
    telemetry.evaluations = native.evaluations
    telemetry.angleDeltaDeg = native.theta - baseTheta
    telemetry.absoluteAngleDeltaDeg = Math.abs(telemetry.angleDeltaDeg)
    telemetry.status = 'success'
  } catch (error) {
    telemetry.status = 'executionError'
    telemetry.error = sanitizeError(error)
  }

  telemetry.totalElapsedMs = performance.now() - startedAt
  return telemetry
}
