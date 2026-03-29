// 分析脉冲偏移角度映射是否正确
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

for (const ds of ['01', '02', '03', '04', '05']) {
  const thicknessRaw = JSON.parse(readFileSync(join(__dirname, ds, 'thickness.json'), 'utf8'))
  const upperRaw = JSON.parse(readFileSync(join(__dirname, ds, 'upper.json'), 'utf8'))
  const info = JSON.parse(readFileSync(join(__dirname, ds, 'info.json'), 'utf8'))

  const thicknessData = thicknessRaw.filter(d => d && d.ProbeValue > 0)
  const upperData = upperRaw.filter(u => u)

  const allRawProbeValues = thicknessData.map(d => d.ProbeValue)
  const globalThreshold = detectBimodalThreshold(allRawProbeValues)

  // Build trip segments
  const segments = []
  let prevSignal = null
  for (const u of upperData) {
    const signal = !!u.ForwardRotation && !u.ReverseRotation
    if (prevSignal === null) {
      segments.push({ startTime: u.timestamp, isForward: signal, duration: 0, measurements: [] })
    } else if (signal !== prevSignal) {
      const prev = segments[segments.length - 1]
      prev.duration = u.timestamp - prev.startTime
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

  const completedSegs = segments.filter(s => s.measurements.length >= 10)
  const durations = completedSegs.map(s => s.duration).filter(d => d > 0)
  if (durations.length === 0) continue
  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const minDur = median * 0.8
  let fullSegs = completedSegs.filter(s => s.duration >= minDur && s.measurements.length >= 10)
  if (fullSegs.length < 2) fullSegs = completedSegs

  // Compute pulse range (in-bounds only)
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

  // Analyze pulse offset mapping
  console.log(`\n=== DS${ds} (expected=${info.angle}°) ===`)
  console.log(`Pulse range: [${pulseMin}, ${pulseMax}] = ${pulseRange}`)
  console.log(`Pulse range as degrees: [${((pulseMin / pulseRange - 0.5) * 180).toFixed(1)}°, ${((pulseMax / pulseRange - 0.5) * 180).toFixed(1)}°]`)

  // Check if pulse is monotonic within each segment
  for (let i = 0; i < fullSegs.length; i++) {
    const seg = fullSegs[i]
    const validM = seg.measurements.filter(m => m.pulse !== undefined && !isNaN(m.y))
    if (validM.length < 10) continue
    let monotonic = true, direction = null
    for (let j = 1; j < validM.length; j++) {
      const d = validM[j].pulse - validM[j-1].pulse
      if (d !== 0) {
        if (direction === null) direction = d > 0 ? 'inc' : 'dec'
        else if ((d > 0 && direction !== 'inc') || (d < 0 && direction !== 'dec')) {
          monotonic = false
          break
        }
      }
    }
    console.log(`  Seg${i} (fwd=${seg.isForward}): monotonic=${monotonic}, direction=${direction}, count=${validM.length}`)
    
    // Check pulse to time correlation
    const sorted = [...validM].sort((a, b) => a.t - b.t)
    if (sorted.length >= 20) {
      const tRange = sorted[sorted.length-1].t - sorted[0].t
      const pRange = Math.max(...sorted.map(m => m.pulse)) - Math.min(...sorted.map(m => m.pulse))
      const correlation = pRange / tRange
      console.log(`    Time: ${tRange.toFixed(0)}ms, Pulse delta: ${pRange}, correlation: ${correlation.toFixed(3)} pulse/ms`)
    }
  }
}

