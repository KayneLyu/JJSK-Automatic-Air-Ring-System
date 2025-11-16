import { ScanSegment } from '../controllers/common/thickness'

/**
 * 查找厚度凹陷处
 * */
export const findSignificantDip = (
  seg: ScanSegment
): { found: boolean; position: number } => {
  const values = seg.points.map((p) => p.thickness)
  const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length
  const std = Math.sqrt(
    values.reduce((sum: number, v: number) => sum + Math.pow(v - avg, 2), 0) /
      values.length
  )

  // 找最低点
  let minIndex = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[minIndex]) minIndex = i
  }

  const dipValue = values[minIndex]
  const isSignificant = avg - dipValue > 0.8 * std && dipValue < avg * 0.92

  return {
    found: isSignificant,
    position: seg.points[minIndex].position,
  }
}
