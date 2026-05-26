import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { mockRoller } from '@jjsk/simulation'
import { buildTripSegment } from '../../buildTripSegment'
import { estimateThetaMaxWithPhaseCorrection } from '../upperRotation'

type UpperPoint = {
  ForwardRotation: boolean
  ReverseRotation: boolean
  timestamp: number
}

type ThicknessPoint = {
  HorizontalPulse: number
  ProbeValue: number
  MotionDirection: boolean
  timestamp: number
}

type ReplayEvent =
  | { kind: 'upper'; data: UpperPoint }
  | { kind: 'thickness'; data: ThicknessPoint }

const LOG_ROOT = '/Users/zane/Downloads/logs'
const THICKNESS_LOG = path.join(
  LOG_ROOT,
  'thickness',
  'thickness-2026-05-08.log'
)
const AIR_RING_LOG = path.join(
  LOG_ROOT,
  'airRing',
  'upper-rotation-2026-05-08.log'
)
const LOG_ROOT_3 = '/Users/zane/Downloads/logs 3'
const MAY22_THICKNESS_LOGS = [
  path.join(LOG_ROOT_3, 'thickness', 'thickness-modbus-2026-05-22-12.log.gz'),
  path.join(LOG_ROOT_3, 'thickness', 'thickness-modbus-2026-05-22-13.log'),
]
const MAY22_AIR_RING_LOG = path.join(
  LOG_ROOT_3,
  'airRing',
  'upper-rotation-s7-2026-05-22.log'
)

const readLogText = (filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  if (filePath.endsWith('.gz')) {
    return zlib.gunzipSync(buffer).toString('utf-8')
  }
  return buffer.toString('utf-8')
}

const safeParseJsonLine = (line: string) => {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

const normalizeThicknessTimestamp = (
  relativeTimestampMs: number,
  nowMs: number,
  latestTimestamp?: number
) => {
  const now = new Date(nowMs)
  const dayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  )

  let candidate = dayStartMs + relativeTimestampMs

  if (latestTimestamp !== undefined) {
    const dayMs = 24 * 60 * 60 * 1000
    const delta = candidate - latestTimestamp

    if (delta > dayMs / 2) {
      candidate -= dayMs
    } else if (delta < -dayMs / 2) {
      candidate += dayMs
    }
  }

  return candidate
}

