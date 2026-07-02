import type { MeasurementTriple } from './bubbleReconstruction/types'

export type MeasurementTripleInput = MeasurementTriple & { timestamp: number }

export interface SweepPointLike {
  readonly ts: number
  readonly pulse: number
  readonly ad: number
}

export interface SweepSummaryLike {
  readonly sweepId: string
  readonly startTs: number
  readonly endTs: number
  readonly direction: 'forward' | 'reverse'
}

export interface RotationTripLike {
  readonly time: number
  readonly direction: 'forward' | 'reverse'
  readonly cycleDurationMs: number
}

export interface UpperSweepGapStats {
  readonly totalSweeps: number
  readonly gapCount: number
  readonly maxGapMs: number
  readonly totalGapMs: number
}

export interface MeasurementBuildStats {
  readonly totalSamples: number
  readonly droppedLateCount: number
  readonly droppedLateRatio: number
  readonly edgeRejectedCount: number
  readonly edgeRejectedRatio: number
  readonly transportDelayMs: number
  readonly totalMeasurements: number
}

export interface MeasurementBuildResult {
  readonly measurements: MeasurementTripleInput[]
  readonly stats: MeasurementBuildStats
}

export interface SeparationStats {
  readonly min: number
  readonly max: number
  readonly p95: number
  readonly mean: number
}

export interface ThetaCoverageStats {
  readonly min: number
  readonly max: number
  readonly p05: number
  readonly p95: number
  readonly span: number
  readonly ratio: number
}

export interface AirADFallbackSuggestion {
  readonly suggestedAirAD: number
  readonly p99Ad: number
  readonly aboveRatio: number
  readonly belowRatio: number
}

export interface UpperSweepCoverage {
  readonly startTs: number
  readonly endTs: number
}

export interface MeasurementParams {
  readonly membraneWidthMm: number
  readonly mmPerPulse: number
  readonly thetaMaxDeg: number
}

export interface SweepPulseBounds {
  readonly min: number
  readonly max: number
}
