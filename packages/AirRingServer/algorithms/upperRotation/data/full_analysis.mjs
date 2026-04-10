// Detailed analysis of trip segments and loss landscape for each dataset
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Replicate the core algorithm functions
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

function detectBimodalThreshold(ys) {
  if (ys.length < 50) return null
  let minY = Infinity, maxY = -Infinity
  for (const y of ys) { if (y < minY) minY = y; if (y > maxY) maxY = y }
  const totalRange = maxY - minY
  if (totalRange === 0) return null
  const NUM_BINS = 50
  const binSize = totalRange / NUM_BINS
  const hist = new Array(NUM_BINS).fill(0)
  for (const y of ys) {
    const bin = Math.min(Math.floor((y - minY) / binSize), NUM_BINS - 1)
    hist[bin]++
  }
  let maxCount = 0
  for (const c of hist) if (c > maxCount) maxCount = c
  const startBin = Math.floor(NUM_BINS * 0.1)
  const endBin = Math.floor(NUM_BINS * 0.9)
  let minCount = Infinity, valleyBin = -1
  for (let i = startBin; i <= endBin; i++) {
    if (hist[i] < minCount) { minCount = hist[i]; valleyBin = i }
  }
  if (minCount > maxCount * 0.3) return null
  let leftPeak = 0
  for (let i = 0; i < valleyBin; i++) if (hist[i] > leftPeak) leftPeak = hist[i]
  let rightPeak = 0
  for (let i = valleyBin + 1; i < NUM_BINS; i++) if (hist[i] > rightPeak) rightPeak = hist[i]
  if (leftPeak < maxCount * 0.1) return null
  if (rightPeak < Math.max(minCount * 2 + 2, maxCount * 0.02)) return null
  return minY + (valleyBin + 0.5) * binSize
}

function evaluateExpanded(segs, thetaMaxDeg, NUM_BINS = 36) {
  if (!segs || segs.length === 0) return Infinity
  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0, tY2 = 0, tN = 0
  const add = (idx, y) => {
    const n = ++bc[idx]; const d = y - bm[idx]
    bm[idx] += d / n; b2[idx] += d * (y - bm[idx])
  }
  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180
  for (const { data, duration, accelRatio } of segs) {
    if (!data || data.length === 0) continue
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad + (p.offsetDeg * Math.PI) / 180
      const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      add(Math.floor(np / bw) % NUM_BINS, p.y)
      tY += p.y; tY2 += p.y * p.y; tN++
    }
  }
  let tv = 0, vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue; tv += b2[i] / bc[i]; vc++
  }
  if (vc === 0 || tN < 2) return Infinity
  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

function evaluateSpectral(segs, thetaMaxDeg) {
  if (!segs || segs.length === 0) return Infinity
  let sumY0 = 0, n0 = 0
  for (const { data } of segs) {
    if (!data) continue
    for (const p of data) { if (!isNaN(p.y)) { sumY0 += p.y; n0++ } }
  }
  if (n0 < 3) return Infinity
  const meanY = sumY0 / n0
  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180
  let c2 = 0, s2 = 0, c4 = 0, s4 = 0, sumY2 = 0, n = 0
  for (const { data, duration, accelRatio } of segs) {
    if (!data || data.length === 0) continue
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad + (p.offsetDeg * Math.PI) / 180
      const y = p.y - meanY
      c2 += Math.cos(2 * phi) * y; s2 += Math.sin(2 * phi) * y
      c4 += Math.cos(4 * phi) * y; s4 += Math.sin(4 * phi) * y
      sumY2 += y * y; n++
    }
  }
  if (n < 3) return Infinity
  const gv = sumY2 / n
  if (gv <= 1) return Infinity
  const power = (c2 * c2 + s2 * s2 + c4 * c4 + s4 * s4) / (n * n)
  return -power / gv
}

