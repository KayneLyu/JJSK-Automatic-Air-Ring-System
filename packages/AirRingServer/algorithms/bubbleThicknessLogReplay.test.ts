import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  reconstructBubbleThickness,
  type MeasurementTriple,
} from './bubbleThicknessReconstruction'
import { trapezoidalPosition } from './upperRotation/upperRotation.evaluation'

const LOGS_DIR =
  process.env.AIR_RING_LOGS_DIR ?? 'C:/Users/zane/Downloads/logs'

const MAY22_THICKNESS_LOGS = [
  path.join(LOGS_DIR, 'thickness', 'thickness-modbus-2026-05-22-12.log.gz'),
  path.join(LOGS_DIR, 'thickness', 'thickness-modbus-2026-05-22-13.log'),
]
const JUNE10_THICKNESS_LOGS = [
  path.join(LOGS_DIR, 'thickness', 'thickness-adbox-2026-06-10-15.log'),
]
const MAY22_AIR_RING_LOG = path.join(
  LOGS_DIR,
  'airRing',
  'upper-rotation-s7-2026-05-22.log'
)
const JUNE10_AIR_RING_LOG = path.join(
  LOGS_DIR,
  'airRing',
  'upper-rotation-s7-2026-06-10.log'
)

const hasMay22Logs =
  MAY22_THICKNESS_LOGS.some((f) => fs.existsSync(f)) &&
  fs.existsSync(MAY22_AIR_RING_LOG)
const hasJune10Logs =
  JUNE10_THICKNESS_LOGS.some((f) => fs.existsSync(f)) &&
  fs.existsSync(JUNE10_AIR_RING_LOG)

type ThicknessPoint = {
  timestamp: number
  ProbeValue: number | null
  HorizontalPulse: number | null
}

type AirRingPoint = {
  timestamp: number
  ForwardRotation: boolean
  ReverseRotation: boolean
}

const readJsonLines = (filePath: string): Record<string, unknown>[] => {
  if (!fs.existsSync(filePath)) {
    console.warn(`文件不存在: ${filePath}`)
    return []
  }
  const buffer = filePath.endsWith('.gz')
    ? zlib.gunzipSync(fs.readFileSync(filePath))
    : fs.readFileSync(filePath)
  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter((line) => line.trim())
  console.log(`读取文件 ${path.basename(filePath)}: ${lines.length} 行`)
  return lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((obj): obj is Record<string, unknown> => obj !== null)
}

const parseThicknessLog = (filePath: string): ThicknessPoint[] => {
  const records = readJsonLines(filePath)
  const points: ThicknessPoint[] = []

  for (const record of records) {
    if (!record.timestamp) continue
    const lineTs = new Date(record.timestamp as string).getTime()
    if (!Number.isFinite(lineTs)) continue

    const message = record.message as Record<string, unknown> | undefined
    if (!message) continue
    const data = message.data as Record<string, unknown> | undefined
    if (!data) continue

    const adValues = data.adValues as number[] | undefined
    const pulses = data.pulses as number[] | undefined

    if (!adValues || !pulses) continue

    for (let i = 0; i < adValues.length; i++) {
      const probeValue = adValues[i] as number
      const pulse = pulses[i] as number

      if (!Number.isFinite(probeValue) || probeValue <= 0) continue
      if (!Number.isFinite(pulse)) continue

      points.push({
        timestamp: lineTs + (i * 20),
        ProbeValue: probeValue,
        HorizontalPulse: pulse,
      })
    }
  }

  points.sort((a, b) => a.timestamp - b.timestamp)
  return points
}

const parseAirRingLog = (filePath: string): AirRingPoint[] => {
  const records = readJsonLines(filePath)
  const points: AirRingPoint[] = []

  for (const record of records) {
    if (!record.timestamp) continue
    const ts = new Date(record.timestamp as string).getTime()
    if (!Number.isFinite(ts)) continue

    const message = record.message as Record<string, unknown> | undefined
    if (!message || message.event !== 'read') continue

    const data = message.data as Record<string, unknown> | undefined
    if (!data) continue

    points.push({
      timestamp: ts,
      ForwardRotation: Boolean(data.ForwardRotation),
      ReverseRotation: Boolean(data.ReverseRotation),
    })
  }

  points.sort((a, b) => a.timestamp - b.timestamp)
  return points
}

