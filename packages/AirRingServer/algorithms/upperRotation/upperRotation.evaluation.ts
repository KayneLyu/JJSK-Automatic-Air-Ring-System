import { type TripSegment } from '../../types'

export type ExpandedPoint = { t: number; y: number; offsetDeg: number }

/**
 * 梯形速度曲线归一化位置
 * @param progress 行程进度 [0, 1]
 * @param accelRatio 加速段占比
 */
export const trapezoidalPosition = (
  progress: number,
  accelRatio: number
): number => {
  const normFactor = 1 / (1 - accelRatio)
  let raw: number
  if (progress < accelRatio) {
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - accelRatio) {
    const lp = (progress - (1 - accelRatio)) / accelRatio
    raw =
      0.5 * accelRatio +
      (1 - 2 * accelRatio) +
      (lp - 0.5 * lp * lp) * accelRatio
  } else {
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }
  return raw * normFactor
}

export const evaluateDirect = (
  segs: {
    data: readonly ExpandedPoint[]
    duration: number
    accelRatio: number
  }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  if (!segs || segs.length === 0) return Infinity

  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0,
    tY2 = 0,
    tN = 0

  const add = (idx: number, y: number) => {
    const n = ++bc[idx]
    const d = y - bm[idx]
    bm[idx] += d / n
    b2[idx] += d * (y - bm[idx])
  }

  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  try {
    for (const { data, duration, accelRatio } of segs) {
      if (!data || data.length === 0) continue

      for (const p of data) {
        if (isNaN(p.y)) continue

        // 仅使用梯形速度曲线映射时间→角度，不加入 offsetDeg
        const phi =
          trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad
        const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        add(Math.floor(np / bw) % NUM_BINS, p.y)
        tY += p.y
        tY2 += p.y * p.y
        tN++
      }
    }
  } catch (err) {
    console.error('[UpperRotation] evaluateDirect 计算异常:', err)
    return Infinity
  }

  let tv = 0,
    vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue
    tv += b2[i] / bc[i]
    vc++
  }

  if (vc === 0 || tN < 2) {
    return Infinity
  }

  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

/**
 * 展开数据的 bin 方差法（带梯形速度曲线修正）
 */
export const evaluateExpanded = (
  segs: {
    data: readonly ExpandedPoint[]
    duration: number
    accelRatio: number
  }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  if (!segs || segs.length === 0) return Infinity

  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0,
    tY2 = 0,
    tN = 0

  const add = (idx: number, y: number) => {
    const n = ++bc[idx]
    const d = y - bm[idx]
    bm[idx] += d / n
    b2[idx] += d * (y - bm[idx])
  }

  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  try {
    for (const { data, duration, accelRatio } of segs) {
      if (!data || data.length === 0) continue

      for (const p of data) {
        if (isNaN(p.y)) continue

        // 使用梯形速度曲线精确映射时间→角度
        const phi =
          trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad +
          (p.offsetDeg * Math.PI) / 180
        const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        add(Math.floor(np / bw) % NUM_BINS, p.y)
        tY += p.y
        tY2 += p.y * p.y
        tN++
      }
    }
  } catch (err) {
    console.error('[UpperRotation] evaluateExpanded 计算异常:', err)
    return Infinity
  }

  let tv = 0,
    vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue
    tv += b2[i] / bc[i]
    vc++
  }

  if (vc === 0 || tN < 2) {
    console.warn(`[UpperRotation] 数据不足: vc=${vc}, tN=${tN}，返回无穷值`)
    return Infinity
  }

  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

export const countTotalPoints = (
  segs: Array<{ data: readonly ExpandedPoint[] }>
): number => segs.reduce((acc, seg) => acc + seg.data.length, 0)

export const buildFlippedMeasurements = (seg: TripSegment): TripSegment['measurements'] =>
  seg.isForward
    ? seg.measurements
    : seg.measurements.map((point) => ({ ...point, t: seg.duration - point.t }))
