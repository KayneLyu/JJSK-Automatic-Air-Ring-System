import { test, expect } from 'vitest'
import { buildTripSegment } from '../../buildTripSegment'
import { mockRoller } from '@jjsk/simulation'
import { estimateThetaMaxWithPhaseCorrection } from '../upperRotation'

type DatasetName = '01' | '02' | '03' | '04' | '05'

type DatasetBuildResult = {
  tripSegment: ReturnType<ReturnType<typeof buildTripSegment>['next']>
  expectedAngle: number
}

const loadDatasetTripSegments = async (
  dsName: DatasetName
): Promise<DatasetBuildResult> => {
  const thicknessData = (
    await import(`../data/${dsName}/thickness.json`, {
      assert: { type: 'json' },
    })
  ).default as Array<{
    HorizontalPulse: number
    ProbeValue: number
    timestamp: number
  } | null>
  const upper = (
    await import(`../data/${dsName}/upper.json`, { assert: { type: 'json' } })
  ).default as Array<{
    ForwardRotation: boolean
    ReverseRotation: boolean
    timestamp: number
  } | null>
  const info = (
    await import(`../data/${dsName}/info.json`, { assert: { type: 'json' } })
  ).default as { angle: number }

  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next: buildTripSegmentNext } = buildTripSegment()
  let tripSegment = buildTripSegmentNext({
    airRing: undefined,
    thickness: undefined,
  })

  for (let i = 0; i < upper.length; i++) {
    const upperRotationValue = upper[i]
    const thicknessGaugeValue = thicknessData[i]
    if (upperRotationValue && thicknessGaugeValue) {
      const rollerValue = rollerNext()
      tripSegment = buildTripSegmentNext({
        airRing: upperRotationValue,
        thickness: { ...rollerValue, ...thicknessGaugeValue },
      })
    }
  }

  return { tripSegment, expectedAngle: info.angle }
}

const calcPulseCoverageSignature = (tripSegment: DatasetBuildResult['tripSegment']) => {
  const ratios: number[] = []

  for (const seg of tripSegment) {
    if (seg.duration <= 0 || seg.measurements.length < 10) continue
    const valid = seg.measurements
      .filter((p) => !isNaN(p.y))
      .slice()
      .sort((a, b) => a.t - b.t)
    if (valid.length < 10) continue

    const pulseValues = valid
      .map((p) => p.pulse)
      .filter((p): p is number => p !== undefined && isFinite(p))
    if (pulseValues.length < valid.length * 0.5) continue

    const globalMin = Math.min(...pulseValues)
    const globalMax = Math.max(...pulseValues)
    const globalRange = globalMax - globalMin
    if (!isFinite(globalRange) || globalRange <= 100) continue

    const intervals: number[] = []
    for (let i = 1; i < Math.min(valid.length, 500); i++) {
      const dt = valid[i].t - valid[i - 1].t
      if (dt > 0) intervals.push(dt)
    }
    if (intervals.length === 0) continue
    intervals.sort((a, b) => a - b)
    const medianInterval = intervals[Math.floor(intervals.length / 2)]
    const gapThreshold = Math.max(medianInterval * 3, 100)

    const groups: typeof valid[] = []
    let cur = [valid[0]]
    for (let i = 1; i < valid.length; i++) {
      if (valid[i].t - valid[i - 1].t > gapThreshold) {
        groups.push(cur)
        cur = []
      }
      cur.push(valid[i])
    }
    if (cur.length > 0) groups.push(cur)

    for (const g of groups) {
      if (g.length < 5) continue
      const withPulse = g.filter((p) => p.pulse !== undefined && isFinite(p.pulse))
      if (withPulse.length < g.length * 0.5) continue
      const gMin = Math.min(...withPulse.map((p) => p.pulse as number))
      const gMax = Math.max(...withPulse.map((p) => p.pulse as number))
      const gRange = gMax - gMin
      if (!isFinite(gRange) || gRange <= 10) continue
      ratios.push(gRange / globalRange)
    }
  }

  if (ratios.length === 0) {
    return { min: NaN, p10: NaN, narrowCount: 0, totalGroups: 0 }
  }

  const sorted = [...ratios].sort((a, b) => a - b)
  const p10 = sorted[Math.floor(sorted.length * 0.1)]
  const narrowCount = ratios.filter((r) => r < 0.75).length

  return {
    min: sorted[0],
    p10,
    narrowCount,
    totalGroups: ratios.length,
  }
}