type TripBoundary = { timestamp: number; isForward: boolean }

/** 从上旋方向变化信号检测行程边界（方向切换 = 新行程开始） */
const detectTripBoundaries = (airRingPoints: AirRingPoint[]): TripBoundary[] => {
  const boundaries: TripBoundary[] = []
  let lastForward: boolean | null = null
  for (const p of airRingPoints) {
    if (!p.ForwardRotation && !p.ReverseRotation) continue
    const isForward = p.ForwardRotation && !p.ReverseRotation
    if (lastForward !== null && isForward !== lastForward) {
      boundaries.push({ timestamp: p.timestamp, isForward })
    }
    lastForward = isForward
  }
  return boundaries
}

/**
 * 直接从原始数据构建测量三元组。
 *
 * 关键修正：
 * - 使用梯形速度曲线（trapezoidalPosition）映射时间→上旋角度，而非简单线性映射
 * - pulseToMm 参数化（默认 0.1 = THICKNESS_UNIT_PULSE_DIS）
 */
const buildTriplesFromRawData = (
  thicknessPoints: ThicknessPoint[],
  airRingPoints: AirRingPoint[],
  thetaMaxDeg: number,
  oneWayMs: number,
  pulseToMm: number = 0.1
): MeasurementTriple[] => {
  const boundaries = detectTripBoundaries(airRingPoints)

  if (boundaries.length < 2) {
    console.log('行程边界不足，仅检测到', boundaries.length, '个')
    return []
  }

  console.log(
    `检测到 ${boundaries.length} 个行程边界，thetaMax=${thetaMaxDeg.toFixed(1)}°, oneWay=${(oneWayMs / 1000).toFixed(0)}s`
  )

  const triples: MeasurementTriple[] = []
  let tIdx = 0

  for (let bi = 0; bi < boundaries.length - 1; bi++) {
    const start = boundaries[bi]
    const end = boundaries[bi + 1]
    const tripDuration = end.timestamp - start.timestamp

    if (tripDuration < 60_000 || tripDuration > oneWayMs * 1.5) continue

    const durationSec = tripDuration / 1000
    const accelRatio = Math.min(20000, tripDuration * 0.45) / tripDuration

    while (tIdx < thicknessPoints.length && thicknessPoints[tIdx].timestamp < start.timestamp) {
      tIdx++
    }

    while (
      tIdx < thicknessPoints.length &&
      thicknessPoints[tIdx].timestamp <= end.timestamp
    ) {
      const tp = thicknessPoints[tIdx]
      tIdx++

      if (tp.ProbeValue === null || tp.ProbeValue <= 0) continue
      if (tp.HorizontalPulse === null || !Number.isFinite(tp.HorizontalPulse)) continue

      const tInTrip = tp.timestamp - start.timestamp
      const progress = Math.max(0, Math.min(1, tInTrip / tripDuration))

      // 关键修正：使用梯形速度曲线替代简单线性映射
      const pos = trapezoidalPosition(progress, accelRatio)
      const upperAngle = start.isForward
        ? pos * thetaMaxDeg
        : (1 - pos) * thetaMaxDeg

      triples.push({
        upperAngleDeg: upperAngle,
        scannerPosMm: tp.HorizontalPulse * pulseToMm,
        thickness: tp.ProbeValue,
      })
    }
  }

  return triples
}

