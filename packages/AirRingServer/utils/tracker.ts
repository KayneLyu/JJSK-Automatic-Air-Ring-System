import type { ThicknessData } from '../connections/thickness/types'
import type { RingData } from '../connections/airRing/types'

interface FullRingData extends RingData {
  angle?: number
}
export const tracker = (
  data: {
    thickness: ThicknessData[]
    airRing: FullRingData[]
  },
  options: {
    /**
     * 上旋电机速率 即每Hz旋转多少圈rpm
     * */
    UP_FREQ_TO_RPS: number
  }
) => {
  const { airRing, thickness } = data
  const { UP_FREQ_TO_RPS } = options
  /*最大旋转角度*/
  let maxAngle = 0
  for (let i = 1; i < airRing.length; i++) {
    const pre = airRing[i - 1]
    const cur = airRing[i]
    if (!(pre.timestamp && cur.timestamp)) continue
    const dt = (cur.timestamp - pre.timestamp) / 1000

    const freq = cur.MotorFrequency ?? 0
    const direction = cur.ForwardRotation ? 1 : cur.ReverseRotation ? -1 : 0

    // 积分计算角度
    cur.angle =
      (pre.angle || 0) + 2 * Math.PI * freq * UP_FREQ_TO_RPS * direction * dt

    // 换向点更新
    if (cur.ForwardDirectionChange || cur.ReverseDirectionChange) {
      if (cur.angle > maxAngle) {
        maxAngle = cur.angle
      }
    }
  }

  const thicknessProfiles = extractThicknessProfile(thickness)
  const info = calculateThicknessStats(thicknessProfiles)
  return {
    maxAngle,
  }
}

export interface ThicknessProfilePoint {
  position: number // 横向位置（脉冲或 mm）
  thickness: number // 厚度（μm）
}
/**
 * 从原始测厚仪数据中提取薄膜厚度分布（以脉冲为横坐标单位）
 * @param rawData 原始数据流（按时间顺序）
 * @param options 配置选项
 * @returns 厚度分布数组 [{ position: 脉冲数, thickness: μm }]
 */
const extractThicknessProfile = (
  rawData: ThicknessData[],
  options: {
    useBidirectional?: boolean // 是否融合正反向数据（默认 false：仅用正向）
    binSize?: number // 融合时的位置分箱大小（脉冲数，默认 10）
    discardTurnaround?: boolean // 是否尝试丢弃换向区（简单策略）
  } = {}
): { position: number; thickness: number }[] => {
  const {
    useBidirectional = false,
    binSize = 10,
    discardTurnaround = false,
  } = options

  // Step 1: 找到零点偏移（优先用 ResetSignal，其次用第一个 LeftLimit）
  let zeroOffset: number | null = null
  for (const d of rawData) {
    if (d.ResetSignal && d.HorizontalPulse != null) {
      zeroOffset = d.HorizontalPulse
      break
    }
  }
  if (zeroOffset === null) {
    const firstLeft = rawData.find(
      (d) => d.LeftLimit && d.HorizontalPulse != null
    )
    zeroOffset = firstLeft?.HorizontalPulse ?? 0
  }

  // Step 2: 过滤有效测量点
  const validPoints: {
    position: number
    thickness: number
    direction: boolean // true = forward
    isTurnaround?: boolean
  }[] = []

  if (discardTurnaround) {
    // 标记所有 SwapDirection 为 true 的索引
    const swapIndices = rawData
      .map((d, i) => (d.SwapDirection ? i : -1))
      .filter((i) => i !== -1)
    // 简单策略：前后各丢 20 点（可根据需要调整）
    const turnaroundRange = new Set<number>()
    for (const idx of swapIndices) {
      for (
        let j = Math.max(0, idx - 20);
        j <= Math.min(rawData.length - 1, idx + 20);
        j++
      ) {
        turnaroundRange.add(j)
      }
    }
    rawData.forEach((d, i) => {
      if (
        d.ProbeValue != null &&
        d.HorizontalPulse != null &&
        Boolean(d.RollSpeedSignal)
      ) {
        validPoints.push({
          position: d.HorizontalPulse - zeroOffset!,
          thickness: d.ProbeValue,
          direction: d.MotionDirection ?? true,
          isTurnaround: turnaroundRange.has(i),
        })
      }
    })
    // 丢弃换向区
    validPoints.filter((p) => !p.isTurnaround)
  } else {
    rawData.forEach((d) => {
      if (
        d.ProbeValue != null &&
        d.HorizontalPulse != null &&
        Boolean(d.RollSpeedSignal)
      ) {
        validPoints.push({
          position: d.HorizontalPulse - zeroOffset!,
          thickness: d.ProbeValue,
          direction: d.MotionDirection ?? true,
        })
      }
    })
  }

  // Step 3: 选择数据模式
  let selectedPoints: ThicknessProfilePoint[]

  if (useBidirectional) {
    // 双向融合：分箱平均
    const bins = new Map<number, number[]>()
    for (const p of validPoints) {
      const binKey = Math.round(p.position / binSize) * binSize
      if (!bins.has(binKey)) bins.set(binKey, [])
      bins.get(binKey)!.push(p.thickness)
    }
    selectedPoints = Array.from(bins.entries()).map(([position, values]) => ({
      position,
      thickness: values.reduce((a, b) => a + b, 0) / values.length,
    }))
  } else {
    // 单向：仅保留正向（MotionDirection === true）
    selectedPoints = validPoints
      .filter((p) => p.direction)
      .map(({ position, thickness }) => ({ position, thickness }))
  }

  // Step 4: 按位置排序
  selectedPoints.sort((a, b) => a.position - b.position)

  return selectedPoints
}

