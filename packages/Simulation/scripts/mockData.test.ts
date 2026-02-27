import { mockUpperRotation } from '../mocks/upperRotation.mock'
import { mockThickness } from '../mocks/thickness.mock'
import { mockRoller } from '../mocks/roller.mock'
import { test, vi } from 'vitest'
import { UpperRotationDevice, ThicknessDevice } from '@jjsk/core'

test('生成模拟数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: thicknessNext } = mockThickness({
    THICKNESS_UNIT_PULSE_DIS: 0.12,
    mutationT: 1.25 * 60,
  })
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60, // 20米/分钟
    RADIUS: 15 * 10, // 15厘米
  })

  const thickness: (ThicknessDevice & { timestamp: number })[] = []
  const upperRotation: (UpperRotationDevice & { timestamp: number })[] = []
  // const thickness = createWriteStream('thickness.csv')
  // const upperRotation = createWriteStream('upperRotation.csv')
  // const thicknessStream = format({
  //   headers: [
  //     'HorizontalPulse',
  //     'LeftLimit',
  //     'RightLimit',
  //     'ResetSignal',
  //     'SwapDirection',
  //     'MotionDirection',
  //     'ProbeValue',
  //     'timestamp',
  //   ],
  // })
  // thicknessStream.pipe(thickness)
  // const upperRotationStream = format({
  //   headers: [
  //     'ForwardRotation',
  //     'ReverseRotation',
  //     'ForwardDirectionChange',
  //     'ReverseDirectionChange',
  //     'Reset',
  //     'MotorFrequency',
  //     'timestamp',
  //   ],
  // })
  // upperRotationStream.pipe(upperRotation)
  // 每 10ms 秒更新一次数据
  setInterval(() => {
    const timestamp = Date.now()
    const upperRotationValues = upperRotationNext()
    // upperRotationStream.write({
    //   ...upperRotationValues,
    //   timestamp,
    // })
    upperRotation.push({
      ...upperRotationValues,
      timestamp,
    })
    const thicknessGaugeValue = thicknessNext()
    const rollerValue = rollerNext()
    // thicknessStream.write({
    //   ...thicknessGaugeValue,
    //   ...rollerValue,
    //   timestamp,
    // })
    thickness.push({ ...thicknessGaugeValue, ...rollerValue, timestamp })
  }, 10)

  // 快进 10分钟 生成数据
  vi.advanceTimersByTime(10 * 60 * 1000)
  const result = estimateMaxRotationAngle(thickness, {
    useMinThicknessPosition: false, // recommended: use centroid
    epsilon: 0.5,
    pulseToMm: 0.12,
  })
  console.log(`人字架实际扫掠角度: ${result.maxAngleDeg.toFixed(1)}°`)
  console.log(`有效膜宽: ${result.effectiveMembraneWidthMm.toFixed(1)} mm`)
  console.log(`最薄点偏移: ${result.totalOffsetMm.toFixed(1)} mm`)

  //thicknessStream.end()
  // upperRotationStream.end()
  // await Promise.all([finished(thickness), finished(upperRotation)])
})

export interface EstimatedAngleResult {
  maxOffsetMm: number
  minOffsetMm: number
  totalOffsetMm: number
  maxAngleDeg: number
  effectiveMembraneWidthMm: number
  scanCount: number
}

export interface AngleEstimationConfig {
  pulseToMm: number // e.g., 0.12
  useMinThicknessPosition?: boolean
  epsilon?: number // for weighting, default 0.1
  minValidThickness?: number // default 1.0 (μm), to filter noise
}

interface ScanLine {
  pulses: number[]
  thicknesses: number[]
  centerTime: number
  validStartIndex: number
  validEndIndex: number
}