const inferThetaMaxAndOneWay = (
  airRingPoints: AirRingPoint[]
): { thetaMaxDeg: number; oneWayMs: number } | null => {
  const boundaries = detectTripBoundaries(airRingPoints)

  if (boundaries.length < 2) return null

  const durations: number[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    durations.push(boundaries[i + 1].timestamp - boundaries[i].timestamp)
  }

  durations.sort((a, b) => a - b)
  const medianDuration = durations[Math.floor(durations.length / 2)]

  for (let oneWayMs = 300_000; oneWayMs <= 600_000; oneWayMs += 60_000) {
    if (Math.abs(medianDuration - oneWayMs) < oneWayMs * 0.3) {
      // 使用 logReplayMaxAngle.test.ts 标定的精确 thetaMax 值
      // May 22: 295.946°, June 10: 306.022°
      // 默认使用保守估计 300°
      return { thetaMaxDeg: 300, oneWayMs }
    }
  }

  return { thetaMaxDeg: 300, oneWayMs: medianDuration }
}

const inferMembraneWidthMm = (
  triples: MeasurementTriple[]
): number | null => {
  const positions = triples.map((t) => t.scannerPosMm)
  if (positions.length < 100) return null

  const sorted = [...positions].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.05)]
  const q3 = sorted[Math.floor(sorted.length * 0.95)]
  const range = q3 - q1

  return range > 0 ? range : null
}