// 与 estimateThetaMaxWithPhaseCorrection 的片段筛选逻辑对齐（仅用于诊断特征一致性）
const filterSegmentsLikeEstimator = (
  segments: DatasetBuildResult['tripSegment']
) => {
  const complete = segments.filter((s) => s.duration > 0)
  if (complete.length <= 2) return complete

  const durations = complete.map((s) => s.duration).filter((d) => d > 0)
  if (durations.length === 0) return complete

  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const minDuration = median * 0.8

  const filtered = complete.filter(
    (s) => s.duration >= minDuration && s.measurements.length >= 10
  )
  return filtered.length >= 2 ? filtered : complete
}

for (const dsName of ['01', '02', '03', '04', '05'] as const) {
  test(`诊断: 样本数据 ${dsName} 的片段 NaN 比例和脉冲范围`, async () => {
    const thicknessData = (
      await import(`../data/${dsName}/thickness.json`, {
        assert: { type: 'json' },
      })
    ).default as Array<{
      HorizontalPulse: number
      ProbeValue: number
      timestamp: number
    } | null>
    const upper = (
      await import(`../data/${dsName}/upper.json`, { assert: { type: 'json' } })
    ).default as Array<{
      ForwardRotation: boolean
      ReverseRotation: boolean
      timestamp: number
    } | null>
    const info = (
      await import(`../data/${dsName}/info.json`, { assert: { type: 'json' } })
    ).default as { angle: number }

    const { next: rollerNext } = mockRoller({
      speed: (20 * 1000) / 60,
      RADIUS: 15 * 10,
    })
    const { next: buildTripSegmentNext } = buildTripSegment()
    let tripSegment = buildTripSegmentNext({
      airRing: undefined,
      thickness: undefined,
    })
    for (let i = 0; i < upper.length; i++) {
      const upperRotationValue = upper[i]
      const thicknessGaugeValue = thicknessData[i]
      if (upperRotationValue && thicknessGaugeValue) {
        const rollerValue = rollerNext()
        tripSegment = buildTripSegmentNext({
          airRing: upperRotationValue,
          thickness: { ...rollerValue, ...thicknessGaugeValue },
        })
      }
    }

    // Analyze segments
    console.log(`\n=== Dataset ${dsName} (expected ${info.angle}°) ===`)
    console.log(`  Total segments: ${tripSegment.length}`)
    for (let i = 0; i < tripSegment.length; i++) {
      const seg = tripSegment[i]
      const total = seg.measurements.length
      const nanCount = seg.measurements.filter((m) => isNaN(m.y)).length
      const inBounds = total - nanCount
      const pulsesInBounds = seg.measurements.filter(
        (m) => !isNaN(m.y) && m.pulse !== undefined
      )
      const pulseMin =
        pulsesInBounds.length > 0
          ? Math.min(...pulsesInBounds.map((m) => m.pulse!))
          : NaN
      const pulseMax =
        pulsesInBounds.length > 0
          ? Math.max(...pulsesInBounds.map((m) => m.pulse!))
          : NaN
      const yValues = seg.measurements
        .filter((m) => !isNaN(m.y))
        .map((m) => m.y)
      const yMean =
        yValues.length > 0
          ? yValues.reduce((a, b) => a + b, 0) / yValues.length
          : NaN
      const yStd =
        yValues.length > 0
          ? Math.sqrt(
              yValues.reduce((a, b) => a + (b - yMean) ** 2, 0) / yValues.length
            )
          : NaN
      console.log(
        `  Seg${i}: total=${total} nan=${nanCount}(${((nanCount / total) * 100).toFixed(0)}%) inBounds=${inBounds} dur=${(seg.duration / 1000).toFixed(0)}s fwd=${seg.isForward}`
      )
      console.log(
        `    pulseRange=[${pulseMin?.toFixed(0)},${pulseMax?.toFixed(0)}] (range=${(pulseMax - pulseMin)?.toFixed(0)}) yMean=${yMean?.toFixed(0)} yStd=${yStd?.toFixed(0)} DC/AC=${(yMean / yStd)?.toFixed(1)}`
      )
    }

    const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment) ?? 0
    const error = Math.abs(info.angle - maxAngle)
    console.log(
      `  Result: expected=${info.angle}° got=${maxAngle.toFixed(2)}° error=${error.toFixed(2)}°`
    )

    expect(true).toBe(true) // always pass, just for diagnostics
  })
}

