import { randomBytes } from 'node:crypto'
import { expect, vi } from 'vitest'
import { createBlowFilmSimulator } from '@jjsk/simulation'
import { TripSegment } from '../../../types'
import { buildTripSegment } from '../../buildTripSegment'
import { estimateThetaMaxWithPhaseCorrection } from '../upperRotation'

export type SimulatorScenario = {
  seed: number
  maxAngleDeg: number
  upperTripDurationSec: number
  scannerTripDurationSec: number
  measurementNoise: number
  flowDeviation: number
}

const UINT32_MAX = 0xffffffff

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

const randomBetween = (
  random: () => number,
  min: number,
  max: number,
  decimals: number
): number => Number((min + random() * (max - min)).toFixed(decimals))

const parseReplaySeed = (): number | undefined => {
  const raw = process.env.UPPER_ROTATION_REPLAY_SEED
  if (raw === undefined || raw.trim() === '') return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > UINT32_MAX) {
    throw new Error(
      `UPPER_ROTATION_REPLAY_SEED 必须是 0～${UINT32_MAX} 的整数，收到: ${raw}`
    )
  }
  return parsed >>> 0
}

export const createSimulatorScenario = (seed?: number): SimulatorScenario => {
  const effectiveSeed =
    seed === undefined ? randomBytes(4).readUInt32LE(0) : seed >>> 0
  const random = mulberry32(effectiveSeed)
  return {
    seed: effectiveSeed,
    maxAngleDeg: randomBetween(random, 181, 359, 2),
    upperTripDurationSec: randomBetween(random, 360, 480, 1),
    scannerTripDurationSec: randomBetween(random, 25, 35, 1),
    measurementNoise: randomBetween(random, 0.05, 0.2, 3),
    flowDeviation: randomBetween(random, 0.002, 0.01, 4),
  }
}

export const fn = async (scenarioIndex: number) => {
  const scenario = createSimulatorScenario(parseReplaySeed())
  const simulatorRandomSpy = vi
    .spyOn(Math, 'random')
    .mockImplementation(mulberry32(scenario.seed ^ 0xa5a5a5a5))
  vi.useFakeTimers()
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const speed = (20 * 1000) / 60
  const RADIUS = 15 * 10
  const CHANNEL_COUNT = 64
  const distanceFromAirRingToScanner = 25 * 1000

  // 生成有差异的各风道基础风量
  // 注意：双层测量中奇次谐波相消，只有偶次谐波可被算法利用。
  // 因此在基础风量中同时加入 2 次（0.8）和 4 次（0.6）谐波，确保信号强度。
  const baseAirFlow = Array.from({ length: CHANNEL_COUNT }, (_, i) => {
    const angle = (i / CHANNEL_COUNT) * 2 * Math.PI
    return (
      20 +
      1.5 * Math.sin(angle) +
      0.8 * Math.sin(2 * angle + 0.5) +
      0.6 * Math.sin(4 * angle + 1.0)
    )
  })
  const simulator = createBlowFilmSimulator({
    airRing: {
      channelCount: CHANNEL_COUNT,
      baseAirFlow,
      installationOffset: 0,
      flowDeviation: scenario.flowDeviation,
    },
    bubble: {
      nominalThickness: 100,
      thicknessSensitivity: -2.0,
      bubbleRadius: 382.2,
      thicknessResolution: 0.5,
    },
    upperRotation: {
      maxAngle: scenario.maxAngleDeg,
      tripDuration: scenario.upperTripDurationSec,
    },
    scanner: {
      membraneWidth: 1200,
      tripDuration: scenario.scannerTripDurationSec,
      pulseToDistance: 0.1,
      measurementNoise: scenario.measurementNoise,
    },
    roller: {
      speed,
      roller: { RADIUS },
    },
    airRingToScannerDistance: distanceFromAirRingToScanner,
  })

  let tripSegment: TripSegment[] = []
  const { next: buildTripSegmentNext } = buildTripSegment()
  setInterval(() => {
    const timestamp = Date.now()
    const { rollerDevice, thicknessDevice, upperRotationDevice } =
      simulator.next()
    tripSegment = buildTripSegmentNext({
      airRing: { ...upperRotationDevice, timestamp },
      thickness: { ...thicknessDevice, ...rollerDevice, timestamp },
    })
  }, 10)

  // 快进 30 分钟，获得 5 个完整单程，提升算法精度
  vi.advanceTimersByTime(30 * 60 * 1000)

  const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment) || 0
  console.log(
    `[simulator-random] index=${scenarioIndex} scenario=${JSON.stringify(scenario)} got=${maxAngle.toFixed(2)}° error=${Math.abs(scenario.maxAngleDeg - maxAngle).toFixed(2)}° replay="UPPER_ROTATION_REPLAY_SEED=${scenario.seed}"`
  )
  const diff = Math.abs(scenario.maxAngleDeg - maxAngle)
  simulatorRandomSpy.mockRestore()
  vi.useRealTimers()
  expect(diff).toBeLessThan(5)
}
