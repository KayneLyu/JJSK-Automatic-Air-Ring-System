import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { mockRoller } from '@jjsk/simulation'
import { buildTripSegment } from '../algorithms/buildTripSegment'
import { filterLowQualityTripSegments } from '../algorithms/upperRotation/filterLowQualityTripSegments'
import { estimateThetaMaxWithPhaseCorrection } from '../algorithms/upperRotation/upperRotation'
import { createCalibrationSession } from './calibration'
import type { TripSegment } from '../types'

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

const LOG_ROOT = '/Users/zane/Downloads/logs 2'
const THICKNESS_LOG = path.join(
  LOG_ROOT,
  'thickness',
  'thickness-2026-05-09-13.log'
)
const AIR_RING_LOG = path.join(
  LOG_ROOT,
  'airRing',
  'upper-rotation-2026-05-09.log'
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

const CALIBRATION_CONFIG = {
  roller: {
    numCycles: 10,
  },
  upperRotation: {},
} as const

const CALIBRATION_STANDARDIZED = {
  CHANNEL_COUNT: 48,
  THICKNESS_UNIT_PULSE_DIS: 0.1,
  ROLLER: {
    DIAMETER: 300,
  },
} as const

const MANUAL_TRACTION_SPEED = (20 * 1000) / 60

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

const buildTripSegmentsFromReplay = (
  upper: UpperPoint[],
  thickness: ThicknessPoint[]
) => {
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

  return tripSegment
}

const replayCalibrationSession = (
  upper: UpperPoint[],
  thickness: ThicknessPoint[]
) => {
  const replayEvents = buildReplayEvents(upper, thickness)
  const { next: rollerNext } = mockRoller({
    speed: MANUAL_TRACTION_SPEED,
    RADIUS: 15 * 10,
  })
  const maxAngleHistory: number[] = []
  const session = createCalibrationSession({
    config: CALIBRATION_CONFIG,
    standardized: CALIBRATION_STANDARDIZED,
    manualTractionSpeed: MANUAL_TRACTION_SPEED,
    onResult: (result) => {
      if (result.maxAngle !== undefined) {
        maxAngleHistory.push(result.maxAngle)
      }
    },
  })

  for (const event of replayEvents) {
    if (event.kind === 'upper') {
      session.feedAirRing(event.data)
    } else {
      const roller = rollerNext()
      session.feedThickness({ ...roller, ...event.data })
    }
  }

  return {
    result: session.getResult(),
    maxAngleHistory,
  }
}

const stdDev = (values: number[]) => {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

const jumpCount = (values: number[], thresholdDeg = 3) => {
  let count = 0
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - values[i - 1]) >= thresholdDeg) {
      count += 1
    }
  }
  return count
}

