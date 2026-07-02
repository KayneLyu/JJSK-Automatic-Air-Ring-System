/**
 * 测厚仪相关算法
 * */

import { WithRequired } from '@jjsk/core'
import type { ThicknessData } from '../connections/thickness/types'

export interface ScanSegment {
  startTime: number
  endTime: number
  direction: 'left-to-right' | 'right-to-left'
  points: { timestamp: number; position: number; thickness: number }[]
}

/**
 * 提取扫描片段
 * */
export const extractScanSegments = (data: ThicknessData[]): ScanSegment[] => {
  const valid = data.filter((d) => d.timestamp != null && d.ProbeValue != null)
  if (valid.length === 0) return []

  const segments: ScanSegment[] = []
  let current: Omit<ScanSegment, 'startTime' | 'endTime'> | null = null
  let lastPulse: number | null = null
  let pulses: number[] = []

  for (const d of valid) {
    const ts = d.timestamp!
    const pulse = d.HorizontalPulse ?? 0

    // 记录脉冲用于归一化
    pulses.push(pulse)

    // 检测换向或限位触发新段
    const isNewSegment =
      d.SwapDirection ||
      d.LeftLimit ||
      d.RightLimit ||
      (lastPulse !== null && Math.abs(pulse - lastPulse) > 1e5) // 脉冲跳变（归零）

    if (isNewSegment && current) {
      // 结束上一段
      if (current.points.length > 10) {
        const minP = Math.min(...pulses.slice(-current.points.length))
        const maxP = Math.max(...pulses.slice(-current.points.length))
        const normalizedPoints = current.points.map((p) => ({
          ...p,
          position:
            maxP === minP
              ? 0.5
              : (pulses[
                  pulses.length -
                    current!.points.length +
                    current!.points.indexOf(p)
                ] -
                  minP) /
                (maxP - minP),
        }))
        segments.push({
          startTime: normalizedPoints[0].timestamp,
          endTime: normalizedPoints[normalizedPoints.length - 1].timestamp,
          direction: d.MotionDirection ? 'left-to-right' : 'right-to-left',
          points: normalizedPoints,
        })
      }
      current = null
      pulses = [pulse]
    }

    if (!current) {
      current = {
        points: [],
        direction: d.MotionDirection ? 'left-to-right' : 'right-to-left',
      }
    }

    current.points.push({
      timestamp: ts,
      position: 0, // 临时，后续归一化
      thickness: d.ProbeValue!,
    })

    lastPulse = pulse
  }

  // 处理最后一段
  if (current && current.points.length > 10) {
    const pts = pulses.slice(-current.points.length)
    const minP = Math.min(...pts)
    const maxP = Math.max(...pts)
    const normalizedPoints = current.points.map((p, i) => ({
      ...p,
      position: maxP === minP ? 0.5 : (pts[i] - minP) / (maxP - minP),
    }))
    segments.push({
      startTime: normalizedPoints[0].timestamp,
      endTime: normalizedPoints[normalizedPoints.length - 1].timestamp,
      direction: current.direction,
      points: normalizedPoints,
    })
  }

  return segments
}

/**
 * 计算牵引速度，平滑算法
 * @param data 测厚仪数据
 * @param Circumference 辊周长，单位：mm
 * @param numCycles 使用最近 N 圈计算平均速度
 * @param maxIntervalMs 最大允许脉冲间隔（防停机误判，默认 10_000 ms = 10秒）
 * @returns 速度（mm/s），若无法计算则返回 null
 * */
export const computeTractionSpeedSmooth = (
  data: ThicknessData[],
  Circumference: number,
  numCycles: number = 10, // 使用最近 N 圈计算平均速度
  maxIntervalMs: number = 10_000
): number | null => {
  if (data.length === 0) return null

  // Step 1: 按时间排序（确保时序正确）
  const sorted = (
    data.filter((d) => !!d.timestamp) as WithRequired<
      ThicknessData,
      'timestamp'
    >[]
  ).sort((a, b) => a.timestamp - b.timestamp)

  // Step 2: 检测上升沿（false → true），记录上升沿时间戳
  const risingEdgeTimes: number[] = []
  let prevSignal: boolean | null = null

  for (const item of sorted) {
    const currentSignal = Boolean(item.RollSpeedSignal) // 容错：转为布尔

    if (prevSignal === false && currentSignal) {
      // 上升沿：记录当前时间戳作为一圈的开始
      risingEdgeTimes.push(item.timestamp)
    }

    prevSignal = currentSignal
  }
  // Step 3: 检查是否有足够圈数（需要 N+1 个边沿才能算 N 圈）
  if (risingEdgeTimes.length < numCycles + 1) {
    return null
  }

  const recentPulses = risingEdgeTimes.slice(-(numCycles + 1))
  const totalDistance = Circumference * numCycles
  const totalTime_ms = recentPulses[recentPulses.length - 1] - recentPulses[0]

  if (totalTime_ms <= 0 || totalTime_ms > maxIntervalMs * numCycles) {
    return null
  }

  return (totalDistance * 1000) / totalTime_ms // mm/s
}

// ============================================================
// AD → μm 转换
//
// X光指数吸收模型 + 二次工业拟合
// 标定样本来源：0~290μm 实际标定数据
// 精度：RMS ≈ 0.35μm
// ============================================================

/**
 * X光测厚计算配置
 */
export interface ThicknessCalcConfig {
  /** 空气AD值 (例如 50300) */
  airAD: number
  /**
   * 材料补偿倍率 (默认 1.0)
   *
   * PE → 1.00, PP → 1.05, EVA → 0.96
   */
  gain?: number
}

/**
 * 根据 ADBox 原始光通量 (AD) 计算薄膜厚度 (μm)
 *
 * 公式：Thickness = (9.65·x² + 243.08·x − 0.087) × gain
 * 其中 x = ln(airAD / ad)
 */
export const calcThickness = (ad: number, config: ThicknessCalcConfig): number => {
  const { airAD, gain = 1.0 } = config

  if (ad <= 0 || ad >= airAD) return 0

  const x = Math.log(airAD / ad)
  const baseThickness = 9.65 * x * x + 243.08 * x - 0.087

  return Math.max(0, baseThickness * gain)
}
