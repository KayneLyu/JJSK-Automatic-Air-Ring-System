import { Scalar } from '../types'
import { findMutation } from '../algorithms/findMutation'
import { ThicknessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { buildTimeToAngle } from '../algorithms/timeToAngle'
// 风道配置
interface WindRingConfig {
  numFans: number // 风道数量 N
  phaseOffsetRad: number // 风道0相对于人字架零点的安装偏移（弧度）
  phaseDiscriminationThreshold: number // 相位判别阈值
  symmetryTolerance: number // 对称性容差
}

/**
 * 实时相位识别函数：基于突变前历史数据区分 θ 和 θ+π
 * @param phi 突变时刻计算得到的角度
 * @param preMutationHistory 突变前的历史厚度数据
 * @param config 配置参数
 * @returns 修正后的角度和置信度
 */
const discriminatePhaseRealTime = (
  phi: number,
  preMutationHistory: { angle: number; thickness: number }[],
  config: WindRingConfig
): { correctedAngle: number; confidence: number } => {
  const { numFans, symmetryTolerance } = config
  const fanAngle = (2 * Math.PI) / numFans

  // 计算对称角度
  const phiSymmetric = (phi + Math.PI) % (2 * Math.PI)

  // 在突变前的历史数据中查找邻近角度点（扩大搜索范围）
  const searchRadius = fanAngle * 1.5 // 1.5倍扇区角度
  const nearbyPhiData = preMutationHistory.filter((d) => {
    const angleDiff = Math.abs(d.angle - phi)
    return (
      angleDiff < searchRadius ||
      Math.abs(angleDiff - 2 * Math.PI) < searchRadius
    )
  })

  const nearbyPhiSymmetricData = preMutationHistory.filter((d) => {
    const angleDiff = Math.abs(d.angle - phiSymmetric)
    return (
      angleDiff < searchRadius ||
      Math.abs(angleDiff - 2 * Math.PI) < searchRadius
    )
  })

  // 如果数据不足，返回较低置信度的结果
  if (nearbyPhiData.length < 3 && nearbyPhiSymmetricData.length < 3) {
    return { correctedAngle: phi, confidence: 0.3 }
  }

  // 计算统计特征
  const calculateStats = (data: typeof nearbyPhiData) => {
    if (data.length === 0) return { mean: 0, std: 0, count: 0 }

    const values = data.map((d) => d.thickness)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const std = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length
    )

    return { mean, std, count: values.length }
  }

  const phiStats = calculateStats(nearbyPhiData)
  const phiSymmetricStats = calculateStats(nearbyPhiSymmetricData)

  // 多维度判别策略
  let confidence = 0.5
  let correctedAngle = phi

  // 1. 基于均值差异的判别
  if (phiStats.count > 0 && phiSymmetricStats.count > 0) {
    const meanDiff = Math.abs(phiStats.mean - phiSymmetricStats.mean)
    if (meanDiff > symmetryTolerance) {
      correctedAngle =
        phiStats.mean < phiSymmetricStats.mean ? phi : phiSymmetric
      confidence += 0.3
    }
  }

  // 2. 基于数据量的判别
  const countRatio =
    Math.max(phiStats.count, phiSymmetricStats.count) /
    Math.max(1, Math.min(phiStats.count, phiSymmetricStats.count))
  if (countRatio > 2) {
    confidence += 0.1
    if (phiStats.count > phiSymmetricStats.count) {
      correctedAngle = phi
    } else {
      correctedAngle = phiSymmetric
    }
  }

  // 3. 基于稳定性（标准差）的判别
  if (phiStats.std > 0 && phiSymmetricStats.std > 0) {
    const stabilityRatio =
      Math.min(phiStats.std, phiSymmetricStats.std) /
      Math.max(phiStats.std, phiSymmetricStats.std)
    if (stabilityRatio < 0.7) {
      // 一方明显更稳定
      confidence += 0.1
    }
  }

  return {
    correctedAngle,
    confidence: Math.min(confidence, 0.95), // 置信度上限
  }
}

/**
 * 给定相位 φ，返回最接近的风道索引
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

  // 关键改进：维护突变前的实时历史数据
  const preMutationBuffer: {
    angle: number
    thickness: number
    timestamp: number
  }[] = []
  const bufferSize = CHANNEL_COUNT * 3 // 3圈数据作为参考基准

  let lastAdjustedFan: number | null = null
  let adjustmentCooldown = 0

  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }) => {
    // 冷却期控制
    if (adjustmentCooldown > 0) {
      adjustmentCooldown--
      return null
    }

    if (airRing) {
      const currentSignal =
        !!airRing.ForwardRotation && !airRing.ReverseRotation
      if (currentSignal !== isForward) {
        isForward = currentSignal
        if (airRing.timestamp) tripStart = airRing.timestamp
      }
    }

    if (
      thickness &&
      tripStart &&
      thickness.ProbeValue &&
      thickness.ProbeValue > 0 &&
      thickness.timestamp
    ) {
      // 实时更新突变前的历史数据缓冲区
      const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, CHANNEL_COUNT)
      const tRel = thickness.timestamp - tripStart
      const currentPhi = timeToAngle(tRel, isForward)

      preMutationBuffer.push({
        angle: currentPhi,
        thickness: thickness.ProbeValue,
        timestamp: thickness.timestamp,
      })

      // 维护缓冲区大小
      if (preMutationBuffer.length > bufferSize) {
        preMutationBuffer.shift()
      }

      // 检测突变
      const mutation = FindMutationNext(thickness)
      if (mutation && preMutationBuffer.length > CHANNEL_COUNT) {
        /* 关键改进：突变发生时立即基于已有历史数据进行相位识别 */
        const phi = timeToAngle(mutation.timestamp - tripStart, isForward)

        // 立即使用突变前的历史数据进行相位判别
        const phaseResult = discriminatePhaseRealTime(phi, preMutationBuffer, {
          numFans: CHANNEL_COUNT,
          phaseOffsetRad: 0,
          phaseDiscriminationThreshold: 0.1,
          symmetryTolerance: 5,
        })

        // 转换为风道索引
        const fanIndex = getNearestFanIndex(phaseResult.correctedAngle, {
          numFans: CHANNEL_COUNT,
          phaseOffsetRad: 0,
          phaseDiscriminationThreshold: 0.1,
          symmetryTolerance: 5,
        })

        // 智能调整策略
        if (phaseResult.confidence > 0.6 && fanIndex !== lastAdjustedFan) {
          lastAdjustedFan = fanIndex
          adjustmentCooldown = Math.floor(CHANNEL_COUNT / 8) // 极短冷却期
          console.log(
            `调整风道 ${fanIndex}，置信度: ${(phaseResult.confidence * 100).toFixed(1)}%`
          )
          return fanIndex
        }
      }
    }

    return null
  }

  return { next }
}
