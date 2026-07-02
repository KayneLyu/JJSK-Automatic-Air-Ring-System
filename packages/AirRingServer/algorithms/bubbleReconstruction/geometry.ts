// ============================================================
// 膜泡重建 — 几何模型
//
// 【物理设定】
//   膜泡为半径 R 的圆柱面，压平后膜宽 W = πR（半周长）
//
//   压合中心角 αC = θ(t) + 90°
//     · θ(t)：上旋角（随时间变化）
//     · +90°：上旋架与压合中心的固定几何偏移
//
//   坐标映射：
//     δ(x) = (x / W) × 180°           — 角位移
//     φ₁(x,t) = (αC + δ) mod 360°      — 前层（靠近测厚仪）
//     φ₂(x,t) = (αC − δ) mod 360°      — 后层（远离测厚仪）
//
// 【关键性质】
//   · x = 0  (δ=0°)：   φ₁ = φ₂ = αC  → 两层简并
//   · x = ±W/2 (δ=±90°)：φ₁ − φ₂ = 180°  → 唯一满足 180° 条件
//   · 普遍情况：φ₂ ≠ φ₁ + 180°
//
// 【参数分类】
//   物理确定关系：αC = θ + 90°, δ = x/W × 180°
//   标定参数：W（膜宽，由机械测量获得）
//   在线辨识：θ(t)（上旋角，由相位估计算法获得）
// ============================================================

export interface PhiPair {
  phi1Deg: number
  phi2Deg: number
  deltaDeg: number
  alphaCenterDeg: number
}

export const normalizeAngle = (deg: number): number => {
  const a = ((deg % 360) + 360) % 360
  return a >= 360 ? 0 : a
}

/**
 * 计算给定测量位置对应的膜泡前后层角度 φ₁, φ₂
 *
 * @param upperAngleDeg  当前上旋角 θ (°)
 * @param scannerPosMm   测厚仪探头位置 x (mm)
 * @param membraneWidthMm 膜宽 W (mm)
 * @returns { phi1Deg, phi2Deg, deltaDeg, alphaCenterDeg }
 *
 * 推导：
 *   αC = θ + 90°                    — 压合中心角
 *   δ = (x / W) × 180°              — 角位移
 *   φ₁ = (αC + δ) mod 360°           — 前层
 *   φ₂ = (αC − δ) mod 360°           — 后层
 *
 * 验证：x = ±W/2 时 δ = ±90°, φ₁ − φ₂ = 180° ✓
 */
export const computePhiPair = (
  upperAngleDeg: number,
  scannerPosMm: number,
  membraneWidthMm: number
): PhiPair => {
  const deltaDeg = (scannerPosMm / membraneWidthMm) * 180
  const alphaCenterDeg = normalizeAngle(upperAngleDeg + 90)
  const phi1Deg = normalizeAngle(alphaCenterDeg + deltaDeg)
  const phi2Deg = normalizeAngle(alphaCenterDeg - deltaDeg)
  return { phi1Deg, phi2Deg, deltaDeg, alphaCenterDeg }
}

/**
 * 逆映射：给定 φ 和上旋角，计算对应的扫描仪位置 x
 *
 * 推导：
 *   φ = (θ + 90° ± δ) mod 360°
 *   δ = |φ − αC|  （取较近的角度差）
 *   x = δ / 180° × W
 *
 * @param phiDeg          膜泡圆周角度 φ (°)
 * @param upperAngleDeg   上旋角 θ (°)
 * @param membraneWidthMm 膜宽 W (mm)
 * @param layer           'front' | 'back' — 指定前层或后层
 * @returns x (mm)，未找到时返回 null
 */
export const phiToScannerPosition = (
  phiDeg: number,
  upperAngleDeg: number,
  membraneWidthMm: number,
  layer: 'front' | 'back' = 'front'
): number | null => {
  const alphaCenterDeg = normalizeAngle(upperAngleDeg + 90)
  let rawDelta = phiDeg - alphaCenterDeg
  // 标准化到 [−180, 180)
  if (rawDelta > 180) rawDelta -= 360
  if (rawDelta < -180) rawDelta += 360

  const sign = layer === 'front' ? 1 : -1
  const deltaDeg = rawDelta * sign

  if (deltaDeg < -90 || deltaDeg > 90) return null

  return (deltaDeg / 180) * membraneWidthMm
}

/**
 * 给定上旋角变化 Δθ，计算压合中心的位移角度
 */
export const computePressingCenterShift = (deltaThetaDeg: number): number => {
  return deltaThetaDeg
}

/**
 * 计算两个角度之间的最小差（考虑圆周）
 */
export const angularDifference = (a: number, b: number): number => {
  let diff = ((a - b) % 360 + 360) % 360
  if (diff > 180) diff = 360 - diff
  return diff
}