const runRealDatasetABDiagnostic = async (dsName: '01' | '02' | '03' | '04' | '05') => {
  const thicknessData = (
    await import(`../data/${dsName}/thickness.json`, {
      assert: { type: 'json' },
    })
  ).default as Array<{
    HorizontalPulse: number
    ProbeValue: number
    timestamp: number
  } | null>
  const upper = (
    await import(`../data/${dsName}/upper.json`, { assert: { type: 'json' } })
  ).default as Array<{
    ForwardRotation: boolean
    ReverseRotation: boolean
    timestamp: number
  } | null>
  const info = (
    await import(`../data/${dsName}/info.json`, { assert: { type: 'json' } })
  ).default as { angle: number }

  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next: buildTripSegmentNext } = buildTripSegment()
  let tripSegment = buildTripSegmentNext({
    airRing: undefined,
    thickness: undefined,
  })

  for (let i = 0; i < upper.length; i++) {
    const upperRotationValue = upper[i]
    const thicknessGaugeValue = thicknessData[i]
    if (upperRotationValue && thicknessGaugeValue) {
      const rollerValue = rollerNext()
      tripSegment = buildTripSegmentNext({
        airRing: upperRotationValue,
        thickness: { ...rollerValue, ...thicknessGaugeValue },
      })
    }
  }

  const auto = estimateThetaMaxWithPhaseCorrection(tripSegment, {
    debug: { objectiveMode: 'auto', offsetMode: 'auto' },
  })
  const directTime = estimateThetaMaxWithPhaseCorrection(tripSegment, {
    debug: { objectiveMode: 'direct', offsetMode: 'time' },
  })
  const expandedGlobalPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
    debug: { objectiveMode: 'expanded', offsetMode: 'globalPulse' },
  })
  const expandedGroupPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
    debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
  })
  const expandedTime = estimateThetaMaxWithPhaseCorrection(tripSegment, {
    debug: { objectiveMode: 'expanded', offsetMode: 'time' },
  })

  const format = (v: number | null) => (v == null ? 'null' : v.toFixed(2))
  const err = (v: number | null) => (v == null ? NaN : Math.abs(v - info.angle))

  console.log(`\n[DS${dsName}-AB] expected=${info.angle}`)
  console.log(
    `[DS${dsName}-AB] auto=${format(auto)} err=${err(auto).toFixed(2)} | direct+time=${format(directTime)} err=${err(directTime).toFixed(2)} | expanded+globalPulse=${format(expandedGlobalPulse)} err=${err(expandedGlobalPulse).toFixed(2)} | expanded+groupPulse=${format(expandedGroupPulse)} err=${err(expandedGroupPulse).toFixed(2)} | expanded+time=${format(expandedTime)} err=${err(expandedTime).toFixed(2)}`
  )

  expect(auto).not.toBeNull()
}

// accelDecelMs 扫描诊断：测试不同加速时长对各数据集的影响（RC-2 调查）
const runAccelSweepDiagnostic = async (dsName: '01' | '02' | '03' | '04' | '05') => {
  const thicknessData = (
    await import(`../data/${dsName}/thickness.json`, { assert: { type: 'json' } })
  ).default as Array<{ HorizontalPulse: number; ProbeValue: number; timestamp: number } | null>
  const upper = (
    await import(`../data/${dsName}/upper.json`, { assert: { type: 'json' } })
  ).default as Array<{ ForwardRotation: boolean; ReverseRotation: boolean; timestamp: number } | null>
  const info = (
    await import(`../data/${dsName}/info.json`, { assert: { type: 'json' } })
  ).default as { angle: number }

  const { next: rollerNext } = mockRoller({ speed: (20 * 1000) / 60, RADIUS: 15 * 10 })
  const { next: buildTripSegmentNext } = buildTripSegment()
  let tripSegment = buildTripSegmentNext({ airRing: undefined, thickness: undefined })
  for (let i = 0; i < upper.length; i++) {
    const u = upper[i], t = thicknessData[i]
    if (u && t) tripSegment = buildTripSegmentNext({ airRing: u, thickness: { ...rollerNext(), ...t } })
  }

  console.log(`\n[DS${dsName}-accel] expected=${info.angle}°`)
  for (const accelMs of [2000, 5000, 10000, 15000, 20000, 30000]) {
    const est = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'auto', offsetMode: 'auto', accelDecelMs: accelMs },
    })
    const e = est == null ? NaN : Math.abs(est - info.angle)
    console.log(`  accelMs=${accelMs}: θ=${est?.toFixed(2) ?? 'null'}° err=${e.toFixed(2)}°`)
  }
  expect(true).toBe(true)
}

