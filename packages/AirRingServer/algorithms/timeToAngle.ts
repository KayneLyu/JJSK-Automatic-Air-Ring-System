/**
 * 构建角度-时间映射函数
 *
 * 运动模型：上旋往返旋转，每端加减速时间固定（约 20s），
 * 中间匀速，而非旧版按行程时长的百分比分配。
 * */
export const buildTimeToAngle = (
  thetaMaxDeg: number,
  T_half: number,
  K: number,
  accelTimePerEndMs: number = 20_000
) => {
  const totalAngle = (thetaMaxDeg * Math.PI) / 180
  const segmentAngle = totalAngle / K

  // 固定加减速时间，上限不超过行程的 30%（防止极短行程退化）
  const rawAccelTime = accelTimePerEndMs
  const maxAccelTime = T_half * 0.3
  const accelTime = Math.min(rawAccelTime, maxAccelTime)
  const constantTime = T_half - 2 * accelTime

  const accelSegments = K * 0.2 // 前 20% 段用于加速
  const constSegments = K * 0.6  // 中间 60% 段匀速

  const segmentTimes: number[] = []
  for (let i = 0; i < K; i++) {
    if (i < accelSegments) {
      // 前20%段：加速阶段，时间逐渐减少
      const accelProgress = i / accelSegments
      segmentTimes.push((accelTime * (1.5 - 0.5 * accelProgress)) / accelSegments)
    } else if (i < accelSegments + constSegments) {
      // 中间60%段：匀速阶段
      segmentTimes.push(constantTime / constSegments)
    } else {
      // 后20%段：减速阶段，时间逐渐增加
      const decelProgress = (i - accelSegments - constSegments) / accelSegments
      segmentTimes.push((accelTime * (1 + decelProgress)) / accelSegments)
    }
  }

  // 构建角度映射
  return (t: number, isForward: boolean): number => {
    if (t <= 0) return isForward ? 0 : totalAngle
    if (t >= T_half) return isForward ? totalAngle : 0

    let elapsed = 0
    for (let i = 0; i < K; i++) {
      if (t <= elapsed + segmentTimes[i]) {
        const localT = t - elapsed
        const localAngle = (localT / segmentTimes[i]) * segmentAngle

        // 改进4: 添加非线性映射以更好地匹配实际运动
        const normalizedLocal = localT / segmentTimes[i]
        // 使用平滑的S型曲线而不是线性映射
        const smoothFactor =
          3 * normalizedLocal * normalizedLocal -
          2 * normalizedLocal * normalizedLocal * normalizedLocal
        const correctedLocalAngle = localAngle * smoothFactor

        return isForward
          ? i * segmentAngle + correctedLocalAngle
          : totalAngle - (i * segmentAngle + correctedLocalAngle)
      }
      elapsed += segmentTimes[i]
    }
    return isForward ? totalAngle : 0
  }
}

/**
 * 改进版本：支持动态校正的时间-角度映射
 * */
export const buildAdaptiveTimeToAngle = (
  thetaMaxDeg: number,
  T_half: number,
  K: number,
  motionProfile?: {
    accelerationTime?: number
    decelerationTime?: number
    maxSpeed?: number
  }
) => {
  const totalAngle = (thetaMaxDeg * Math.PI) / 180
  const segmentAngle = totalAngle / K

  // 使用提供的运动参数或默认固定加减速时间
  const accelTime = motionProfile?.accelerationTime || 20_000
  const decelTime = motionProfile?.decelerationTime || 20_000
  const constantTime = Math.max(0, T_half - accelTime - decelTime)

  // 动态计算每段的时间分配
  const calculateSegmentTime = (segmentIndex: number): number => {
    if (segmentIndex < K * (accelTime / T_half)) {
      // 加速段：时间递减
      const progress = segmentIndex / (K * (accelTime / T_half))
      return (accelTime * (2 - progress)) / (K * (accelTime / T_half))
    } else if (segmentIndex < K * ((accelTime + constantTime) / T_half)) {
      // 匀速段：时间恒定
      return constantTime / (K * (constantTime / T_half))
    } else {
      // 减速段：时间递增
      const decelStart = K * ((accelTime + constantTime) / T_half)
      const progress = (segmentIndex - decelStart) / (K * (decelTime / T_half))
      return (decelTime * (1 + progress)) / (K * (decelTime / T_half))
    }
  }

  const segmentTimes = Array.from({ length: K }, (_, i) =>
    calculateSegmentTime(i)
  )

  return (t: number, isForward: boolean, currentSpeed?: number): number => {
    if (t <= 0) return isForward ? 0 : totalAngle
    if (t >= T_half) return isForward ? totalAngle : 0

    // 改进5: 支持基于当前速度的动态校正
    let adjustedT = t
    if (currentSpeed && motionProfile?.maxSpeed) {
      // 根据当前速度调整时间映射
      const speedRatio = currentSpeed / motionProfile.maxSpeed
      adjustedT = t * speedRatio
    }

    let elapsed = 0
    for (let i = 0; i < K; i++) {
      if (adjustedT <= elapsed + segmentTimes[i]) {
        const localT = adjustedT - elapsed
        const localAngle = (localT / segmentTimes[i]) * segmentAngle
        return isForward
          ? i * segmentAngle + localAngle
          : totalAngle - (i * segmentAngle + localAngle)
      }
      elapsed += segmentTimes[i]
    }
    return isForward ? totalAngle : 0
  }
}
