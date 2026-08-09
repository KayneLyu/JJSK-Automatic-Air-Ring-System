import {
  buildUpperRotationNativeDto,
  type UpperRotationNativeDto,
  type UpperRotationNativeSegment,
} from './upperRotation.native'
import type { UpperRotationNativeBinding } from './upperRotation.nativeShadow'
import type {
  UpperRotationSearchBackend,
  UpperRotationSearchObjective,
} from './upperRotation.searchBackend'

type NativeEvaluate = NonNullable<UpperRotationNativeBinding['evaluateDirect']>

const requireEvaluator = (
  binding: UpperRotationNativeBinding,
  objective: UpperRotationSearchObjective
): NativeEvaluate => {
  const evaluator =
    objective === 'expanded' ? binding.evaluateExpanded : binding.evaluateDirect
  if (typeof evaluator !== 'function') {
    throw new Error(`Native binding 缺少 ${objective} 目标函数导出`)
  }
  return evaluator
}

export const createUpperRotationNativeSearchBackend = (
  binding: UpperRotationNativeBinding,
  threadLimit: number
): UpperRotationSearchBackend => {
  binding.configureThreadPool(threadLimit)
  const dtoCache = new WeakMap<object, UpperRotationNativeDto>()
  const getDto = (
    segments: readonly UpperRotationNativeSegment[]
  ): UpperRotationNativeDto => {
    const key = segments as object
    let dto = dtoCache.get(key)
    if (!dto) {
      dto = buildUpperRotationNativeDto(segments)
      dtoCache.set(key, dto)
    }
    return dto
  }

  return {
    search: (request) => {
      const dto = getDto(request.segments)
      const search =
        request.objective === 'expanded'
          ? binding.searchBestExpanded
          : binding.searchBestDirect
      const result = search(
        dto.times,
        dto.values,
        dto.offsetDegrees,
        dto.segmentOffsets,
        dto.durations,
        dto.accelRatios,
        request.minDegrees,
        request.maxDegrees,
        request.stepDegrees,
        request.numBins
      )
      if (
        !Number.isFinite(result.theta) ||
        result.theta < request.minDegrees ||
        result.theta >= request.maxDegrees ||
        !Number.isFinite(result.loss)
      ) {
        throw new Error('Native 搜索返回了无效或越界结果')
      }
      const sampleThetas = result.sampleThetas ?? []
      const sampleLosses = result.sampleLosses ?? []
      if (sampleThetas.length !== sampleLosses.length) {
        throw new Error('Native 搜索返回的 loss 采样长度不一致')
      }
      const samples = request.collectSamples
        ? sampleThetas.map((theta, index) => ({
            theta,
            loss: sampleLosses[index],
          }))
        : []
      return {
        theta: result.theta,
        loss: result.loss,
        samples,
        evaluations: result.evaluations,
      }
    },
    evaluate: (objective, segments, thetaDegrees, numBins) => {
      const dto = getDto(segments)
      const evaluator = requireEvaluator(binding, objective)
      const loss = evaluator(
        dto.times,
        dto.values,
        dto.offsetDegrees,
        dto.segmentOffsets,
        dto.durations,
        dto.accelRatios,
        thetaDegrees,
        numBins
      )
      if (!Number.isFinite(loss)) {
        throw new Error('Native 目标函数返回了非有限 loss')
      }
      return loss
    },
  }
}