const parseThicknessFromLog = (filePath: string) => {
  const lines = readLogText(filePath).split(/\r?\n/)
  const result: ThicknessPoint[] = []
  let previousPulse: number | undefined
  let previousMotionDirection = true
  let latestTimestamp: number | undefined

  for (const line of lines) {
    if (!line.trim()) continue
    const record = safeParseJsonLine(line)
    if (!record) continue

    const message = record.message as Record<string, unknown> | undefined
    if (!message || message.event !== 'read') continue

    const data = message.data as Record<string, unknown> | undefined
    if (!data) continue

    const adValues = data.adValues as number[] | undefined
    const pulses = data.pulses as number[] | undefined
    const timestamps = data.timestamps as number[] | undefined

    if (
      !Array.isArray(adValues) ||
      !Array.isArray(pulses) ||
      !Array.isArray(timestamps)
    ) {
      continue
    }

    const lineTs = Date.parse(String(record.timestamp ?? ''))
    if (!Number.isFinite(lineTs)) continue

    const count = Math.min(adValues.length, pulses.length, timestamps.length)

    for (let i = 0; i < count; i += 1) {
      const probeValue = adValues[i]
      const pulse = pulses[i]
      const relativeTs = timestamps[i]

      if (
        !Number.isFinite(probeValue) ||
        !Number.isFinite(pulse) ||
        !Number.isFinite(relativeTs)
      ) {
        continue
      }

      const timestamp = normalizeThicknessTimestamp(
        relativeTs,
        lineTs,
        latestTimestamp
      )
      const motionDirection: boolean =
        previousPulse === undefined
          ? previousMotionDirection
          : pulse >= previousPulse

      previousPulse = pulse
      previousMotionDirection = motionDirection
      latestTimestamp = timestamp

      result.push({
        HorizontalPulse: pulse,
        ProbeValue: probeValue,
        MotionDirection: motionDirection,
        timestamp,
      })
    }
  }

  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

const parseThicknessFromLogs = (filePaths: string[]) => {
  const result = filePaths.flatMap((filePath) =>
    parseThicknessFromLog(filePath)
  )
  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

const parseUpperReadTimestamps = (filePath: string) => {
  const lines = readLogText(filePath).split(/\r?\n/)
  const timestamps: number[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    const record = safeParseJsonLine(line)
    if (!record) continue

    const message = record.message as Record<string, unknown> | undefined
    if (!message || message.event !== 'read') continue

    const ts = Date.parse(String(record.timestamp ?? ''))
    if (Number.isFinite(ts)) {
      timestamps.push(ts)
    }
  }

  timestamps.sort((a, b) => a - b)
  return timestamps
}

const parseUpperFromLog = (filePath: string) => {
  const lines = readLogText(filePath).split(/\r?\n/)
  const result: UpperPoint[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    const record = safeParseJsonLine(line)
    if (!record) continue

    const message = record.message as Record<string, unknown> | undefined
    if (!message || message.event !== 'read') continue

    const data = message.data as Record<string, unknown> | undefined
    if (!data) continue

    const ts = Date.parse(String(record.timestamp ?? ''))
    if (!Number.isFinite(ts)) continue

    result.push({
      ForwardRotation: Boolean(data.ForwardRotation),
      ReverseRotation: Boolean(data.ReverseRotation),
      timestamp: ts,
    })
  }

  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

const buildReplayEvents = (
  upper: UpperPoint[],
  thickness: ThicknessPoint[]
) => {
  const events: ReplayEvent[] = [
    ...upper.map((data) => ({ kind: 'upper' as const, data })),
    ...thickness.map((data) => ({ kind: 'thickness' as const, data })),
  ]

  events.sort((a, b) => a.data.timestamp - b.data.timestamp)
  return events
}

describe('日志重放: Downloads/logs 最大上旋角度推导', () => {
  test('重放 /Users/zane/Downloads/logs 并推导 maxAngle', () => {
    expect(fs.existsSync(THICKNESS_LOG)).toBe(true)
    expect(fs.existsSync(AIR_RING_LOG)).toBe(true)

    const thickness = parseThicknessFromLog(THICKNESS_LOG)
    const upperReadTimestamps = parseUpperReadTimestamps(AIR_RING_LOG)

    expect(thickness.length).toBeGreaterThan(1000)
    expect(upperReadTimestamps.length).toBeGreaterThan(500)

    const runReplay = (upper: UpperPoint[]) => {
      const replayEvents = buildReplayEvents(upper, thickness)
      const { next: rollerNext } = mockRoller({
        speed: (20 * 1000) / 60,
        RADIUS: 15 * 10,
      })
      const { next: buildTripSegmentNext } = buildTripSegment()

      let tripSegment = buildTripSegmentNext({
        airRing: undefined,
        thickness: undefined,
      })

      for (const event of replayEvents) {
        if (event.kind === 'upper') {
          tripSegment = buildTripSegmentNext({
            airRing: event.data,
            thickness: undefined,
          })
        } else {
          const roller = rollerNext()
          tripSegment = buildTripSegmentNext({
            airRing: undefined,
            thickness: { ...roller, ...event.data },
          })
        }
      }

      const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment)
      const completeCount = tripSegment.filter((s) => s.duration > 0).length
      const usableCount = tripSegment.filter(
        (s) => s.duration > 0 && s.measurements.length >= 10
      ).length

      return { maxAngle, completeCount, usableCount }
    }

    const candidates: Array<{
      oneWayMs: number
      firstForward: boolean
      maxAngle: number
      completeCount: number
      usableCount: number
    }> = []

    const startTs = upperReadTimestamps[0]

    for (const firstForward of [true, false]) {
      for (let oneWayMs = 360_000; oneWayMs <= 660_000; oneWayMs += 60_000) {
        const upper = upperReadTimestamps.map((ts) => {
          const index = Math.floor((ts - startTs) / oneWayMs)
          const isForward = firstForward ? index % 2 === 0 : index % 2 !== 0
          return {
            ForwardRotation: isForward,
            ReverseRotation: !isForward,
            timestamp: ts,
          }
        })

        const replayResult = runReplay(upper)
        if (replayResult.maxAngle != null) {
          candidates.push({
            oneWayMs,
            firstForward,
            maxAngle: replayResult.maxAngle,
            completeCount: replayResult.completeCount,
            usableCount: replayResult.usableCount,
          })
        }
      }
    }

    expect(candidates.length).toBeGreaterThan(0)

    candidates.sort((a, b) => {
      if (b.usableCount !== a.usableCount) return b.usableCount - a.usableCount
      if (b.completeCount !== a.completeCount)
        return b.completeCount - a.completeCount
      return 0
    })

    const best = candidates[0]
    console.log(
      `[log-replay] best oneWayMs=${best.oneWayMs} firstForward=${best.firstForward} maxAngle=${best.maxAngle.toFixed(6)} usable=${best.usableCount} complete=${best.completeCount}`
    )

    expect(best.maxAngle).toBeGreaterThan(180)
    expect(best.maxAngle).toBeLessThan(360)
  }, 300_000)

  test('按上旋来回分组重放并逐圈推导 maxAngle', () => {
    const thickness = parseThicknessFromLog(THICKNESS_LOG)
    const upperReadTimestamps = parseUpperReadTimestamps(AIR_RING_LOG)

    expect(thickness.length).toBeGreaterThan(1000)
    expect(upperReadTimestamps.length).toBeGreaterThan(500)

    // 第一步：扫描全局最优 oneWayMs / firstForward（与全局测试相同逻辑）
    const globalStart = upperReadTimestamps[0]

    const runReplay = (
      windowThickness: ThicknessPoint[],
      upper: UpperPoint[]
    ) => {
      const replayEvents = buildReplayEvents(upper, windowThickness)
      const { next: rollerNext } = mockRoller({
        speed: (20 * 1000) / 60,
        RADIUS: 15 * 10,
      })
      const { next: buildTripSegmentNext } = buildTripSegment()

      let tripSegment = buildTripSegmentNext({
        airRing: undefined,
        thickness: undefined,
      })

      for (const event of replayEvents) {
        if (event.kind === 'upper') {
          tripSegment = buildTripSegmentNext({
            airRing: event.data,
            thickness: undefined,
          })
        } else {
          const roller = rollerNext()
          tripSegment = buildTripSegmentNext({
            airRing: undefined,
            thickness: { ...roller, ...event.data },
          })
        }
      }

      const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment)
      const completeCount = tripSegment.filter((s) => s.duration > 0).length
      const usableCount = tripSegment.filter(
        (s) => s.duration > 0 && s.measurements.length >= 10
      ).length

      return { maxAngle, completeCount, usableCount }
    }

    // 用全量数据扫出全局最优参数
    const globalCandidates: Array<{
      oneWayMs: number
      firstForward: boolean
      maxAngle: number
      usableCount: number
      completeCount: number
    }> = []

    for (const firstForward of [true, false]) {
      for (let oneWayMs = 360_000; oneWayMs <= 660_000; oneWayMs += 60_000) {
        const upper = upperReadTimestamps.map((ts) => {
          const index = Math.floor((ts - globalStart) / oneWayMs)
          const isForward = firstForward ? index % 2 === 0 : index % 2 !== 0
          return {
            ForwardRotation: isForward,
            ReverseRotation: !isForward,
            timestamp: ts,
          }
        })

        const result = runReplay(thickness, upper)
        if (result.maxAngle != null) {
          globalCandidates.push({
            oneWayMs,
            firstForward,
            maxAngle: result.maxAngle,
            usableCount: result.usableCount,
            completeCount: result.completeCount,
          })
        }
      }
    }

    expect(globalCandidates.length).toBeGreaterThan(0)

    globalCandidates.sort((a, b) => {
      if (b.usableCount !== a.usableCount) return b.usableCount - a.usableCount
      if (b.completeCount !== a.completeCount)
        return b.completeCount - a.completeCount
      return 0
    })

    const { oneWayMs: bestOneWayMs, firstForward: bestFirstForward } =
      globalCandidates[0]

    console.log(
      `[trip-group] 全局最优 oneWayMs=${bestOneWayMs} firstForward=${bestFirstForward}`
    )

    // 第二步：用全局固定相位，以来回边界对齐的滑动窗口切分
    // 窗口大小 = N_TRIPS 个来回，步进 = 1 个来回，保证相位连续不重置
    // 每个来回 = 2×oneWayMs，算法需要 ≥3 片段才能运行，故 N_TRIPS=3 → 6 片段
    const N_TRIPS = 3
    const ROUND_TRIP_MS = bestOneWayMs * 2
    const WINDOW_MS = ROUND_TRIP_MS * N_TRIPS
    const dataStart = Math.min(thickness[0].timestamp, upperReadTimestamps[0])
    const dataEnd = Math.max(
      thickness[thickness.length - 1].timestamp,
      upperReadTimestamps[upperReadTimestamps.length - 1]
    )

    // 预先按全局相位生成所有上旋点，窗口切片时直接过滤
    const allUpperPoints: UpperPoint[] = upperReadTimestamps.map((ts) => {
      const index = Math.floor((ts - globalStart) / bestOneWayMs)
      const isForward = bestFirstForward ? index % 2 === 0 : index % 2 !== 0
      return {
        ForwardRotation: isForward,
        ReverseRotation: !isForward,
        timestamp: ts,
      }
    })

    // 以来回边界对齐：窗口从 globalStart 的整数 ROUND_TRIP_MS 倍开始，步进 1 个来回
    const firstRoundStart =
      Math.floor((dataStart - globalStart) / ROUND_TRIP_MS) * ROUND_TRIP_MS +
      globalStart

    const rows: Array<{
      windowIdx: number
      start: string
      end: string
      maxAngle: number
      usable: number
      complete: number
    }> = []

    let windowIdx = 0
    for (
      let windowStart = firstRoundStart;
      windowStart + WINDOW_MS <= dataEnd + ROUND_TRIP_MS;
      windowStart += ROUND_TRIP_MS
    ) {
      const windowEnd = windowStart + WINDOW_MS

      const windowThickness = thickness.filter(
        (p) => p.timestamp >= windowStart && p.timestamp < windowEnd
      )
      const windowUpper = allUpperPoints.filter(
        (p) => p.timestamp >= windowStart && p.timestamp < windowEnd
      )

      // 要求至少 N_TRIPS×2 个完整单程的数据量
      if (
        windowThickness.length < 200 * N_TRIPS ||
        windowUpper.length < 40 * N_TRIPS
      ) {
        windowIdx++
        continue
      }

      const result = runReplay(windowThickness, windowUpper)
      if (result.maxAngle == null) {
        windowIdx++
        continue
      }

      rows.push({
        windowIdx,
        start: new Date(windowStart).toISOString(),
        end: new Date(windowEnd).toISOString(),
        maxAngle: result.maxAngle,
        usable: result.usableCount,
        complete: result.completeCount,
      })

      console.log(
        `[trip-group] #${windowIdx} ${new Date(windowStart).toISOString()} ~ ${new Date(windowEnd).toISOString()} => maxAngle=${result.maxAngle.toFixed(6)}, usable=${result.usableCount}, complete=${result.completeCount}`
      )

      windowIdx++
    }

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.maxAngle).toBeGreaterThan(180)
      expect(row.maxAngle).toBeLessThan(360)
    }
  }, 300_000)

  test('重放 /Users/zane/Downloads/logs 3 的 2026-05-22 日志并恢复出界分组', () => {
    for (const filePath of MAY22_THICKNESS_LOGS) {
      expect(fs.existsSync(filePath)).toBe(true)
    }
    expect(fs.existsSync(MAY22_AIR_RING_LOG)).toBe(true)

    const thickness = parseThicknessFromLogs(MAY22_THICKNESS_LOGS)
    const upper = parseUpperFromLog(MAY22_AIR_RING_LOG)

    expect(thickness.length).toBeGreaterThan(100000)
    expect(upper.length).toBeGreaterThan(1000)

    const replayEvents = buildReplayEvents(upper, thickness)
    const { next: rollerNext } = mockRoller({
      speed: (20 * 1000) / 60,
      RADIUS: 15 * 10,
    })
    const { next: buildTripSegmentNext } = buildTripSegment()

    let tripSegment = buildTripSegmentNext({
      airRing: undefined,
      thickness: undefined,
    })

    for (const event of replayEvents) {
      if (event.kind === 'upper') {
        tripSegment = buildTripSegmentNext({
          airRing: event.data,
          thickness: undefined,
        })
      } else {
        const roller = rollerNext()
        tripSegment = buildTripSegmentNext({
          airRing: undefined,
          thickness: { ...roller, ...event.data },
        })
      }
    }

    const completeSegments = tripSegment.filter(
      (segment) => segment.duration > 0
    )
    const usableSegments = completeSegments.filter(
      (segment) => segment.measurements.length >= 10
    )
    const nanCount = usableSegments.reduce(
      (sum, segment) =>
        sum + segment.measurements.filter((point) => isNaN(point.y)).length,
      0
    )
    const nanSegments = usableSegments.filter((segment) =>
      segment.measurements.some((point) => isNaN(point.y))
    ).length
    const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment)

    console.log(
      `[may22-replay] maxAngle=${maxAngle?.toFixed(6) ?? 'null'} usable=${usableSegments.length} complete=${completeSegments.length} nanSegments=${nanSegments} nanCount=${nanCount}`
    )

    expect(nanSegments).toBeGreaterThan(0)
    expect(nanCount).toBeGreaterThan(100)
    expect(usableSegments.length).toBeGreaterThanOrEqual(3)
    expect(maxAngle).toBeGreaterThan(240)
    expect(maxAngle).toBeLessThan(360)
  }, 300_000)
})
