/**
 * 扫描趟重建纯计算工具兼容出口。
 *
 * 实现已迁移到 @jjsk/air-ring-server/algorithms/scannerPreprocessing。
 */

export {
  buildMeasurements,
  estimateCoverageRatio,
  estimatePhiSeparationStats,
  estimateThetaCoverageStats,
  findUpperSweepAt,
  getUpperSweepsCoverage,
  getWindowTrips,
  mergeMeasurementBuildResults,
  suggestFallbackAirAD,
} from '@jjsk/air-ring-server/algorithms/scannerPreprocessing'
export type {
  AirADFallbackSuggestion,
  MeasurementBuildResult,
  MeasurementParams,
  MeasurementTripleInput,
  SeparationStats,
  SweepPulseBounds,
  ThetaCoverageStats,
  UpperSweepCoverage,
} from '@jjsk/air-ring-server/algorithms/scannerPreprocessing.types'