function groupScans(data: ThicknessDevice[]): ScanLine[] {
  const scans: ScanLine[] = []
  let current: Omit<ScanLine, 'centerTime'> = {
    pulses: [],
    thicknesses: [],
    validStartIndex: -1,
    validEndIndex: -1,
  }

  for (let i = 0; i < data.length; i++) {
    const point = data[i]
    current.pulses.push(point.HorizontalPulse)
    current.thicknesses.push(point.ProbeValue)

    const isEndOfScan =
      point.SwapDirection === true ||
      point.ProbeValue <= 0 ||
      (i + 1 < data.length && data[i + 1].ProbeValue <= 0) ||
      i === data.length - 1

    if (isEndOfScan) {
      if (current.pulses.length > 5) {
        // Find contiguous valid region where ProbeValue > minValid
        let start = -1,
          end = -1
        for (let j = 0; j < current.thicknesses.length; j++) {
          if (current.thicknesses[j] > 0) {
            if (start === -1) start = j
            end = j
          }
        }
        if (start !== -1 && end > start + 2) {
          current.validStartIndex = start
          current.validEndIndex = end
          const midIdx = Math.floor((start + end) / 2)
          const centerTime =
            data[i - (current.pulses.length - 1 - midIdx)]?.timestamp || 0
          scans.push({
            ...current,
            centerTime,
          })
        }
      }
      current = {
        pulses: [],
        thicknesses: [],
        validStartIndex: -1,
        validEndIndex: -1,
      }
    }
  }
  return scans
}

function computeFeaturePosition(
  scan: ScanLine,
  config: AngleEstimationConfig
): number {
  const { pulses, thicknesses, validStartIndex, validEndIndex } = scan
  const validPulses = pulses.slice(validStartIndex, validEndIndex + 1)
  const validThicks = thicknesses.slice(validStartIndex, validEndIndex + 1)

  if (validPulses.length === 0) return pulses[Math.floor(pulses.length / 2)]

  const { useMinThicknessPosition = false, epsilon = 0.1 } = config

  if (useMinThicknessPosition) {
    let minIdx = 0
    for (let i = 1; i < validThicks.length; i++) {
      if (validThicks[i] < validThicks[minIdx]) {
        minIdx = i
      }
    }
    return validPulses[minIdx]
  } else {
    // Weighted centroid: thinner = higher weight
    let sumWX = 0,
      sumW = 0
    for (let i = 0; i < validThicks.length; i++) {
      const w = 1 / (validThicks[i] + epsilon)
      sumWX += w * validPulses[i]
      sumW += w
    }
    return sumW > 0
      ? sumWX / sumW
      : validPulses[Math.floor(validPulses.length / 2)]
  }
}

export function estimateMaxRotationAngle(
  thicknessData: ThicknessDevice[],
  config: AngleEstimationConfig
): EstimatedAngleResult {
  const { pulseToMm, minValidThickness = 1.0 } = config

  if (!thicknessData || thicknessData.length === 0) {
    throw new Error('Input data is empty')
  }

  // Step 1: Group into scan lines
  const scans = groupScans(
    thicknessData.filter((p) => p.ProbeValue >= minValidThickness)
  )
  if (scans.length < 2) {
    throw new Error('Not enough valid scan lines (need at least 2)')
  }

  // Step 2: Estimate effective membrane width from edge pulses
  const edges = scans.map((scan) => ({
    left: scan.pulses[scan.validStartIndex],
    right: scan.pulses[scan.validEndIndex],
  }))

  // Use median to reject outliers
  const lefts = edges.map((e) => e.left).sort((a, b) => a - b)
  const rights = edges.map((e) => e.right).sort((a, b) => a - b)
  const medianLeft = lefts[Math.floor(lefts.length / 2)]
  const medianRight = rights[Math.floor(rights.length / 2)]
  const effectivePulseWidth = medianRight - medianLeft
  const effectiveMmWidth = Math.max(effectivePulseWidth * pulseToMm, 1e-3)

  // Step 3: Compute feature position (centroid or min) for each scan
  const featurePulses = scans.map((scan) =>
    computeFeaturePosition(scan, config)
  )
  const featureMm = featurePulses.map((p) => p * pulseToMm)

  const xMin = Math.min(...featureMm)
  const xMax = Math.max(...featureMm)
  const deltaX = xMax - xMin

  // Step 4: Map to sweep angle — USE 180° MODEL (physically correct for diameter press)
  let sweepAngleDeg = (deltaX / effectiveMmWidth) * 180
  sweepAngleDeg = Math.min(sweepAngleDeg, 179.9) // cannot reach 180 in practice

  return {
    maxOffsetMm: xMax,
    minOffsetMm: xMin,
    totalOffsetMm: deltaX,
    maxAngleDeg: sweepAngleDeg,
    effectiveMembraneWidthMm: effectiveMmWidth,
    scanCount: scans.length,
  }
}
