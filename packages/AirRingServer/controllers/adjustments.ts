// 风道配置
import { Scalar } from '../types'
import { findMutation } from '../algorithms/findMutation'
import { ThicknessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { buildTimeToAngle } from '../algorithms/timeToAngle'

interface WindRingConfig {
  numFans: number // 风道数量 N
  phaseOffsetRad: number // 风道0相对于人字架零点的安装偏移（弧度）
}

/**
 * 给定相位 φ，返回最接近的风道索引（考虑圆周 wrap）
 */
const getNearestFanIndex = (phiRad: number, config: WindRingConfig): number => {
  const { numFans, phaseOffsetRad } = config
  const normalizedPhi =
    (((phiRad - phaseOffsetRad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const fanAngle = (2 * Math.PI) / numFans
  const index = Math.round(normalizedPhi / fanAngle) % numFans
  return index < 0 ? index + numFans : index
}
type AdjustmentConfig = {
  windowSize: number
  thetaMaxDeg: number
  T_half: number
}
export const adjustments = (config: AdjustmentConfig, standardized: Scalar) => {
  const { windowSize, thetaMaxDeg, T_half } = config
  const { CHANNEL_COUNT } = standardized
  const { next: FindMutationNext, setWindowSize } = findMutation()
  setWindowSize(windowSize)
  let tripStart: number | null = null
  let isForward = true
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }) => {
    if (thickness) {
      const mutation = FindMutationNext(thickness)
      if (mutation && tripStart) {
        /* 发生突变 */
        const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, CHANNEL_COUNT)
        const tRel = mutation.timestamp - tripStart // 转为相对时间
        const phi = timeToAngle(tRel, isForward)

        return getNearestFanIndex(phi, {
          numFans: CHANNEL_COUNT,
          phaseOffsetRad: 0,
        })
      }
    }
    if (airRing) {
      const currentSignal =
        !!airRing.ForwardRotation && !airRing.ReverseRotation
      if (currentSignal !== isForward) {
        isForward = currentSignal
        if (airRing.timestamp) tripStart = airRing.timestamp
      }
    }
    return null
  }
  return { next }
}