describe('calibration 日志重放: 低质量片段过滤', () => {
  test('过滤后 maxAngle 序列更稳定', () => {
    expect(fs.existsSync(THICKNESS_LOG)).toBe(true)
    expect(fs.existsSync(AIR_RING_LOG)).toBe(true)

    const thickness = parseThicknessFromLog(THICKNESS_LOG)
    const upperReadTimestamps = parseUpperReadTimestamps(AIR_RING_LOG)

    expect(thickness.length).toBeGreaterThan(1000)
    expect(upperReadTimestamps.length).toBeGreaterThan(1000)

    const startTs = upperReadTimestamps[0]
    const candidates: Array<{
      oneWayMs: number
      firstForward: boolean
      completeCount: number
      usableCount: number
      segments: TripSegment[]
    }> = []

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

        const segments = buildTripSegmentsFromReplay(upper, thickness)
        const completeCount = segments.filter((s) => s.duration > 0).length
        const usableCount = segments.filter(
          (s) => s.duration > 0 && s.measurements.length >= 10
        ).length

        candidates.push({
          oneWayMs,
          firstForward,
          completeCount,
          usableCount,
          segments,
        })
      }
    }

    candidates.sort((a, b) => {
      if (b.usableCount !== a.usableCount) return b.usableCount - a.usableCount
      return b.completeCount - a.completeCount
    })

    const best = candidates[0]
    const usableSegments = best.segments.filter(
      (s) => s.duration > 0 && s.measurements.length >= 10
    )

    expect(usableSegments.length).toBeGreaterThanOrEqual(8)

    const rawAngles: number[] = []
    const filteredAngles: number[] = []
    let reducedWindowCount = 0

    for (let end = 3; end <= usableSegments.length; end += 1) {
      const subset = usableSegments.slice(0, end)
      const raw = estimateThetaMaxWithPhaseCorrection(subset)
      if (raw == null) continue

      const filteredSubset = filterLowQualityTripSegments(subset)
      if (filteredSubset.length < subset.length) {
        reducedWindowCount += 1
      }
      const filtered = estimateThetaMaxWithPhaseCorrection(filteredSubset)
      if (filtered == null) continue

      rawAngles.push(raw)
      filteredAngles.push(filtered)
    }

    expect(rawAngles.length).toBeGreaterThan(5)
    expect(filteredAngles.length).toBe(rawAngles.length)
    expect(reducedWindowCount).toBeGreaterThan(0)

    const rawStd = stdDev(rawAngles)
    const filteredStd = stdDev(filteredAngles)
    const rawJumps = jumpCount(rawAngles)
    const filteredJumps = jumpCount(filteredAngles)

    console.log(
      `[quality-filter] oneWayMs=${best.oneWayMs} firstForward=${best.firstForward} windows=${rawAngles.length} reduced=${reducedWindowCount} rawStd=${rawStd.toFixed(4)} filteredStd=${filteredStd.toFixed(4)} rawJumps=${rawJumps} filteredJumps=${filteredJumps}`
    )

    expect(filteredStd).toBeLessThanOrEqual(rawStd)
    expect(filteredJumps).toBeLessThanOrEqual(rawJumps)
  }, 300_000)

  test('重放 2026-05-22 标定会话时 maxAngle 不再退化到 181', () => {
    for (const filePath of MAY22_THICKNESS_LOGS) {
      expect(fs.existsSync(filePath)).toBe(true)
    }
    expect(fs.existsSync(MAY22_AIR_RING_LOG)).toBe(true)

    const thickness = parseThicknessFromLogs(MAY22_THICKNESS_LOGS)
    const upper = parseUpperFromLog(MAY22_AIR_RING_LOG)
    const replaySegments = buildTripSegmentsFromReplay(upper, thickness)

    expect(thickness.length).toBeGreaterThan(100000)
    expect(upper.length).toBeGreaterThan(1000)

    const algorithmDefaultMaxAngle =
      estimateThetaMaxWithPhaseCorrection(replaySegments)
    const algorithm48BinMaxAngle = estimateThetaMaxWithPhaseCorrection(
      replaySegments,
      {
        segments: CALIBRATION_STANDARDIZED.CHANNEL_COUNT,
      }
    )

    const { result, maxAngleHistory } = replayCalibrationSession(
      upper,
      thickness
    )

    const finalMaxAngle = result?.maxAngle
    const peakMaxAngle = Math.max(...maxAngleHistory)

    console.log(
      `[calibration-may22] autoDefault=${algorithmDefaultMaxAngle?.toFixed(6) ?? 'null'} bin48=${algorithm48BinMaxAngle?.toFixed(6) ?? 'null'} updates=${maxAngleHistory.length} final=${finalMaxAngle?.toFixed(6) ?? 'null'} peak=${peakMaxAngle.toFixed(6)} mutationWindow=${result?.mutationWindowSize ?? 'null'}`
    )

    expect(algorithmDefaultMaxAngle).toBeGreaterThan(240)
    expect(algorithm48BinMaxAngle).toBeGreaterThan(320)
    expect(algorithm48BinMaxAngle).toBeGreaterThan(
      (algorithmDefaultMaxAngle ?? 0) + 40
    )
    expect(maxAngleHistory.length).toBeGreaterThan(0)
    expect(result?.mutationWindowSize).toBeGreaterThan(0)
    expect(finalMaxAngle).toBeGreaterThan(240)
    expect(finalMaxAngle).toBeLessThan(320)
    expect(
      Math.abs((finalMaxAngle ?? 0) - (algorithmDefaultMaxAngle ?? 0))
    ).toBeLessThan(20)
    expect(
      Math.abs((finalMaxAngle ?? 0) - (algorithm48BinMaxAngle ?? 0))
    ).toBeGreaterThan(30)
    expect(peakMaxAngle).toBeGreaterThan(280)
  }, 300_000)
})