export interface ThicknessStats {
  meanThickness: number // 平均厚度 (μm)
  maxDeviation: number // 最大偏差 (μm)
  cvPercent: number // 变异系数 (%)
  minThickness: number // 最小厚度 (μm)
  maxThickness: number // 最大厚度 (μm)
  stdDeviation: number // 标准差 (μm)
  validPointCount: number // 有效点数
}
/**
 * 计算厚度分布的质量统计指标
 * @param profile 厚度分布数据（必须非空且 thickness > 0）
 * @returns 统计结果
 */
export const calculateThicknessStats = (
  profile: ThicknessProfilePoint[]
): ThicknessStats | null => {
  if (profile.length === 0) {
    return null
  }

  // 过滤无效值（如负数或 NaN）
  const validThicknesses = profile
    .map((p) => p.thickness)
    .filter((t) => !isNaN(t) && t > 0)

  if (validThicknesses.length === 0) {
    return null
  }

  const n = validThicknesses.length
  const sum = validThicknesses.reduce((a, b) => a + b, 0)
  const mean = sum / n

  if (mean <= 0) {
    return null
  }

  // 计算标准差
  const variance =
    validThicknesses.reduce((acc, val) => {
      return acc + Math.pow(val - mean, 2)
    }, 0) / n // 使用总体标准差（非样本）
  const stdDev = Math.sqrt(variance)

  // 最大/最小厚度
  const minThickness = Math.min(...validThicknesses)
  const maxThickness = Math.max(...validThicknesses)

  // 最大偏差（相对于均值）
  const maxDeviation = Math.max(
    Math.abs(maxThickness - mean),
    Math.abs(minThickness - mean)
  )

  // 变异系数（%）
  const cvPercent = (stdDev / mean) * 100

  return {
    meanThickness: Number(mean.toFixed(3)),
    maxDeviation: Number(maxDeviation.toFixed(3)),
    cvPercent: Number(cvPercent.toFixed(3)),
    minThickness: Number(minThickness.toFixed(3)),
    maxThickness: Number(maxThickness.toFixed(3)),
    stdDeviation: Number(stdDev.toFixed(3)),
    validPointCount: n,
  }
}
