// 深度分析模拟器数据特性和目标函数表现
import { createBlowFilmSimulator, mockRoller } from '@jjsk/simulation'
import { buildTripSegment } from '../index.ts'
import { TripSegment } from '../../types/index.ts'

function trapezoidalPosition(progress: number, accelRatio: number): number {
  const normFactor = 1 / (1 - accelRatio)
  let raw: number
  if (progress < accelRatio) {
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - accelRatio) {
    const lp = (progress - (1 - accelRatio)) / accelRatio
    raw =
      0.5 * accelRatio +
      (1 - 2 * accelRatio) +
      (lp - 0.5 * lp * lp) * accelRatio
  } else {
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }
  return raw * normFactor
}

function evaluateOriginal(
  segs: { data: readonly any[]; duration: number }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number {
  if (!segs || segs.length === 0) return Infinity
  const bw = (2 * Math.PI) / NUM_BINS
  const allY: number[] = []
  let tv = 0,
    vc = 0
  const bv: number[][] = Array.from({ length: NUM_BINS }, () => [])
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
    let s = 0,
      sq = 0
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

// 测试模拟器数据 210° 和 330°
async function analyzeSimulator(maxAngle: number) {
  console.log(`\n=== 分析模拟器 ${maxAngle}° ===`)

  const CHANNEL_COUNT = 64
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
      maxAngle: maxAngle,
      tripDuration: 360,
    },
    scanner: {
      membraneWidth: 1200,
      tripDuration: 30,
      pulseToDistance: 0.1,
      measurementNoise: 0.1,
    },
    roller: {
      speed: (20 * 1000) / 60,
      roller: { RADIUS: 15 * 10 },
    },
    airRingToScannerDistance: 25 * 1000,
  })

  let tripSegment: TripSegment[] = []
  const { next: buildTripSegmentNext } = buildTripSegment()
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })

  // 快速采集一个完整的循环（正反各一次）
  let iterations = 0
  while (iterations < 100000 && tripSegment.length < 3) {
    const timestamp = Date.now()
    const { rollerDevice, thicknessDevice, upperRotationDevice } =
      simulator.next()
    tripSegment = buildTripSegmentNext({
      airRing: { ...upperRotationDevice, timestamp },
      thickness: { ...thicknessDevice, ...rollerNext(), timestamp },
    })
    iterations++
  }

  console.log(`采集了 ${tripSegment.length} 个完整片段，共 ${iterations} 次迭代`)

  // 分析片段数据
  for (let i = 0; i < tripSegment.length; i++) {
    const seg = tripSegment[i]
    const inBounds = seg.measurements.filter(m => !isNaN(m.y)).length
    const yValues = seg.measurements.filter(m => !isNaN(m.y)).map(m => m.y)
    const yMean = yValues.length > 0 ? yValues.reduce((a, b) => a + b) / yValues.length : NaN
    const yStd = yValues.length > 0 
      ? Math.sqrt(yValues.reduce((a, b) => a + (b - yMean) ** 2) / yValues.length) 
      : NaN
    console.log(`Seg${i}: fwd=${seg.isForward} dur=${(seg.duration/1000).toFixed(1)}s inBounds=${inBounds}/${seg.measurements.length} yMean=${yMean?.toFixed(0)} yStd=${yStd?.toFixed(0)}`)
  }

  // 归一化数据
  const normalized = tripSegment.map((seg) => ({
    data: seg.isForward
      ? seg.measurements
      : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t })),
    duration: seg.duration,
  }))

  // 扫描 loss landscape
  console.log('\nLoss landscape at key angles:')
  const angles = [180, 210, 250, 270, 290, 310, 320, 330, 340, 350, 359]
  for (const th of angles) {
    const loss = evaluateOriginal(normalized, th, 36)
    const marker = th === maxAngle ? ' ← EXPECTED' : ''
    console.log(`  θ=${th}°: loss=${loss.toFixed(6)}${marker}`)
  }

  // 细粒度搜索找最小值
  let bestLoss = Infinity
  let bestTheta = 180
  for (let th = 180; th < 360; th += 1) {
    const loss = evaluateOriginal(normalized, th, 36)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = th
    }
  }
  console.log(`Best found: θ=${bestTheta}° (error=${Math.abs(bestTheta - maxAngle).toFixed(1)}°)`)
}

// 运行分析
(async () => {
  await analyzeSimulator(210)
  await analyzeSimulator(330)
})()