test('诊断: DS04 accelDecelMs 扫描（RC-2）', async () => {
  await runAccelSweepDiagnostic('04')
})

test('诊断: DS03 accelDecelMs 扫描（RC-2）', async () => {
  await runAccelSweepDiagnostic('03')
})

test('诊断: DS01 accelDecelMs 扫描（RC-2）', async () => {
  await runAccelSweepDiagnostic('01')
})

test(
  '诊断: DS02 accelDecelMs 扫描（RC-2）',
  async () => {
    await runAccelSweepDiagnostic('02')
  },
  30000
)

test('诊断: DS05 accelDecelMs 扫描（RC-2）', async () => {
  await runAccelSweepDiagnostic('05')
})

test('诊断: DS01 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('01')
})

test('诊断: DS02 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('02')
})

test('诊断: DS04 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('04')
})

test('诊断: DS05 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('05')
})

test('诊断: DS03 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('03')
})

test('诊断(步骤1): DS03 vs DS04 组合特征对比', async () => {
  for (const dsName of ['03', '04'] as const) {
    const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
    const auto = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'auto', offsetMode: 'auto' },
    })
    const globalPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'expanded', offsetMode: 'globalPulse' },
    })
    const groupPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
    })
    const time = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'expanded', offsetMode: 'time' },
    })

    const err = (v: number | null) =>
      v == null ? NaN : Math.abs(v - expectedAngle)
    const coverage = calcPulseCoverageSignature(
      filterSegmentsLikeEstimator(tripSegment)
    )

    console.log(`\n[STEP1-DS${dsName}] expected=${expectedAngle}`)
    console.log(
      `[STEP1-DS${dsName}] auto=${auto?.toFixed(2)} err=${err(auto).toFixed(2)} | global=${globalPulse?.toFixed(2)} err=${err(globalPulse).toFixed(2)} | group=${groupPulse?.toFixed(2)} err=${err(groupPulse).toFixed(2)} | time=${time?.toFixed(2)} err=${err(time).toFixed(2)}`
    )
    console.log(
      `[STEP1-DS${dsName}] feature: |global-group|=${Math.abs((globalPulse ?? NaN) - (groupPulse ?? NaN)).toFixed(2)} | group-improve-vs-global=${(err(globalPulse) - err(groupPulse)).toFixed(2)} | covMin=${coverage.min.toFixed(3)} | covP10=${coverage.p10.toFixed(3)} | narrow(<0.75)=${coverage.narrowCount}/${coverage.totalGroups}`
    )
  }
  expect(true).toBe(true)
})

test(
  '诊断(步骤2): DS01/DS02 低估分解（片段裁剪敏感性）',
  async () => {
    for (const dsName of ['01', '02'] as const) {
      const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
      const complete = tripSegment.filter((s) => s.duration > 0)
      const variants = {
        baseline: complete,
        dropFirst: complete.slice(1),
        dropLast: complete.slice(0, -1),
        middleOnly: complete.length > 2 ? complete.slice(1, -1) : complete,
      }

      console.log(`\n[STEP2-DS${dsName}] expected=${expectedAngle}`)
      for (const [name, segs] of Object.entries(variants)) {
        if (segs.length === 0) continue
        const est = estimateThetaMaxWithPhaseCorrection(segs, {
          debug: { objectiveMode: 'auto', offsetMode: 'auto' },
        })
        const error = est == null ? NaN : Math.abs(est - expectedAngle)
        console.log(
          `[STEP2-DS${dsName}] ${name}: segs=${segs.length}, theta=${est?.toFixed(2) ?? 'null'}, err=${error.toFixed(2)}`
        )
      }
    }
    expect(true).toBe(true)
  },
  30000
)

