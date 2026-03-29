const datasets = ['01', '02', '03', '04', '05']
for (const name of datasets) {
  const thk = require(`./${name}/thickness.json`).filter(x => x)
  const upper = require(`./${name}/upper.json`).filter(x => x)
  const info = require(`./${name}/info.json`)

  // Pulse analysis
  const pulses = thk.map(d => d.HorizontalPulse)
  let changes = 0, rising = null, segStart = 0
  const segs = []
  for (let i = 1; i < pulses.length; i++) {
    const diff = pulses[i] - pulses[i - 1]
    if (Math.abs(diff) < 10) continue
    const cur = diff > 0
    if (rising === null) { rising = cur; continue }
    if (cur !== rising) {
      segs.push({ s: pulses[segStart], e: pulses[i - 1], up: rising, len: i - segStart })
      rising = cur; segStart = i; changes++
    }
  }
  const pAll = pulses.filter(p => p != null)
  const pMin = Math.min(...pAll), pMax = Math.max(...pAll)

  // Estimate in-bounds threshold from bimodal
  const sorted = [...pAll].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // ProbeValue stats - use threshold based on bimodal analysis
  // In sample data: in-bounds = lower ProbeValue (more absorption)
  // Try to estimate typical in-bounds range
  const probeVals = thk.map(d => d.ProbeValue).filter(x => x != null).sort((a, b) => a - b)
  const p10 = probeVals[Math.floor(probeVals.length * 0.1)]
  const p50 = probeVals[Math.floor(probeVals.length * 0.5)]
  const p90 = probeVals[Math.floor(probeVals.length * 0.9)]
  
  // Upper rotation direction change count
  let upperChanges = 0, prevDir = null
  for (const u of upper) {
    const dir = u.ForwardRotation && !u.ReverseRotation
    if (prevDir !== null && dir !== prevDir) upperChanges++
    prevDir = dir
  }

  console.log(`\n=== Dataset ${name} (expected ${info.angle}°) ===`)
  console.log(`  data records: ${thk.length}, upper records: ${upper.length}`)
  console.log(`  pulse range: [${pMin}, ${pMax}] (range=${pMax - pMin})`)
  console.log(`  scanner direction changes: ${changes}`)
  console.log(`  first 5 scan segs: ${JSON.stringify(segs.slice(0, 5))}`)
  console.log(`  ProbeValue p10=${p10} p50=${p50} p90=${p90}`)
  console.log(`  upper rotation changes: ${upperChanges}`)
  
  // Estimate scan seg duration: check if it covers full membrane
  if (segs.length > 2) {
    const fullSegs = segs.filter(s => Math.abs(s.e - s.s) > (pMax - pMin) * 0.5)
    console.log(`  full-membrane scan segs: ${fullSegs.length}/${segs.length} (range threshold: ${((pMax - pMin) * 0.5).toFixed(0)})`)
  }
}

