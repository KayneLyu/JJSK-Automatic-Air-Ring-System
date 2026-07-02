import type {
  BubbleWindowReconstructionResult,
  MeasurementTripleInput,
  RotationTripSummaryRow,
  SweepSummaryRow,
} from '@/types/ipc'

/** baseline 的重构结果 */
export interface ReconstructedSweep {
  baseline: SweepSummaryRow
  windowIds: string[]
  result: BubbleWindowReconstructionResult
  /** 重构用的样本数 */
  numSamples: number
}

export interface DeviceConstants {
  airAD?: string
  materialGain?: string
}

export interface UpperSweepGapStats {
  droppedLateCount: number
  maxDroppedLateGapMs: number
  afterEndCount: number
  maxAfterEndGapMs: number
  beforeFirstCount: number
  maxBeforeFirstGapMs: number
}

export interface MeasurementBuildStats {
  totalSamples: number
  rawMeasurementCount: number
  edgeRejectedCount: number
  edgeRejectedRatio: number
  droppedLateCount: number
  droppedLateRatio: number
  transportDelayMs: number
}

export interface MeasurementBuildResult {
  measurements: MeasurementTripleInput[]
  stats: MeasurementBuildStats
}

export interface SeparationStats {
  p95: number
  max: number
}

export interface ThetaCoverageStats {
  p05: number
  p95: number
  span: number
  ratio: number
}

export interface AirADFallbackSuggestion {
  suggestedAirAD: number
  aboveRatio: number
  p99Ad: number
}

export interface SweepPulseBounds {
  membranePulseMin?: number | null
  membranePulseMax?: number | null
}

export interface UpperSweepCoverage {
  startTs: number
  endTs: number
}

/** buildMeasurements 所需的上旋与几何参数 */
export interface MeasurementParams {
  membraneWidthMm: number
  mmPerPulse: number
  thetaMaxDeg: number
}
