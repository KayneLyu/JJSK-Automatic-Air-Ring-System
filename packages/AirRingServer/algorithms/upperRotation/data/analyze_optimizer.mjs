// 深度分析模拟器数据特性 - 使用 Node.js 原生运行
import { createBlowFilmSimulator, mockRoller } from '@jjsk/simulation'
import { buildTripSegment } from '../index.ts'

function trapezoidalPosition(progress, accelRatio) {
  const normFactor = 1 / (1 - accelRatio)
  let raw
  if (progress < accelRatio) {
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - accelRatio) {
    const lp = (progress - (1 - accelRatio)) / accelRatio
    raw = 0.5 * accelRatio + (1 - 2 * accelRatio) + (lp - 0.5 * lp * lp) * accelRatio
  } else {
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }
  return raw * normFactor
}

function evaluateOriginal(segs, thetaMaxDeg, NUM_BINS) {
  if (!segs || segs.length === 0) return Infinity
  const bw = (2 * Math.PI) / NUM_BINS
  const allY = []
  let tv = 0, vc = 0
  const bv = Array.from({ length: NUM_BINS }, () => [])
  for (const { data, duration } of segs) {
    if (!data || data.length === 0) continue
    const accelRatio = Math.min(20000, duration * 0.45) / duration
    const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad
      const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      bv[Math.floor(np / bw) % NUM_BINS].push(p.y)
      allY.push(p.y)
    }
  }
  for (let i = 0; i < NUM_BINS; i++) {
    const v = bv[i]
    if (v.length < 2) continue
    let s = 0, sq = 0
    for (const x of v) {
      s += x
      sq += x * x
    }
    const m = s / v.length
    tv += sq / v.length - m * m
    vc++
  }
  if (vc === 0) return Infinity
  const gm = allY.reduce((a, b) => a + b, 0) / allY.length
  const gv = allY.reduce((s, y) => s + (y - gm) ** 2, 0) / allY.length
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

// 快速检查：对于模拟 330° 数据，evaluateOriginal 在不同 theta 下的表现
console.log('=== Quick loss landscape check for θ_max=330° ===')
console.log('如果目标函数在 330° 处不是最小值，需要调整参数或搜索策略')
console.log('Expected pattern: loss 应在 330° 处有清晰的最小值')
console.log('\n如果 loss 在 180° 处最低，则说明目标函数被调整了符号或参数')
console.log('如果 loss 一直递减，说明可能需要扩大搜索范围到 > 359°')
console.log('\n建议优化方向：')
console.log('1. 检查梯形速度曲线参数 accelRatio 是否合适')
console.log('2. 尝试增加 bin 数量（从 36 到 72）')
console.log('3. 考虑改用更鲁棒的搜索策略（如多起点搜索）')
console.log('4. 检查是否需要调整搜索上限（当前 359°）')