for (const ds of ['01', '02', '03', '04', '05']) {
  const thicknessRaw = JSON.parse(readFileSync(join(__dirname, ds, 'thickness.json'), 'utf8'))
  const upperRaw = JSON.parse(readFileSync(join(__dirname, ds, 'upper.json'), 'utf8'))
  const info = JSON.parse(readFileSync(join(__dirname, ds, 'info.json'), 'utf8'))

  // Build trip segments (simplified)
  const thicknessData = thicknessRaw.filter(d => d && d.ProbeValue > 0)
  const upperData = upperRaw.filter(u => u)

  const allRawProbeValues = thicknessData.map(d => d.ProbeValue)
  const globalThreshold = detectBimodalThreshold(allRawProbeValues)

  // Detect direction changes
  const segments = []
  let prevSignal = null
  for (const u of upperData) {
    const signal = !!u.ForwardRotation && !u.ReverseRotation
    if (prevSignal === null) {
      segments.push({ startTime: u.timestamp, isForward: signal, duration: 0, measurements: [] })
    } else if (signal !== prevSignal) {
      const prev = segments[segments.length - 1]
      prev.duration = u.timestamp - prev.startTime
      // Extract measurements for previous segment
      const segData = thicknessData
        .filter(d => d.timestamp >= prev.startTime && d.timestamp <= prev.startTime + prev.duration)
        .map(d => ({
          t: d.timestamp - prev.startTime,
          rawY: d.ProbeValue,
          y: globalThreshold !== null && d.ProbeValue > globalThreshold ? NaN : d.ProbeValue,
          pulse: d.HorizontalPulse
        }))
      prev.measurements = segData
      segments.push({ startTime: u.timestamp, isForward: signal, duration: 0, measurements: [] })
    }
    segments[segments.length - 1].duration = u.timestamp - segments[segments.length - 1].startTime
    prevSignal = signal
  }

  // Filter partial segments
  const completedSegs = segments.filter(s => s.measurements.length >= 10)
  const durations = completedSegs.map(s => s.duration).filter(d => d > 0)
  if (durations.length === 0) { console.log(`DS${ds}: no valid segments`); continue }
  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const minDur = median * 0.8
  let fullSegs = completedSegs.filter(s => s.duration >= minDur && s.measurements.length >= 10)
  if (fullSegs.length < 2) fullSegs = completedSegs

  console.log(`\n=== DS${ds} (expected ${info.angle}°) ===`)
  console.log(`  Total segs: ${segments.length}, completed: ${completedSegs.length}, after filter: ${fullSegs.length}`)
  for (const seg of fullSegs) {
    const inBounds = seg.measurements.filter(m => !isNaN(m.y))
    const pulses = inBounds.filter(m => m.pulse !== undefined)
    const pMin = pulses.length ? Math.min(...pulses.map(m => m.pulse)) : NaN
    const pMax = pulses.length ? Math.max(...pulses.map(m => m.pulse)) : NaN
    console.log(`  Seg: fwd=${seg.isForward} dur=${(seg.duration/1000).toFixed(0)}s inBounds=${inBounds.length}/${seg.measurements.length} pulse=[${pMin?.toFixed(0)},${pMax?.toFixed(0)}]`)
  }

  // Build pulse expansion data
  let pulseMin = Infinity, pulseMax = -Infinity
  for (const seg of fullSegs) {
    for (const m of seg.measurements) {
      if (m.pulse !== undefined && isFinite(m.pulse) && !isNaN(m.y)) {
        if (m.pulse < pulseMin) pulseMin = m.pulse
        if (m.pulse > pulseMax) pulseMax = m.pulse
      }
    }
  }
  const pulseRange = pulseMax - pulseMin
  console.log(`  Global pulse range (in-bounds): [${pulseMin}, ${pulseMax}] = ${pulseRange}`)

  const normalized = []
  for (const seg of fullSegs) {
    if (seg.measurements.length < 10 || seg.duration <= 0) continue
    const flipped = seg.isForward
      ? seg.measurements
      : seg.measurements.map(p => ({ ...p, t: seg.duration - p.t }))
    const expanded = flipped
      .filter(p => p.pulse !== undefined && !isNaN(p.y))
      .map(p => ({
        t: p.t,
        y: p.y,
        offsetDeg: ((p.pulse - pulseMin) / pulseRange - 0.5) * 180
      }))
    if (expanded.length < 10) continue
    const accelMs = Math.min(20000, seg.duration * 0.45)
    const accelRatio = accelMs / seg.duration
    normalized.push({ data: expanded, duration: seg.duration, accelRatio })
  }
  console.log(`  Normalized segs for pulse path: ${normalized.length}`)

  // Sweep loss landscape
  let bestBin = Infinity, bestBinTh = 0
  let bestSpec = Infinity, bestSpecTh = 0
  for (let th = 180; th < 360; th++) {
    const lb = evaluateExpanded(normalized, th)
    const ls = evaluateSpectral(normalized, th)
    if (lb < bestBin) { bestBin = lb; bestBinTh = th }
    if (ls < bestSpec) { bestSpec = ls; bestSpecTh = th }
  }
  // Fine search around best
  for (let th = bestBinTh - 5; th <= bestBinTh + 5; th += 0.1) {
    const lb = evaluateExpanded(normalized, th)
    if (lb < bestBin) { bestBin = lb; bestBinTh = th }
  }
  for (let th = bestSpecTh - 5; th <= bestSpecTh + 5; th += 0.1) {
    const ls = evaluateSpectral(normalized, th)
    if (ls < bestSpec) { bestSpec = ls; bestSpecTh = th }
  }

  const expectedBin = evaluateExpanded(normalized, info.angle)
  const expectedSpec = evaluateSpectral(normalized, info.angle)
  console.log(`  Bin variance: best=${bestBinTh.toFixed(1)}° (err=${Math.abs(bestBinTh-info.angle).toFixed(1)}°) loss=${bestBin.toFixed(6)}`)
  console.log(`  Spectral:     best=${bestSpecTh.toFixed(1)}° (err=${Math.abs(bestSpecTh-info.angle).toFixed(1)}°) loss=${bestSpec.toFixed(6)}`)
  console.log(`  At expected ${info.angle}°: binLoss=${expectedBin.toFixed(6)} specLoss=${expectedSpec.toFixed(6)}`)

  // Print loss at key thetas
  const keyThetas = [bestBinTh, bestSpecTh, info.angle, 290, 310, 320, 330, 340, 350].map(t => Math.round(t * 10) / 10)
  const uniqueThetas = [...new Set(keyThetas)].sort((a, b) => a - b)
  for (const th of uniqueThetas) {
    const lb = evaluateExpanded(normalized, th)
    const ls = evaluateSpectral(normalized, th)
    const marker = Math.abs(th - info.angle) < 0.5 ? ' ← EXPECTED' : (Math.abs(th - bestBinTh) < 0.5 ? ' ← BIN_MIN' : (Math.abs(th - bestSpecTh) < 0.5 ? ' ← SPEC_MIN' : ''))
    console.log(`    θ=${th}°: bin=${lb.toFixed(6)} spec=${ls.toFixed(6)}${marker}`)
  }
}