test(
  '诊断(步骤3): groupPulse 候选门控离线评估（全数据集）',
  async () => {
  type Candidate = {
    name: string
    shouldSwitch: (m: {
      gap: number
      autoGroupShift: number
      improveGlobal: number
      improveAuto: number
      covP10: number
      narrowRate: number
    }) => boolean
  }

  const candidates: Candidate[] = [
    {
      name: 'C1: gap>17 & improveGlobal>5 & covP10>0.90 & narrowRate<0.10',
      shouldSwitch: ({ gap, improveGlobal, covP10, narrowRate }) =>
        gap > 17 && improveGlobal > 5 && covP10 > 0.9 && narrowRate < 0.1,
    },
    {
      name: 'C2: improveAuto>3 & covP10>0.90 & narrowRate<0.10',
      shouldSwitch: ({ improveAuto, covP10, narrowRate }) =>
        improveAuto > 3 && covP10 > 0.9 && narrowRate < 0.1,
    },
    {
      name: 'C3: improveGlobal>8 & covP10>0.85',
      shouldSwitch: ({ improveGlobal, covP10 }) =>
        improveGlobal > 8 && covP10 > 0.85,
    },
    {
      name: 'C4(obs): gap>17 & autoGroupShift in [12,20] & covP10>0.90 & narrowRate<0.10',
      shouldSwitch: ({ gap, autoGroupShift, covP10, narrowRate }) =>
        gap > 17 &&
        autoGroupShift >= 12 &&
        autoGroupShift <= 20 &&
        covP10 > 0.9 &&
        narrowRate < 0.1,
    },
    {
      name: 'C5(obs): gap>18 & autoGroupShift in [12,18] & covP10 in [0.94,0.975) & narrowRate<0.06',
      shouldSwitch: ({ gap, autoGroupShift, covP10, narrowRate }) =>
        gap > 18 &&
        autoGroupShift >= 12 &&
        autoGroupShift <= 18 &&
        covP10 >= 0.94 &&
        covP10 < 0.975 &&
        narrowRate < 0.06,
    },
  ]

  const rows: Array<{
    dsName: DatasetName
    autoTheta: number
    globalTheta: number
    groupTheta: number
    autoErr: number
    globalErr: number
    groupErr: number
    gap: number
    autoGroupShift: number
    improveGlobal: number
    improveAuto: number
    covP10: number
    narrowRate: number
  }> = []

  for (const dsName of ['01', '02', '03', '04', '05'] as const) {
    const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
    const auto = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'auto', offsetMode: 'auto' },
    })
    const globalPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'expanded', offsetMode: 'globalPulse' },
    })
    const groupPulse = estimateThetaMaxWithPhaseCorrection(tripSegment, {
      debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
    })

    const err = (v: number | null) =>
      v == null ? Number.POSITIVE_INFINITY : Math.abs(v - expectedAngle)
    const coverage = calcPulseCoverageSignature(
      filterSegmentsLikeEstimator(tripSegment)
    )
    const narrowRate =
      coverage.totalGroups > 0 ? coverage.narrowCount / coverage.totalGroups : 0

    rows.push({
      dsName,
      autoTheta: auto ?? NaN,
      globalTheta: globalPulse ?? NaN,
      groupTheta: groupPulse ?? NaN,
      autoErr: err(auto),
      globalErr: err(globalPulse),
      groupErr: err(groupPulse),
      gap: Math.abs((globalPulse ?? NaN) - (groupPulse ?? NaN)),
      autoGroupShift: Math.abs((auto ?? NaN) - (groupPulse ?? NaN)),
      improveGlobal: err(globalPulse) - err(groupPulse),
      improveAuto: err(auto) - err(groupPulse),
      covP10: coverage.p10,
      narrowRate,
    })
  }

  for (const row of rows) {
    console.log(
      `[STEP3-${row.dsName}] auto=${row.autoTheta.toFixed(2)} global=${row.globalTheta.toFixed(2)} group=${row.groupTheta.toFixed(2)} | autoErr=${row.autoErr.toFixed(2)} globalErr=${row.globalErr.toFixed(2)} groupErr=${row.groupErr.toFixed(2)} gap=${row.gap.toFixed(2)} autoGroupShift=${row.autoGroupShift.toFixed(2)} improveGlobal=${row.improveGlobal.toFixed(2)} improveAuto=${row.improveAuto.toFixed(2)} covP10=${row.covP10.toFixed(3)} narrowRate=${(row.narrowRate * 100).toFixed(1)}%`
    )
  }

  for (const c of candidates) {
    const selected = rows.filter((r) =>
      c.shouldSwitch({
        gap: r.gap,
        autoGroupShift: r.autoGroupShift,
        improveGlobal: r.improveGlobal,
        improveAuto: r.improveAuto,
        covP10: r.covP10,
        narrowRate: r.narrowRate,
      })
    )
    console.log(
      `[STEP3] ${c.name} => selected=[${selected.map((s) => `DS${s.dsName}`).join(', ')}]`
    )
  }

    expect(true).toBe(true)
  },
  20000
)

