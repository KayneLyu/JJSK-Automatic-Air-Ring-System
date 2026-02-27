/**
 * 构建角度-时间映射函数
 * */
export const buildTimeToAngle = (
  thetaMaxDeg: number,
  T_half: number,
  K: number
) => {
  const totalAngle = (thetaMaxDeg * Math.PI) / 180
  const segmentAngle = totalAngle / K
  // 假设每段匀速 → 计算每段应耗时
  const nominalSegmentTime = T_half / K

  // 实际：允许每段时间浮动（但总和=T_half）
  // 为简化，先假设匀速（后续可扩展为优化 {dt_k}）
  const segmentTimes = Array(K).fill(nominalSegmentTime) // 可扩展为优化变量

  // 构建角度映射
  return (t: number, isForward: boolean): number => {
    let elapsed = 0
    for (let i = 0; i < K; i++) {
      if (t <= elapsed + segmentTimes[i]) {
        const localT = t - elapsed
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
