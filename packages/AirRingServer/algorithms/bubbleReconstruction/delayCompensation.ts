// ============================================================
// 膜泡重建 — 运输延迟补偿
//
// 膜泡从上旋架挤出后经牵引到达测厚仪，延迟 τ 秒。
//
// 角度补偿：
//   θ_eff(t) = θ(t − τ)
//
// 对于匀速上旋（ω 恒定）：
//   θ_eff(t) = θ(t) − ω·τ
//
// 【参数分类】
//   τ    — 标定参数（由运输距离÷牵引速度标定）
//   ω(t) — 在线辨识参数（由相位估计算法估计）
// ============================================================

/**
 * 对测量序列进行运输延迟补偿
 *
 * 将每个测量的 upperAngleDeg 向前修正 τ 秒：
 *   correctedAngleDeg = rawAngleDeg − ω_avg × τ
 *
 * @param measurements       原始测量序列
 * @param transportDelaySec  运输延迟 τ (s)
 * @param rotationSpeedDegPerSec 平均上旋角速度 ω (°/s)
 * @returns 角度修正后的测量序列
 */
export const compensateTransportDelay = <T extends { upperAngleDeg: number }>(
  measurements: T[],
  transportDelaySec: number,
  rotationSpeedDegPerSec: number
): T[] => {
  const angleCorrection = rotationSpeedDegPerSec * transportDelaySec
  return measurements.map((m) => ({
    ...m,
    upperAngleDeg: ((m.upperAngleDeg - angleCorrection) % 360 + 360) % 360,
  }))
}

/**
 * 基于时间戳的精确延迟补偿
 *
 * 当上旋角速度非均匀时，使用时间戳进行逐点补偿：
 *   θ_eff(t_k) = θ(t_k − τ)
 *   通过查找或插值获得 θ(t_k − τ)
 *
 * @param timeStampedMeasurements 带时间戳的测量
 * @param transportDelaySec       运输延迟 τ (s)
 * @param angleTimeSeries         上旋角时间序列 { t: seconds, theta: degrees }[]
 * @returns 角度修正后的测量
 */
export const compensateTransportDelayTimeStamp = <T extends { upperAngleDeg: number }>(
  measurements: T[],
  transportDelaySec: number,
  angleTimeSeries: { t: number; theta: number }[]
): T[] => {
  if (angleTimeSeries.length < 2) {
    return measurements
  }

  return measurements.map((m, idx) => {
    const tCurrent = angleTimeSeries[idx]?.t ?? idx * transportDelaySec
    const tTarget = tCurrent - transportDelaySec

    // 二分查找最近的时间点
    let lo = 0, hi = angleTimeSeries.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (angleTimeSeries[mid].t <= tTarget) lo = mid
      else hi = mid
    }

    let thetaAtDelay: number
    if (Math.abs(angleTimeSeries[lo].t - tTarget) < 1e-3) {
      thetaAtDelay = angleTimeSeries[lo].theta
    } else if (lo + 1 < angleTimeSeries.length) {
      const t0 = angleTimeSeries[lo].t
      const t1 = angleTimeSeries[lo + 1].t
      const w = (tTarget - t0) / (t1 - t0)
      thetaAtDelay = angleTimeSeries[lo].theta * (1 - w) + angleTimeSeries[lo + 1].theta * w
    } else {
      thetaAtDelay = angleTimeSeries[lo].theta
    }

    return {
      ...m,
      upperAngleDeg: ((thetaAtDelay) % 360 + 360) % 360,
    }
  })
}

/**
 * 估计平均上旋角速度
 *
 * 从连续的上旋角估计序列中计算平均角速度
 *
 * @param thetaEstimates 上旋角估计值序列 (°)
 * @param timeIntervalSec 时间间隔 (s)
 * @returns 平均角速度 (°/s)
 */
export const estimateRotationSpeed = (
  thetaEstimates: number[],
  timeIntervalSec: number
): number => {
  if (thetaEstimates.length < 2) return 0

  let totalDelta = 0
  for (let i = 1; i < thetaEstimates.length; i++) {
    let delta = thetaEstimates[i] - thetaEstimates[i - 1]
    // 处理角度回绕
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    totalDelta += delta
  }

  return Math.abs(totalDelta) / ((thetaEstimates.length - 1) * timeIntervalSec)
}
