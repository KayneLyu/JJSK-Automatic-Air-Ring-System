export type DynamicLocalSearchWindowOptions = {
  featureAngleDeg: number
  uncertaintyComponentsDeg: readonly number[]
  minimumRadiusDeg: number
  globalMinimumAngleDeg: number
  globalMaximumAngleDeg: number
  searchStepDeg: number
  maximumSearchPoints: number
}

export type DynamicLocalSearchWindowResult = {
  accepted: boolean
  featureAngleDeg: number | null
  totalUncertaintyDeg: number | null
  requestedRadiusDeg: number | null
  minimumAngleDeg: number | null
  maximumAngleDeg: number | null
  actualLeftRadiusDeg: number | null
  actualRightRadiusDeg: number | null
  spanDeg: number | null
  plannedSearchPointCount: number | null
  clippedAtMinimum: boolean
  clippedAtMaximum: boolean
  rejectReason:
    | 'invalidOptions'
    | 'featureAngleOutOfRange'
    | 'degenerateWindow'
    | 'searchBudgetExceeded'
    | null
}

/**
 * 根据显式不确定度构造通用目标函数的局部搜索窗口。
 * 不确定度按最坏情况相加，不应用样本拟合权重或固定角度带。
 */
export const buildDynamicLocalSearchWindow = ({
  featureAngleDeg,
  uncertaintyComponentsDeg,
  minimumRadiusDeg,
  globalMinimumAngleDeg,
  globalMaximumAngleDeg,
  searchStepDeg,
  maximumSearchPoints,
}: DynamicLocalSearchWindowOptions): DynamicLocalSearchWindowResult => {
  const rejected = (
    rejectReason: Exclude<DynamicLocalSearchWindowResult['rejectReason'], null>,
    diagnostics: Partial<DynamicLocalSearchWindowResult> = {}
  ): DynamicLocalSearchWindowResult => ({
    accepted: false,
    featureAngleDeg: null,
    totalUncertaintyDeg: null,
    requestedRadiusDeg: null,
    minimumAngleDeg: null,
    maximumAngleDeg: null,
    actualLeftRadiusDeg: null,
    actualRightRadiusDeg: null,
    spanDeg: null,
    plannedSearchPointCount: null,
    clippedAtMinimum: false,
    clippedAtMaximum: false,
    ...diagnostics,
    rejectReason,
  })
  if (
    !Number.isFinite(featureAngleDeg) ||
    uncertaintyComponentsDeg.length === 0 ||
    uncertaintyComponentsDeg.some(
      (component) => !Number.isFinite(component) || component < 0
    ) ||
    !Number.isFinite(minimumRadiusDeg) ||
    minimumRadiusDeg < 0 ||
    !Number.isFinite(globalMinimumAngleDeg) ||
    !Number.isFinite(globalMaximumAngleDeg) ||
    globalMaximumAngleDeg <= globalMinimumAngleDeg ||
    !Number.isFinite(searchStepDeg) ||
    searchStepDeg <= 0 ||
    !Number.isInteger(maximumSearchPoints) ||
    maximumSearchPoints < 2
  ) {
    return rejected('invalidOptions')
  }
  if (
    featureAngleDeg < globalMinimumAngleDeg ||
    featureAngleDeg > globalMaximumAngleDeg
  ) {
    return rejected('featureAngleOutOfRange', { featureAngleDeg })
  }

  const totalUncertaintyDeg = uncertaintyComponentsDeg.reduce(
    (sum, component) => sum + component,
    0
  )
  const requestedRadiusDeg = Math.max(minimumRadiusDeg, totalUncertaintyDeg)
  const requestedMinimum = featureAngleDeg - requestedRadiusDeg
  const requestedMaximum = featureAngleDeg + requestedRadiusDeg
  const minimumAngleDeg = Math.max(globalMinimumAngleDeg, requestedMinimum)
  const maximumAngleDeg = Math.min(globalMaximumAngleDeg, requestedMaximum)
  const spanDeg = maximumAngleDeg - minimumAngleDeg
  const diagnostics = {
    featureAngleDeg,
    totalUncertaintyDeg,
    requestedRadiusDeg,
    minimumAngleDeg,
    maximumAngleDeg,
    actualLeftRadiusDeg: featureAngleDeg - minimumAngleDeg,
    actualRightRadiusDeg: maximumAngleDeg - featureAngleDeg,
    spanDeg,
    plannedSearchPointCount:
      spanDeg > 0 ? Math.ceil(spanDeg / searchStepDeg) + 1 : 0,
    clippedAtMinimum: minimumAngleDeg > requestedMinimum,
    clippedAtMaximum: maximumAngleDeg < requestedMaximum,
  }
  if (spanDeg <= 0) {
    return rejected('degenerateWindow', diagnostics)
  }
  if (diagnostics.plannedSearchPointCount > maximumSearchPoints) {
    return rejected('searchBudgetExceeded', diagnostics)
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
