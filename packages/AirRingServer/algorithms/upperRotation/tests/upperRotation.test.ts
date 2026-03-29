import { describe, expect, test } from 'vitest'
import { mockRoller } from '@jjsk/simulation'
import { TripSegment } from '../../../types'
import { estimateThetaMaxWithPhaseCorrection } from '../upperRotation'
import { buildTripSegment } from '../../buildTripSegment'

describe.concurrent('真实数据集测试', () => {
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
        await import(`./data/${dsName}/upper.json`, {
          assert: { type: 'json' },
        })
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
})
