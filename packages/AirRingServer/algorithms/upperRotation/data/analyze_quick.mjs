import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

for (const ds of ['01', '02', '03', '04', '05']) {
  const data = JSON.parse(readFileSync(join(__dirname, ds, 'thickness.json'), 'utf8'))
  const upper = JSON.parse(readFileSync(join(__dirname, ds, 'upper.json'), 'utf8'))
  const info = JSON.parse(readFileSync(join(__dirname, ds, 'info.json'), 'utf8'))

  const valid = data.filter(d => d)
  const probeValues = valid.map(d => d.ProbeValue)
  const pMin = Math.min(...probeValues), pMax = Math.max(...probeValues)
  const pulseValues = valid.map(d => d.HorizontalPulse)
  const qMin = Math.min(...pulseValues), qMax = Math.max(...pulseValues)
  const timeRange = (valid[valid.length-1].timestamp - valid[0].timestamp) / 1000 / 60
  const validUpper = upper.filter(u => u)
  const fwdChanges = validUpper.filter((u,i) => i>0 && u.ForwardRotation !== validUpper[i-1].ForwardRotation).length

  // Build histogram to detect bimodal threshold
  const totalRange = pMax - pMin
  const NUM_BINS = 50
  const binSize = totalRange / NUM_BINS
  const hist = new Array(NUM_BINS).fill(0)
  for (const v of probeValues) {
    const bin = Math.min(Math.floor((v - pMin) / binSize), NUM_BINS - 1)
    hist[bin]++
  }
  let maxCount = Math.max(...hist)
  const startBin = Math.floor(NUM_BINS * 0.1)
  const endBin = Math.floor(NUM_BINS * 0.9)
  let minCount = Infinity, valleyBin = -1
  for (let i = startBin; i <= endBin; i++) {
    if (hist[i] < minCount) { minCount = hist[i]; valleyBin = i }
  }
  const threshold = pMin + (valleyBin + 0.5) * binSize
  const outOfBounds = probeValues.filter(v => v > threshold).length
  const nanRatio = (outOfBounds / valid.length * 100).toFixed(1)

  // Check pulse direction consistency  
  let pulseFlips = 0
  for (let i = 2; i < Math.min(valid.length, 1000); i++) {
    const d1 = valid[i].HorizontalPulse - valid[i-1].HorizontalPulse
    const d2 = valid[i-1].HorizontalPulse - valid[i-2].HorizontalPulse
    if (d1 * d2 < 0) pulseFlips++
  }

  console.log(`DS${ds}: angle=${info.angle} probe=[${pMin},${pMax}] threshold=${threshold.toFixed(0)} NaN=${nanRatio}% pulse=[${qMin},${qMax}] dur=${timeRange.toFixed(1)}min fwdChanges=${fwdChanges} pulseFlips=${pulseFlips}`)
}