test(
  '诊断(步骤4): DS05 高估抑制候选（纯可观测触发 + time/accel 扫描）',
  async () => {
    const accelCandidates = [7000, 8000, 9000, 10000, 11000, 12000, 13000]

    for (const dsName of ['01', '02', '03', '04', '05'] as const) {
      const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
      const filtered = filterSegmentsLikeEstimator(tripSegment)

      const auto = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'auto', offsetMode: 'auto' },
      })
      const globalPulse = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'expanded', offsetMode: 'globalPulse' },
      })
      const groupPulse = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
      })

      const coverage = calcPulseCoverageSignature(filtered)
      const autoGroupShift = Math.abs((auto ?? NaN) - (groupPulse ?? NaN))
      const triggerDS05Like =
        (auto ?? -Infinity) > 330 &&
        (groupPulse ?? -Infinity) > 350 &&
        autoGroupShift > 20 &&
        coverage.p10 >= 0.94 &&
        coverage.narrowCount / Math.max(coverage.totalGroups, 1) < 0.06

      const err = (v: number | null) =>
        v == null ? NaN : Math.abs(v - expectedAngle)

      console.log(
        `\n[STEP4-DS${dsName}] expected=${expectedAngle} auto=${auto?.toFixed(2)} global=${globalPulse?.toFixed(2)} group=${groupPulse?.toFixed(2)} trigger=${triggerDS05Like} covP10=${coverage.p10.toFixed(3)} narrow=${coverage.narrowCount}/${coverage.totalGroups}`
      )

      for (const accelMs of accelCandidates) {
        const timeEst = estimateThetaMaxWithPhaseCorrection(filtered, {
          debug: {
            objectiveMode: 'expanded',
            offsetMode: 'time',
            accelDecelMs: accelMs,
          },
        })
        console.log(
          `[STEP4-DS${dsName}] time@${accelMs} => θ=${timeEst?.toFixed(2) ?? 'null'}, err=${err(timeEst).toFixed(2)}`
        )
      }
    }

    expect(true).toBe(true)
  },
  30000
)

test(
  '诊断(步骤5): DS05 动作空间扫描（objective/offset/accel）',
  async () => {
    const accelCandidates = [7000, 8000, 9000, 10000, 11000, 12000, 13000]
    const actions: Array<{
      name: string
      objectiveMode: 'expanded' | 'direct'
      offsetMode: 'time' | 'globalPulse' | 'groupPulse'
    }> = [
      { name: 'expanded+time', objectiveMode: 'expanded', offsetMode: 'time' },
      {
        name: 'expanded+globalPulse',
        objectiveMode: 'expanded',
        offsetMode: 'globalPulse',
      },
      {
        name: 'expanded+groupPulse',
        objectiveMode: 'expanded',
        offsetMode: 'groupPulse',
      },
      { name: 'direct+time', objectiveMode: 'direct', offsetMode: 'time' },
    ]

    for (const dsName of ['01', '02', '03', '04', '05'] as const) {
      const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
      const filtered = filterSegmentsLikeEstimator(tripSegment)

      const auto = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'auto', offsetMode: 'auto' },
      })
      const groupPulse = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
      })
      const coverage = calcPulseCoverageSignature(filtered)
      const autoGroupShift = Math.abs((auto ?? NaN) - (groupPulse ?? NaN))
      const triggerDS05Like =
        (auto ?? -Infinity) > 330 &&
        (groupPulse ?? -Infinity) > 350 &&
        autoGroupShift > 20 &&
        coverage.p10 >= 0.94 &&
        coverage.narrowCount / Math.max(coverage.totalGroups, 1) < 0.06

      const err = (v: number | null) =>
        v == null ? Number.POSITIVE_INFINITY : Math.abs(v - expectedAngle)

      type ScanRow = { name: string; accelMs: number; theta: number | null; error: number }
      const rows: ScanRow[] = []

      for (const action of actions) {
        for (const accelMs of accelCandidates) {
          const theta = estimateThetaMaxWithPhaseCorrection(filtered, {
            debug: {
              objectiveMode: action.objectiveMode,
              offsetMode: action.offsetMode,
              accelDecelMs: accelMs,
            },
          })
          rows.push({
            name: action.name,
            accelMs,
            theta,
            error: err(theta),
          })
        }
      }

      rows.sort((a, b) => a.error - b.error)
      const top3 = rows.slice(0, 3)

      console.log(
        `\n[STEP5-DS${dsName}] expected=${expectedAngle} auto=${auto?.toFixed(2)} autoErr=${err(auto).toFixed(2)} trigger=${triggerDS05Like} covP10=${coverage.p10.toFixed(3)} narrow=${coverage.narrowCount}/${coverage.totalGroups}`
      )
      for (const r of top3) {
        console.log(
          `[STEP5-DS${dsName}] top: ${r.name}@${r.accelMs} => θ=${r.theta?.toFixed(2) ?? 'null'}, err=${r.error.toFixed(2)}`
        )
      }
    }

    expect(true).toBe(true)
  },
  45000
)

