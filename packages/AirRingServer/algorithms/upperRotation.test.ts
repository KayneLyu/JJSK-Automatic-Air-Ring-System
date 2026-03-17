import { expect, test, vi } from 'vitest'
import { createBlowFilmSimulator, mockRoller } from '@jjsk/simulation'
import { TripSegment } from '../types'
import { estimateThetaMaxWithPhaseCorrection } from './upperRotation'
import { buildTripSegment } from './buildTripSegment'

// 真实数据集测试
for (const dsName of ['01', '02', '03', '04', '05'] as const) {
  test(`测试估算最大旋转角度,样本数据 ${dsName}`, async () => {
    const thicknessData = (
      await import(`./data/${dsName}/thickness.json`, {
        assert: { type: 'json' },
      })
    ).default as Array<{
      HorizontalPulse: number
      ProbeValue: number
      timestamp: number
    } | null>
    const upper = (
      await import(`./data/${dsName}/upper.json`, { assert: { type: 'json' } })
    ).default as Array<{
      ForwardRotation: boolean
      ReverseRotation: boolean
      timestamp: number
    } | null>
    const info = (
      await import(`./data/${dsName}/info.json`, { assert: { type: 'json' } })
    ).default as { angle: number }

    const { next: rollerNext } = mockRoller({
      speed: (20 * 1000) / 60,
      RADIUS: 15 * 10,
    })
    const { next: buildTripSegmentNext } = buildTripSegment()
    let tripSegment: TripSegment[] = []
    for (let i = 0; i < upper.length; i++) {
      const upperRotationValue = upper[i]
      const thicknessGaugeValue = thicknessData[i]
      if (upperRotationValue && thicknessGaugeValue) {
        const rollerValue = rollerNext()
        tripSegment = buildTripSegmentNext({
          airRing: upperRotationValue,
          thickness: { ...rollerValue, ...thicknessGaugeValue },
        })
      }
    }

    const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment) ?? 0
    const error = Math.abs(info.angle - maxAngle)
    console.log(
      `Dataset ${dsName}: expected=${info.angle}°, got=${maxAngle.toFixed(2)}°, error=${error.toFixed(2)}°`
    )
    // 允许约 5° 误差（真实采集数据存在一定误差）
    expect(error).toBeLessThan(5)
  })
}

// 模拟器多值验证：覆盖不同角度范围，确保算法在全量程内均可准确收敛
// 角度选取原则：接近下边界(~200°)、中段(~250°/290°)、常见区间(~320°/330°)、接近上边界(~350°)
const SIMULATOR_TEST_ANGLES = [210, 250, 290, 320, 330, 350]

for (const UpperMaxAngle of SIMULATOR_TEST_ANGLES) {
  test(
    `测试估算最大旋转角度 (模拟器 ${UpperMaxAngle}°)`,
    { timeout: 15000 },
    () => {
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
          flowDeviation: 0.005,
        },
        bubble: {
          nominalThickness: 100,
          thicknessSensitivity: -2.0,
          bubbleRadius: 382.2,
          thicknessResolution: 0.5,
        },
        upperRotation: {
          maxAngle: UpperMaxAngle,
          tripDuration: 360,
        },
        scanner: {
          membraneWidth: 1200,
          tripDuration: 30,
          pulseToDistance: 0.1,
          measurementNoise: 0.1,
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

      const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment)
      console.log(
        `模拟器用例 ${UpperMaxAngle}°: expected=${UpperMaxAngle}°, got=${maxAngle?.toFixed(2)}°, rounded=${Math.round(maxAngle!)}`
      )
      expect(Math.round(maxAngle!)).toBe(UpperMaxAngle)
    }
  )
}
