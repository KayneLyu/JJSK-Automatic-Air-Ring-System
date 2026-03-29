// Simulate detectBimodalThreshold on each dataset's ProbeValues
const datasets = ['01', '02', '03', '04', '05']

function detectBimodalThreshold(ys) {
  if (ys.length < 50) return null
  let minY = Infinity, maxY = -Infinity
  for (const y of ys) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
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
  const startBin = Math.floor(NUM_BINS * 0.1) // 5
  const endBin = Math.floor(NUM_BINS * 0.9)   // 45
  let minCount = Infinity, valleyBin = -1
  for (let i = startBin; i <= endBin; i++) {
    if (hist[i] < minCount) { minCount = hist[i]; valleyBin = i }
  }
  let leftPeak = 0
  for (let i = 0; i < valleyBin; i++) if (hist[i] > leftPeak) leftPeak = hist[i]
  let rightPeak = 0
  for (let i = valleyBin + 1; i < NUM_BINS; i++) if (hist[i] > rightPeak) rightPeak = hist[i]
  
  // Print diagnostics
  const valleyCenter = minY + (valleyBin + 0.5) * binSize
  console.log(`  valleyBin=${valleyBin} valleyCount=${minCount} valleyCenter=${valleyCenter.toFixed(0)}`)
  console.log(`  leftPeak=${leftPeak} rightPeak=${rightPeak} maxCount=${maxCount}`)
  console.log(`  ratio leftPeak/maxCount=${(leftPeak/maxCount).toFixed(3)} rightPeak/maxCount=${(rightPeak/maxCount).toFixed(3)}`)
  console.log(`  condition1 (valley < 30% max): ${minCount <= maxCount * 0.3}`)
  console.log(`  condition2 (leftPeak >= 10% max): ${leftPeak >= maxCount * 0.1}`)
  const newThresh = Math.max(minCount * 2 + 2, maxCount * 0.02)
  console.log(`  new condition3 (rightPeak >= max(2*valley+2, 2%max)=${newThresh.toFixed(0)}): ${rightPeak >= newThresh}`)
  console.log(`  old condition3 (rightPeak >= 20% max): ${rightPeak >= maxCount * 0.2}`)
  
  // Print histogram summary (bins with > 0 counts)
  const nonZero = hist.map((c,i) => ({bin:i, center:(minY+(i+0.5)*binSize).toFixed(0), count:c})).filter(b=>b.count>0)
  console.log(`  histogram (non-zero bins):`)
  nonZero.forEach(b => console.log(`    bin${b.bin} center=${b.center} count=${b.count} ${b.count===maxCount?'[MAX]':''} ${b.bin===valleyBin?'[VALLEY]':''}`))
  
  // Current algorithm result
  if (minCount > maxCount * 0.3) return { result: null, reason: 'valley not deep enough' }
  if (leftPeak < maxCount * 0.1) return { result: null, reason: 'leftPeak too small' }
  if (rightPeak < newThresh) return { result: null, reason: `rightPeak ${rightPeak} < ${newThresh.toFixed(0)}` }
  return { result: valleyCenter, reason: 'OK' }
}

for (const name of datasets) {
  const thk = require(`./${name}/thickness.json`).filter(x => x)
  const info = require(`./${name}/info.json`)
  const allProbes = thk.map(d => d.ProbeValue).filter(x => x != null && x > 0)
  
  console.log(`\n=== Dataset ${name} (expected ${info.angle}°) - n=${allProbes.length} ===`)
  console.log(`  ProbeValue range: [${Math.min(...allProbes).toFixed(0)}, ${Math.max(...allProbes).toFixed(0)}]`)
  const sorted = [...allProbes].sort((a,b)=>a-b)
  console.log(`  p10=${sorted[Math.floor(allProbes.length*0.1)].toFixed(0)} p50=${sorted[Math.floor(allProbes.length*0.5)].toFixed(0)} p90=${sorted[Math.floor(allProbes.length*0.9)].toFixed(0)}`)
  const result = detectBimodalThreshold(allProbes)
  console.log(`  → detectBimodalThreshold result:`, result)
}

