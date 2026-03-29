import { test, expect } from 'vitest'
import { buildTripSegment } from './buildTripSegment'
import { mockRoller } from '@jjsk/simulation'
import { estimateThetaMaxWithPhaseCorrection } from './upperRotation'

for (const dsName of ['01', '02', '03', '04', '05'] as const) {
  test(`诊断: 样本数据 ${dsName} 的片段 NaN 比例和脉冲范围`, async () => {
    const thicknessData = (
      await import(`./data/${dsName}/thickness.json`, {
        assert: { type: 'json' },
      })
    ).default as Array<{
      HorizontalPulse: number
      ProbeValue: number
      timestamp: number
    } | null>
    const upper = (
      await import(`./data/${dsName}/upper.json`, { assert: { type: 'json' } })
    ).default as Array<{
      ForwardRotation: boolean
      ReverseRotation: boolean
      timestamp: number
    } | null>
    const info = (
      await import(`./data/${dsName}/info.json`, { assert: { type: 'json' } })
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
      const withPulse = seg.measurements.filter(
        (m) => m.pulse !== undefined
      ).length
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

const runRealDatasetABDiagnostic = async (dsName: '03' | '04' | '05') => {
  const thicknessData = (
    await import(`./data/${dsName}/thickness.json`, {
      assert: { type: 'json' },
    })
  ).default as Array<{
    HorizontalPulse: number
    ProbeValue: number
    timestamp: number
  } | null>
  const upper = (
    await import(`./data/${dsName}/upper.json`, { assert: { type: 'json' } })
  ).default as Array<{
    ForwardRotation: boolean
    ReverseRotation: boolean
    timestamp: number
  } | null>
  const info = (
    await import(`./data/${dsName}/info.json`, { assert: { type: 'json' } })
  ).default as { angle: number }

  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next: buildTripSegmentNext } = buildTripSegment()
  let tripSegment = buildTripSegmentNext({ airRing: undefined, thickness: undefined })

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

test('诊断: DS04 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('04')
})

test('诊断: DS05 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('05')
})

test('诊断: DS03 不同目标函数/offset 策略对比', async () => {
  await runRealDatasetABDiagnostic('03')
})