describe('日志重放: 推算膜泡原始厚度', () => {
  test(
    'May 22: 推算膜泡原始厚度分布',
    { timeout: 60_000 },
    () => {
      if (!hasMay22Logs) {
        console.warn('May 22 日志文件不存在，跳过测试')
        return
      }

      const thicknessPoints = MAY22_THICKNESS_LOGS.filter((f) =>
        fs.existsSync(f)
      ).flatMap(parseThicknessLog)
      const airRingPoints = parseAirRingLog(MAY22_AIR_RING_LOG)

      expect(thicknessPoints.length).toBeGreaterThan(1000)
      expect(airRingPoints.length).toBeGreaterThan(100)

      console.log(
        `加载数据: ${thicknessPoints.length} 厚度点, ${airRingPoints.length} 上旋点`
      )

      const params = inferThetaMaxAndOneWay(airRingPoints)
      expect(params).not.toBeNull()
      console.log(
        `推算: thetaMax≈${params!.thetaMaxDeg}°, oneWay≈${(params!.oneWayMs / 1000).toFixed(0)}s`
      )

      const triples = buildTriplesFromRawData(
        thicknessPoints,
        airRingPoints,
        params!.thetaMaxDeg,
        params!.oneWayMs
      )
      expect(triples.length).toBeGreaterThan(1000)
      console.log(`提取 ${triples.length} 个测量三元组`)

      const membraneWidthMm = inferMembraneWidthMm(triples)
      expect(membraneWidthMm).not.toBeNull()
      console.log(`膜泡宽度 ≈ ${membraneWidthMm!.toFixed(0)}mm`)

      const result = reconstructBubbleThickness(
        triples,
        membraneWidthMm!,
        {
          numBins: 48,
          lambda: 0.01,
          processDeformationFactor: 1.02,
        }
      )

      console.log(
        `重建结果: RMS=${result.rmsError.toFixed(3)}, Max=${result.maxError.toFixed(3)}`
      )
      console.log(
        `Profile: [${result.profile.slice(0, 12).map((v) => v.toFixed(1)).join(', ')}...]`
      )

      const outputDir = path.resolve(
        __dirname,
        'tasks/bubble-thickness-reconstruction/scripts/outputs'
      )
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const csvLines = ['binIndex,angleDeg,thickness']
      for (let i = 0; i < result.profile.length; i++) {
        const angleDeg = (i / result.profile.length) * 360
        csvLines.push(
          `${i},${angleDeg.toFixed(2)},${result.profile[i].toFixed(3)}`
        )
      }
      const outputFile = path.join(outputDir, 'may22-profile.csv')
      fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf-8')
      console.log(`Profile 已写入: ${outputFile}`)

      // 真实数据使用原始 AD 计数而非 µm，无校准/出界过滤，RMS 误差较高是预期行为
      const profileMean =
        result.profile.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0) /
        result.profile.filter((v) => !isNaN(v)).length
      const relativeRms = (result.rmsError / profileMean) * 100
      console.log(
        `Profile 均值=${profileMean.toFixed(1)}, 相对 RMS 误差=${relativeRms.toFixed(1)}%`
      )
      // May 22 ModBus 原始 AD 计数，误差上限 60%
      expect(relativeRms).toBeLessThan(60)

      const nonZeroBins = result.profile.filter(
        (v) => !isNaN(v) && v > 0
      ).length
      expect(nonZeroBins).toBeGreaterThan(result.profile.length * 0.5)
    }
  )

  test(
    'June 10: 推算膜泡原始厚度分布',
    { timeout: 120_000 },
    () => {
      if (!hasJune10Logs) {
        console.warn('June 10 日志文件不存在，跳过测试')
        return
      }

      const thicknessPoints = JUNE10_THICKNESS_LOGS.filter((f) =>
        fs.existsSync(f)
      ).flatMap(parseThicknessLog)
      const airRingPoints = parseAirRingLog(JUNE10_AIR_RING_LOG)

      expect(thicknessPoints.length).toBeGreaterThan(1000)
      expect(airRingPoints.length).toBeGreaterThan(100)

      console.log(
        `加载数据: ${thicknessPoints.length} 厚度点, ${airRingPoints.length} 上旋点`
      )

      const params = inferThetaMaxAndOneWay(airRingPoints)
      expect(params).not.toBeNull()
      console.log(
        `推算: thetaMax≈${params!.thetaMaxDeg}°, oneWay≈${(params!.oneWayMs / 1000).toFixed(0)}s`
      )

      const triples = buildTriplesFromRawData(
        thicknessPoints,
        airRingPoints,
        params!.thetaMaxDeg,
        params!.oneWayMs
      )
      expect(triples.length).toBeGreaterThan(1000)
      console.log(`提取 ${triples.length} 个测量三元组`)

      const membraneWidthMm = inferMembraneWidthMm(triples)
      expect(membraneWidthMm).not.toBeNull()
      console.log(`膜泡宽度 ≈ ${membraneWidthMm!.toFixed(0)}mm`)

      const result = reconstructBubbleThickness(
        triples,
        membraneWidthMm!,
        {
          numBins: 48,
          lambda: 0.01,
          processDeformationFactor: 1.02,
        }
      )

      console.log(
        `重建结果: RMS=${result.rmsError.toFixed(3)}, Max=${result.maxError.toFixed(3)}`
      )
      console.log(
        `Profile: [${result.profile.slice(0, 12).map((v) => v.toFixed(1)).join(', ')}...]`
      )

      const outputDir = path.resolve(
        __dirname,
        'tasks/bubble-thickness-reconstruction/scripts/outputs'
      )
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const csvLines = ['binIndex,angleDeg,thickness']
      for (let i = 0; i < result.profile.length; i++) {
        const angleDeg = (i / result.profile.length) * 360
        csvLines.push(
          `${i},${angleDeg.toFixed(2)},${result.profile[i].toFixed(3)}`
        )
      }
      const outputFile = path.join(outputDir, 'june10-profile.csv')
      fs.writeFileSync(outputFile, csvLines.join('\n'), 'utf-8')
      console.log(`Profile 已写入: ${outputFile}`)

      // 真实数据使用原始 AD 计数而非 µm，RMS 以相对误差百分比评估
      const profileMean =
        result.profile.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0) /
        result.profile.filter((v) => !isNaN(v)).length
      const relativeRms = (result.rmsError / profileMean) * 100
      console.log(
        `Profile 均值=${profileMean.toFixed(1)}, 相对 RMS 误差=${relativeRms.toFixed(1)}%`
      )
      // June 10 ADBox 原始 AD 计数，误差上限 80%
      expect(relativeRms).toBeLessThan(80)

      const nonZeroBins = result.profile.filter(
        (v) => !isNaN(v) && v > 0
      ).length
      expect(nonZeroBins).toBeGreaterThan(result.profile.length * 0.5)
    }
  )
})
