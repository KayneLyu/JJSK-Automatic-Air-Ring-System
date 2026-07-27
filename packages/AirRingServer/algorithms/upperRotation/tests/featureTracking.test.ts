import { describe, expect, test } from 'vitest'
import {
  evaluateFeatureTrackingConfidence,
  trackProfileShift,
  type FeatureTrackingConfidenceEvidence,
} from '../upperRotation.featureTracking'

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('动态搜索窗口特征追踪', () => {
  test('随机物理工况按时间、速度和采样角分辨率推导窗口', () => {
    const random = createRandom(0xc07a61d2)
    for (let scenario = 0; scenario < 64; scenario++) {
      const length = 128
      const elapsedMs = 500 + random() * 5000
      const maxSpeed = 0.1 + random() * 2
      const degreesPerSample = 0.25 + random() * 2
      const expectedMaxShift = Math.ceil(
        (maxSpeed * elapsedMs) / 1000 / degreesPerSample
      )
      if (expectedMaxShift >= length) continue
      const profile = Array.from({ length }, () => random() * 2 - 1)
      const result = trackProfileShift(profile, profile, {
        referenceTimestampMs: 10_000,
        candidateTimestampMs: 10_000 + elapsedMs,
        maxAngularSpeedDegPerSecond: maxSpeed,
        degreesPerSample,
        minOverlapRatio: 0.5 + random() * 0.4,
      })

      expect(result.accepted).toBe(true)
      expect(result.maxShift).toBe(expectedMaxShift)
      expect(result.maxAngleDeltaDeg).toBeCloseTo(
        (maxSpeed * elapsedMs) / 1000,
        12
      )
    }
  })

  test('动态窗口内的随机整数平移可恢复为角度变化', () => {
    const random = createRandom(0x6da52f81)
    for (let scenario = 0; scenario < 48; scenario++) {
      const length = 96
      const degreesPerSample = 0.5 + random()
      const expectedShift = Math.floor(random() * 15) - 7
      const maxShift = Math.abs(expectedShift) + 1
      const elapsedMs = 1000 + random() * 2000
      const maxSpeed = (maxShift * degreesPerSample * 1000) / elapsedMs
      const reference = Array.from({ length }, () => random() * 2 - 1)
      const candidate = new Array<number>(length).fill(Number.NaN)
      for (let index = 0; index < length; index++) {
        const shiftedIndex = index + expectedShift
        if (shiftedIndex >= 0 && shiftedIndex < length) {
          candidate[shiftedIndex] = reference[index] * 1.7 - 4
        }
      }
      const result = trackProfileShift(reference, candidate, {
        referenceTimestampMs: 0,
        candidateTimestampMs: elapsedMs,
        maxAngularSpeedDegPerSecond: maxSpeed,
        degreesPerSample,
        minOverlapRatio: 0.7,
      })

      expect(result.accepted).toBe(true)
      expect(result.confidenceEvidence?.peakAtSearchBoundary).toBe(false)
      expect(result.confidenceEvidence?.equivalentPeakCount).toBe(1)
      expect(result.zncc?.bestShift).toBe(expectedShift)
      expect(
        Math.abs((result.shiftSamples as number) - expectedShift)
      ).toBeLessThan(0.05)
      expect(
        Math.abs(
          (result.angleDeltaDeg as number) - expectedShift * degreesPerSample
        )
      ).toBeLessThan(0.05 * degreesPerSample)
    }
  })

  test('无效时间、物理约束和超过剖面范围的窗口明确拒绝', () => {
    const profile = Array.from({ length: 16 }, (_, index) => index)
    const baseOptions = {
      referenceTimestampMs: 1000,
      candidateTimestampMs: 2000,
      maxAngularSpeedDegPerSecond: 1,
      degreesPerSample: 1,
      minOverlapRatio: 0.5,
    }

    expect(
      trackProfileShift(profile, profile, {
        ...baseOptions,
        candidateTimestampMs: 1000,
      }).rejectReason
    ).toBe('invalidTiming')
    expect(
      trackProfileShift(profile, profile, {
        ...baseOptions,
        degreesPerSample: 0,
      }).rejectReason
    ).toBe('invalidPhysicalLimits')
    expect(
      trackProfileShift(profile, profile, {
        ...baseOptions,
        minOverlapRatio: 0,
      }).rejectReason
    ).toBe('invalidOverlapRatio')
    expect(
      trackProfileShift(profile, profile, {
        ...baseOptions,
        maxAngularSpeedDegPerSecond: profile.length,
      }).rejectReason
    ).toBe('searchWindowExceedsProfile')
  })

  test('周期性等价峰被结构化拒绝并保留置信度证据', () => {
    const profile = Array.from({ length: 64 }, (_, index) =>
      Math.sin((index * Math.PI) / 4)
    )
    const result = trackProfileShift(profile, profile, {
      referenceTimestampMs: 0,
      candidateTimestampMs: 1000,
      maxAngularSpeedDegPerSecond: 12,
      degreesPerSample: 1,
      minOverlapRatio: 0.6,
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('ambiguousEquivalentPeaks')
    expect(result.confidenceEvidence?.equivalentPeakCount).toBeGreaterThan(1)
    expect(result.confidenceEvidence?.peakProminence).toBeCloseTo(0, 12)
  })

  test('主峰触及动态窗口边界时拒绝外推', () => {
    const reference = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8]
    const candidate = [
      Number.NaN,
      Number.NaN,
      Number.NaN,
      Number.NaN,
      3,
      1,
      4,
      1,
      5,
      9,
      2,
      6,
    ]
    const result = trackProfileShift(reference, candidate, {
      referenceTimestampMs: 0,
      candidateTimestampMs: 1000,
      maxAngularSpeedDegPerSecond: 4,
      degreesPerSample: 1,
      minOverlapRatio: 0.5,
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('peakAtSearchBoundary')
    expect(result.confidenceEvidence?.peakAtSearchBoundary).toBe(true)
    expect(result.zncc?.bestShift).toBe(4)
  })

  test('统计证据随噪声、缺失和近周期歧义按预期变化', () => {
    const random = createRandom(0xa53d19c7)
    const cleanCorrelations: number[] = []
    const noisyCorrelations: number[] = []
    const completeOverlaps: number[] = []
    const missingOverlaps: number[] = []
    const uniqueSeparations: number[] = []
    const periodicSeparations: number[] = []
    const mean = (values: readonly number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length

    for (let scenario = 0; scenario < 64; scenario++) {
      const length = 128
      const shift = Math.floor(random() * 9) - 4
      const reference = Array.from({ length }, () => random() * 2 - 1)
      const cleanCandidate = new Array<number>(length).fill(Number.NaN)
      const noisyCandidate = new Array<number>(length).fill(Number.NaN)
      for (let index = 0; index < length; index++) {
        const shiftedIndex = index + shift
        if (shiftedIndex < 0 || shiftedIndex >= length) continue
        cleanCandidate[shiftedIndex] = reference[index] + (random() - 0.5) * 0.1
        noisyCandidate[shiftedIndex] = reference[index] + (random() - 0.5) * 1.6
        if (random() < 0.25) noisyCandidate[shiftedIndex] = Number.NaN
      }
      const options = {
        referenceTimestampMs: 0,
        candidateTimestampMs: 1000,
        maxAngularSpeedDegPerSecond: 8,
        degreesPerSample: 1,
        minOverlapRatio: 0.5,
      }
      const clean = trackProfileShift(reference, cleanCandidate, options)
      const noisy = trackProfileShift(reference, noisyCandidate, options)
      const periodicReference = Array.from(
        { length },
        (_, index) => Math.sin((index * Math.PI) / 4) + (random() - 0.5) * 0.04
      )
      const periodicCandidate = Array.from(
        { length },
        (_, index) => Math.sin((index * Math.PI) / 4) + (random() - 0.5) * 0.04
      )
      const periodicResult = trackProfileShift(
        periodicReference,
        periodicCandidate,
        { ...options, maxAngularSpeedDegPerSecond: 12 }
      )

      expect(clean.accepted).toBe(true)
      expect(noisy.accepted).toBe(true)
      expect(periodicResult.accepted).toBe(true)
      cleanCorrelations.push(clean.confidenceEvidence?.correlation as number)
      noisyCorrelations.push(noisy.confidenceEvidence?.correlation as number)
      completeOverlaps.push(clean.confidenceEvidence?.overlapRatio as number)
      missingOverlaps.push(noisy.confidenceEvidence?.overlapRatio as number)
      uniqueSeparations.push(
        clean.confidenceEvidence?.fisherPeakSeparation as number
      )
      periodicSeparations.push(
        periodicResult.confidenceEvidence?.fisherPeakSeparation as number
      )
    }

    expect(mean(cleanCorrelations)).toBeGreaterThan(mean(noisyCorrelations))
    expect(mean(completeOverlaps)).toBeGreaterThan(mean(missingOverlaps))
    expect(mean(uniqueSeparations)).toBeGreaterThan(mean(periodicSeparations))
  })

  test('显式置信度策略逐项暴露低质量证据', () => {
    const evidence: FeatureTrackingConfidenceEvidence = {
      correlation: 0.7,
      overlapRatio: 0.75,
      peakProminence: 0.03,
      fisherPeakSeparation: 1.2,
      peakAtSearchBoundary: false,
      equivalentPeakCount: 1,
    }
    const result = evaluateFeatureTrackingConfidence(evidence, {
      minimumCorrelation: 0.8,
      minimumOverlapRatio: 0.8,
      minimumPeakProminence: 0.05,
      minimumFisherPeakSeparation: 2,
    })

    expect(result).toEqual({
      accepted: false,
      violations: [
        'correlation',
        'overlapRatio',
        'peakProminence',
        'fisherPeakSeparation',
      ],
      rejectReason: 'lowConfidence',
    })
  })

  test('仅在存在竞争峰时要求可用的 Fisher 分离度', () => {
    const baseEvidence: FeatureTrackingConfidenceEvidence = {
      correlation: 0.95,
      overlapRatio: 0.9,
      peakProminence: null,
      fisherPeakSeparation: null,
      peakAtSearchBoundary: false,
      equivalentPeakCount: 1,
    }
    const limits = {
      minimumCorrelation: 0.9,
      minimumOverlapRatio: 0.8,
      minimumFisherPeakSeparation: 2,
    }

    expect(
      evaluateFeatureTrackingConfidence(baseEvidence, limits).accepted
    ).toBe(true)
    expect(
      evaluateFeatureTrackingConfidence(
        { ...baseEvidence, peakProminence: 0.1 },
        limits
      ).violations
    ).toEqual(['fisherPeakSeparationUnavailable'])
  })

  test('拒绝非法证据和非法置信度门限', () => {
    const evidence: FeatureTrackingConfidenceEvidence = {
      correlation: 0.9,
      overlapRatio: 0.9,
      peakProminence: null,
      fisherPeakSeparation: null,
      peakAtSearchBoundary: false,
      equivalentPeakCount: 1,
    }
    expect(
      evaluateFeatureTrackingConfidence(
        { ...evidence, correlation: Number.NaN },
        { minimumCorrelation: 0.8, minimumOverlapRatio: 0.8 }
      ).rejectReason
    ).toBe('invalidEvidence')
    expect(
      evaluateFeatureTrackingConfidence(evidence, {
        minimumCorrelation: 0.8,
        minimumOverlapRatio: 0,
      }).rejectReason
    ).toBe('invalidLimits')
  })
})
