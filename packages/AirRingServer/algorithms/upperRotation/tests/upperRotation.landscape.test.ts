import { test, expect } from 'vitest'
import { buildTripSegment } from './buildTripSegment'
import { mockRoller } from '@jjsk/simulation'
import { TripSegment } from '../types'

// Re-implement core internals for loss landscape analysis
function trapezoidalPosition(progress: number, accelRatio: number): number {
  const normFactor = 1 / (1 - accelRatio)
  let raw: number
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

type Seg = { data: { t: number; y: number; offsetDeg: number }[]; duration: number; accelRatio: number }

function evaluatePulseExpanded(segs: Seg[], thetaDeg: number, NUM_BINS = 36): number {
  const thetaRad = (thetaDeg * Math.PI) / 180
  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0, tY2 = 0, tN = 0

  const add = (idx: number, y: number) => {
    const n = ++bc[idx]; const d = y - bm[idx]
    bm[idx] += d / n; b2[idx] += d * (y - bm[idx])
  }

  for (const { data, duration, accelRatio } of segs) {
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaRad + (p.offsetDeg * Math.PI) / 180
      const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      add(Math.floor(np / bw) % NUM_BINS, p.y)
      tY += p.y; tY2 += p.y * p.y; tN++
    }
  }
  let tv = 0, vc = 0
  for (let i = 0; i < NUM_BINS; i++) { if (bc[i] < 2) continue; tv += b2[i] / bc[i]; vc++ }
  if (vc === 0 || tN < 2) return Infinity
  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

function evaluateOriginalMethod(
  segs: { data: readonly { t: number; y: number }[]; duration: number }[],
  thetaDeg: number, NUM_BINS = 36
): number {
  const thetaRad = (thetaDeg * Math.PI) / 180
  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0, tY2 = 0, tN = 0
  const add = (idx: number, y: number) => {
    const n = ++bc[idx]; const d = y - bm[idx]
    bm[idx] += d / n; b2[idx] += d * (y - bm[idx])
  }
  for (const { data, duration } of segs) {
    const accelRatio = Math.min(20000, duration * 0.45) / duration
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaRad
      const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      add(Math.floor(np / bw) % NUM_BINS, p.y)
      tY += p.y; tY2 += p.y * p.y; tN++
    }
  }
  let tv = 0, vc = 0
  for (let i = 0; i < NUM_BINS; i++) { if (bc[i] < 2) continue; tv += b2[i] / bc[i]; vc++ }
  if (vc === 0 || tN < 2) return Infinity
  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

for (const dsName of ['01', '02', '04'] as const) {
  test(`loss landscape: 样本数据 ${dsName}`, async () => {
    const thicknessData = (await import(`./data/${dsName}/thickness.json`, { assert: { type: 'json' } }))
      .default as Array<{ HorizontalPulse: number; ProbeValue: number; timestamp: number } | null>
    const upper = (await import(`./data/${dsName}/upper.json`, { assert: { type: 'json' } }))
      .default as Array<{ ForwardRotation: boolean; ReverseRotation: boolean; timestamp: number } | null>
    const info = (await import(`./data/${dsName}/info.json`, { assert: { type: 'json' } }))
      .default as { angle: number }

    const { next: rollerNext } = mockRoller({ speed: (20 * 1000) / 60, RADIUS: 15 * 10 })
    const { next: btsNext } = buildTripSegment()
    let segs: TripSegment[] = []
    for (let i = 0; i < upper.length; i++) {
      const u = upper[i]; const t = thicknessData[i]
      if (u && t) segs = btsNext({ airRing: u, thickness: { ...rollerNext(), ...t } })
    }

    // filterPartialSegments
    const durations = segs.map(s => s.duration).filter(d => d > 0)
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const minDur = median * 0.8
    const fullSegs = segs.filter(s => s.duration >= minDur && s.measurements.length >= 10)
    const useSegs = fullSegs.length >= 2 ? fullSegs : segs.filter(s => s.measurements.length > 0)

    // Compute pulse range (in-bounds only)
    let pulseMin = Infinity, pulseMax = -Infinity
    for (const seg of useSegs) {
      for (const m of seg.measurements) {
        if (m.pulse !== undefined && isFinite(m.pulse) && !isNaN(m.y)) {
          if (m.pulse < pulseMin) pulseMin = m.pulse
          if (m.pulse > pulseMax) pulseMax = m.pulse
        }
      }
    }
    const pulseRange = pulseMax - pulseMin

    // Build normalized data for pulse expansion
    const pulseSegs: Seg[] = []
    for (const seg of useSegs) {
      if (seg.measurements.length < 10 || seg.duration <= 0) continue
      const flipped = seg.isForward ? seg.measurements
        : seg.measurements.map(p => ({ ...p, t: seg.duration - p.t }))
      const expanded = flipped.filter(p => p.pulse !== undefined && !isNaN(p.y))
        .map(p => ({
          t: p.t, y: p.y,
          offsetDeg: ((p.pulse! - pulseMin) / pulseRange - 0.5) * 180,
        }))
      if (expanded.length < 10) continue
      const accelMs = Math.min(20000, seg.duration * 0.45)
      pulseSegs.push({ data: expanded, duration: seg.duration, accelRatio: accelMs / seg.duration })
    }

    // Build normalized data for original method
    const origSegs = useSegs.map(seg => ({
      data: seg.isForward ? seg.measurements
        : seg.measurements.map(p => ({ ...p, t: seg.duration - p.t })),
      duration: seg.duration,
    }))

    // Sweep loss landscape 270° to 359°
    const expected = info.angle
    console.log(`\nDataset ${dsName} (expected=${expected}°, segments=${useSegs.length})`)
    console.log(`pulseRange: [${pulseMin.toFixed(0)}, ${pulseMax.toFixed(0)}] = ${pulseRange.toFixed(0)}`)
    
    // Find minima
    let bestPulse = Infinity, bestPulseTh = 0
    let bestOrig = Infinity, bestOrigTh = 0
    const lossPulse: {th: number; loss: number}[] = []
    const lossOrig: {th: number; loss: number}[] = []
    
    for (let th = 180; th <= 359; th += 1) {
      const lp = evaluatePulseExpanded(pulseSegs, th)
      const lo = evaluateOriginalMethod(origSegs, th)
      lossPulse.push({ th, loss: lp })
      lossOrig.push({ th, loss: lo })
      if (lp < bestPulse) { bestPulse = lp; bestPulseTh = th }
      if (lo < bestOrig) { bestOrig = lo; bestOrigTh = th }
    }

    // Print loss at specific thetas
    const thetas = [bestPulseTh, bestOrigTh, Math.round(expected), 180, 270, 300, 310, 320, 330, 340, 350]
    const uniqueThetas = [...new Set(thetas)].sort((a, b) => a - b)
    console.log('Loss at key theta values:')
    for (const th of uniqueThetas) {
      const lp = evaluatePulseExpanded(pulseSegs, th)
      const lo = evaluateOriginalMethod(origSegs, th)
      const marker = th === Math.round(expected) ? ' ← EXPECTED' : (th === bestPulseTh ? ' ← PULSE MIN' : (th === bestOrigTh ? ' ← ORIG MIN' : ''))
      console.log(`  θ=${th}°: pulse=${lp.toFixed(6)} orig=${lo.toFixed(6)}${marker}`)
    }

    console.log(`PULSE best: θ=${bestPulseTh}° (error ${Math.abs(bestPulseTh - expected).toFixed(1)}°)`)
    console.log(`ORIG  best: θ=${bestOrigTh}° (error ${Math.abs(bestOrigTh - expected).toFixed(1)}°)`)

    expect(true).toBe(true)
  })
}