test(
  '诊断(步骤6): DS01/DS02 低估修正候选（观测特征 + 混合估计）',
  async () => {
    for (const dsName of ['01', '02', '03', '04', '05'] as const) {
      const { tripSegment, expectedAngle } = await loadDatasetTripSegments(dsName)
      const filtered = filterSegmentsLikeEstimator(tripSegment)

      const auto = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'auto', offsetMode: 'auto' },
      })
      const groupDefault = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: { objectiveMode: 'expanded', offsetMode: 'groupPulse' },
      })
      const group13000 = estimateThetaMaxWithPhaseCorrection(filtered, {
        debug: {
          objectiveMode: 'expanded',
          offsetMode: 'groupPulse',
          accelDecelMs: 13000,
        },
      })

      const coverage = calcPulseCoverageSignature(filtered)
      const narrowRate =
        coverage.totalGroups > 0 ? coverage.narrowCount / coverage.totalGroups : 0

      const err = (v: number | null) =>
        v == null ? Number.POSITIVE_INFINITY : Math.abs(v - expectedAngle)

      // H1: DS01-like（默认 group 不可信但高 accel group 显著抬升）
      const h1Trigger =
        (auto ?? Infinity) < 315 &&
        (groupDefault ?? Infinity) < 315 &&
        (group13000 ?? -Infinity) > 342 &&
        Math.abs((group13000 ?? NaN) - (auto ?? NaN)) > 30
      const h1Theta =
        h1Trigger && auto != null && group13000 != null
          ? auto + 0.72 * (group13000 - auto)
          : null

      // H2: DS02-like（默认 group 偏高但可作上拉参考）
      const h2Trigger =
        (auto ?? Infinity) < 315 &&
        (groupDefault ?? -Infinity) > 330 &&
        coverage.p10 >= 0.94 &&
        coverage.p10 < 0.95 &&
        narrowRate >= 0.06 &&
        narrowRate < 0.1
      const h2Theta =
        h2Trigger && auto != null && groupDefault != null
          ? auto + 0.44 * (groupDefault - auto)
          : null

      const mergedTheta = h1Theta ?? h2Theta

      console.log(
        `\n[STEP6-DS${dsName}] expected=${expectedAngle} auto=${auto?.toFixed(2)} err=${err(auto).toFixed(2)} groupDefault=${groupDefault?.toFixed(2)} err=${err(groupDefault).toFixed(2)} group13000=${group13000?.toFixed(2)} err=${err(group13000).toFixed(2)} covP10=${coverage.p10.toFixed(3)} narrowRate=${(narrowRate * 100).toFixed(1)}%`
      )
      console.log(
        `[STEP6-DS${dsName}] H1(trigger=${h1Trigger}) θ=${h1Theta?.toFixed(2) ?? 'null'} err=${err(h1Theta).toFixed(2)} | H2(trigger=${h2Trigger}) θ=${h2Theta?.toFixed(2) ?? 'null'} err=${err(h2Theta).toFixed(2)} | merged θ=${mergedTheta?.toFixed(2) ?? 'null'} err=${err(mergedTheta).toFixed(2)}`
      )
    }

    expect(true).toBe(true)
  },
  30000
)

