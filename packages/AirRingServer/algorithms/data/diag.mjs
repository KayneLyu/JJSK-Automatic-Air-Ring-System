// Diagnostic: trace algorithm path and pulse stats per dataset
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const require = createRequire(import.meta.url)

for (const name of ['01', '02', '03', '04', '05']) {
  const thk = require(`./${name}/thickness.json`).filter(x => x)
  const upper = require(`./${name}/upper.json`).filter(x => x)
  const info = require(`./${name}/info.json`)

  // Simulate filterPartialSegments + estimateWithPulseExpansion
  // Step 1: build trip segments (simplified)
  const segments = []
  let currentSeg = null
  let prevDir = null
  let validThk = []
  
  for (let i = 0; i < upper.length; i++) {
    const u = upper[i]
    const t = thk[i]
    const dir = !!u.ForwardRotation && !u.ReverseRotation

    if (t && t.ProbeValue > 0) {
      validThk.push(t)
    }

    if (prevDir === null) {
      currentSeg = { startTime: u.timestamp, isForward: dir, duration: 0, measurements: [] }
      prevDir = dir
    } else if (dir !== prevDir) {
      // direction change: extract measurements
      currentSeg.duration = u.timestamp - currentSeg.startTime
      const measurements = validThk
        .filter(d => d.timestamp >= currentSeg.startTime && d.timestamp <= u.timestamp)
        .map(d => ({ t: d.timestamp - currentSeg.startTime, y: d.ProbeValue, pulse: d.HorizontalPulse }))
      currentSeg.measurements = measurements
      segments.push(currentSeg)
      
      currentSeg = { startTime: u.timestamp, isForward: dir, duration: 0, measurements: [] }
      prevDir = dir
      validThk = []
    }
    if (currentSeg) currentSeg.duration = u.timestamp - currentSeg.startTime
  }

  // Step 2: filter partial segments
  const durations = segments.map(s => s.duration).filter(d => d > 0)
  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const minDur = median * 0.8
  const filtered = segments.filter(s => s.duration >= minDur && s.measurements.length >= 10)
  const useSegs = filtered.length >= 2 ? filtered : segments

  // Step 3: check pulse data
  let total = 0, withPulse = 0
  for (const seg of useSegs.slice(0, 5)) {
    for (const m of seg.measurements) {
      total++
      if (m.pulse !== undefined) withPulse++
    }
  }
  const hasPulse = total > 0 && withPulse / total >= 0.5

  // Step 4: compute pulse range (in-bounds only)
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

  // Step 5: count in-bounds vs total per segment
  const segStats = useSegs.map(s => {
    const total = s.measurements.length
    const inBounds = s.measurements.filter(m => !isNaN(m.y)).length
    const withPulse = s.measurements.filter(m => m.pulse !== undefined).length
    return { total, inBounds, withPulse, duration: s.duration, isForward: s.isForward }
  })

  // Step 6: check in-bounds ProbeValue stats
  const inBoundsY = useSegs.flatMap(s => s.measurements.filter(m => !isNaN(m.y)).map(m => m.y))
  const mean = inBoundsY.length > 0 ? inBoundsY.reduce((a,b)=>a+b,0)/inBoundsY.length : 0
  const std = Math.sqrt(inBoundsY.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,inBoundsY.length))
  
  // Step 7: check NaN ratio
  const allMeasurements = useSegs.flatMap(s => s.measurements)
  const nanCount = allMeasurements.filter(m => isNaN(m.y)).length
  const totalCount = allMeasurements.length

  console.log(`\n=== Dataset ${name} (expected ${info.angle}°) ===`)
  console.log(`  total segments: ${segments.length}, after filter: ${useSegs.length}`)
  console.log(`  median duration: ${(median/1000).toFixed(0)}s, minDur: ${(minDur/1000).toFixed(0)}s`)
  console.log(`  hasPulse: ${hasPulse} (total=${total}, withPulse=${withPulse})`)
  console.log(`  pulseRange: [${pulseMin.toFixed(0)}, ${pulseMax.toFixed(0)}] = ${pulseRange.toFixed(0)}`)
  console.log(`  in-bounds ProbeValue: n=${inBoundsY.length} mean=${mean.toFixed(0)} std=${std.toFixed(0)} DC/AC=${(mean/std).toFixed(1)}`)
  console.log(`  NaN ratio: ${nanCount}/${totalCount} = ${(nanCount/totalCount*100).toFixed(1)}%`)
  console.log(`  segment stats:`, segStats)
}

