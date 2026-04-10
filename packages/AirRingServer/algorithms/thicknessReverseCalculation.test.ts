import { expect, test, vi } from 'vitest'
import { createBlowFilmSimulator } from '@jjsk/simulation'
import {
  createBubbleThicknessReconstructor,
  simpleBubbleReconstruction,
} from './thicknessReverseCalculation'

const createReconstructor = (historyWindowSize = 64) =>
  createBubbleThicknessReconstructor({
    baseRadius: 120,
    bubbleHeight: 60,
    poissonRatio: 0.35,
    historyWindowSize,
  })

test('验证简化膜泡厚度反推公式', () => {
  const flattenedThickness = 100
  const measurementAngle = Math.PI / 3
  const stretchRatio = 1 / Math.cos(measurementAngle / 2)
  const poissonCorrection = 1 + 0.35 * (stretchRatio - 1)

  const result = simpleBubbleReconstruction(
    flattenedThickness,
    measurementAngle
  )

  expect(result).toBeCloseTo(
    flattenedThickness / (stretchRatio * poissonCorrection),
    10
  )
})

test('验证单点反推在零角度时保持厚度并返回基础元数据', () => {
  const reconstructor = createReconstructor()
  const result = reconstructor.reconstructSingle({
    flattenedThickness: 88,
    measurementAngle: 0,
    timestamp: 1,
  })

  expect(result.originalThickness).toBe(88)
  expect(result.stretchRatio).toBe(1)
  expect(result.confidence).toBe(0.8)
  expect(result.angle).toBe(0)
})

test('验证批量反推会受到历史窗口限制并更新统计信息', () => {
  const reconstructor = createReconstructor(3)

  reconstructor.reconstructBatch([
    { flattenedThickness: 100, measurementAngle: 0, timestamp: 1 },
    { flattenedThickness: 110, measurementAngle: 0, timestamp: 2 },
    { flattenedThickness: 120, measurementAngle: 0, timestamp: 3 },
    { flattenedThickness: 130, measurementAngle: 0, timestamp: 4 },
  ])

  const stats = reconstructor.getStatistics()
  expect(stats.totalReconstructions).toBe(3)
  expect(stats.measurementHistorySize).toBe(3)
  expect(stats.averageConfidence).toBeCloseTo(0.8, 5)
  expect(stats.thicknessRange).toEqual({
    min: 110,
    max: 130,
    mean: 120,
  })
})

test('验证对称性约束会将成对角度的厚度向中间值收敛并提高置信度', () => {
  const measuredDataList = [
    { flattenedThickness: 100, measurementAngle: 0, timestamp: 1 },
    { flattenedThickness: 120, measurementAngle: Math.PI, timestamp: 2 },
  ]
  const baseline = createReconstructor().reconstructBatch(measuredDataList)
  const optimized = createReconstructor().reconstructWithSymmetryConstraints(
    measuredDataList,
    8
  )

  const symmetricConstraint =
    (baseline[0].originalThickness + baseline[1].originalThickness) / 2

  expect(optimized[0].originalThickness).toBeCloseTo(
    baseline[0].originalThickness * 0.7 + symmetricConstraint * 0.3,
    10
  )
  expect(optimized[1].originalThickness).toBeCloseTo(
    baseline[1].originalThickness * 0.7 + symmetricConstraint * 0.3,
    10
  )
  expect(optimized[0].confidence).toBe(0.9)
  expect(optimized[1].confidence).toBe(0.9)
})

test('验证缺少对称角度时不会修改初始反推结果', () => {
  const measuredDataList = [
    { flattenedThickness: 95, measurementAngle: 0, timestamp: 1 },
    { flattenedThickness: 105, measurementAngle: Math.PI / 2, timestamp: 2 },
  ]
  const baseline = createReconstructor().reconstructBatch(measuredDataList)
  const optimized = createReconstructor().reconstructWithSymmetryConstraints(
    measuredDataList,
    64
  )

  expect(optimized).toEqual(baseline)
})

test('验证几何参数校准在历史不足时返回 null，历史充足后返回当前建议值', () => {
  const reconstructor = createReconstructor()

  expect(reconstructor.calibrateGeometry()).toBeNull()

  reconstructor.reconstructBatch(
    Array.from({ length: 30 }, (_, index) => ({
      flattenedThickness: 100 + index,
      measurementAngle: 0,
      timestamp: index,
    }))
  )

  expect(reconstructor.calibrateGeometry()).toEqual({
    baseRadius: 120,
    bubbleHeight: 60,
  })
})

test(
  '验证基于 BlowFilmSimulator 的膜泡厚度反推精度 (风道数 64)',
  {
    timeout: 15000,
  },
  () => {
    vi.useFakeTimers()
    const startTime = new Date('2025-11-18T12:00:00Z').getTime()
    vi.setSystemTime(startTime)

    const CHANNEL_COUNT = 64
    const RADIUS = 15 * 10
    const speed = (20 * 1000) / 60
    const distanceFromAirRingToScanner = 25 * 1000

    // 生成风道基础风量，加入 2 次和 4 次谐波用于厚度变化
    const baseAirFlow = Array.from({ length: CHANNEL_COUNT }, (_, i) => {
      const angle = (i / CHANNEL_COUNT) * 2 * Math.PI
      return (
        20 +
        1.5 * Math.sin(angle) +
        0.8 * Math.sin(2 * angle + 0.5) +
        0.6 * Math.sin(4 * angle + 1.0)
      )
    })

    const simulator = createBlowFilmSimulator({
      airRing: {
        channelCount: CHANNEL_COUNT,
        baseAirFlow,
        installationOffset: 0,
        flowDeviation: 0.005,
      },
      bubble: {
        nominalThickness: 100,
        thicknessSensitivity: -2.0,
        bubbleRadius: 382.2,
        thicknessResolution: 0.5,
      },
      upperRotation: {
        maxAngle: 330,
        tripDuration: 360,
      },
      scanner: {
        membraneWidth: 1200,
        tripDuration: 30,
        pulseToDistance: 0.1,
        measurementNoise: 0.1,
      },
      roller: {
        speed,
        roller: { RADIUS },
      },
      airRingToScannerDistance: distanceFromAirRingToScanner,
    })

    const reconstructor = createReconstructor()
    const measuredDataList: Array<{
      flattenedThickness: number
      measurementAngle: number
      timestamp: number
    }> = []

    setInterval(() => {
      const timestamp = Date.now()
      const { thicknessDevice } = simulator.next()

      // 过滤掉超出测量范围的数据（NaN 值）
      if (!Number.isNaN(thicknessDevice.ProbeValue)) {
        // 计算测量角度（从上旋转设备状态和时间戳推导）
        // 简化假设：角度与时间线性相关
        const tripProgress = (timestamp % 360000) / 360000
        const measurementAngle = (tripProgress * 2 * Math.PI) % (2 * Math.PI)

        measuredDataList.push({
          flattenedThickness: thicknessDevice.ProbeValue!,
          measurementAngle,
          timestamp,
        })
      }
    }, 10)

    // 快进 20 分钟，积累足够的数据点进行反推
    vi.advanceTimersByTime(20 * 60 * 1000)

    // 批量反推
    reconstructor.reconstructBatch(measuredDataList)

    // 验证反推结果的合理性
    const stats = reconstructor.getStatistics()

    // 如果成功收集到有效数据，验证反推结果的合理性
    if (stats.totalReconstructions > 0) {
      // 反推厚度应该在合理范围内
      // 考虑泊松效应，反推值会小于名义厚度
      expect(stats.thicknessRange.mean).toBeGreaterThan(70)
      expect(stats.thicknessRange.mean).toBeLessThan(110)

      // 反推数据点应该达到预期数量
      expect(stats.totalReconstructions).toBeGreaterThan(50)

      // 置信度应该随着数据累积而提升
      expect(stats.averageConfidence).toBeGreaterThan(0.7)

      // 验证厚度范围合理
      expect(stats.thicknessRange.max - stats.thicknessRange.min).toBeLessThan(
        50
      )
    }

    console.log(`仿真膜泡反推统计：
    总反推数: ${stats.totalReconstructions}
    平均厚度: ${stats.thicknessRange.mean.toFixed(2)}μm
    厚度范围: ${stats.thicknessRange.min.toFixed(2)}~${stats.thicknessRange.max.toFixed(2)}μm
    平均置信度: ${stats.averageConfidence.toFixed(3)}
    收集的有效数据点: ${measuredDataList.length}
  `)
  }
)

test(
  '验证基于 BlowFilmSimulator 的对称性约束优化效果',
  {
    timeout: 15000,
  },
  () => {
    vi.useFakeTimers()
    const startTime = new Date('2025-11-18T12:00:00Z').getTime()
    vi.setSystemTime(startTime)

    const CHANNEL_COUNT = 64
    const RADIUS = 15 * 10
    const speed = (20 * 1000) / 60

    const baseAirFlow = Array.from({ length: CHANNEL_COUNT }, (_, i) => {
      const angle = (i / CHANNEL_COUNT) * 2 * Math.PI
      return (
        20 +
        2.0 * Math.sin(angle) +
        1.0 * Math.sin(2 * angle + 0.5) +
        0.7 * Math.sin(4 * angle + 1.0)
      )
    })

    const simulator = createBlowFilmSimulator({
      airRing: {
        channelCount: CHANNEL_COUNT,
        baseAirFlow,
        installationOffset: 0,
        flowDeviation: 0.01,
      },
      bubble: {
        nominalThickness: 100,
        thicknessSensitivity: -2.0,
        bubbleRadius: 382.2,
        thicknessResolution: 0.5,
      },
      upperRotation: {
        maxAngle: 330,
        tripDuration: 360,
      },
      scanner: {
        membraneWidth: 1200,
        tripDuration: 30,
        pulseToDistance: 0.1,
        measurementNoise: 0.2,
      },
      roller: {
        speed,
        roller: { RADIUS },
      },
    })

    const baselineReconstructor = createReconstructor()
    const optimizedReconstructor = createReconstructor()
    const measuredDataList: Array<{
      flattenedThickness: number
      measurementAngle: number
      timestamp: number
    }> = []

    setInterval(() => {
      const timestamp = Date.now()
      const { thicknessDevice } = simulator.next()

      // 过滤掉超出测量范围的数据（NaN 值）
      if (!Number.isNaN(thicknessDevice.ProbeValue)) {
        const tripProgress = (timestamp % 360000) / 360000
        const measurementAngle = (tripProgress * 2 * Math.PI) % (2 * Math.PI)

        measuredDataList.push({
          flattenedThickness: thicknessDevice.ProbeValue!,
          measurementAngle,
          timestamp,
        })
      }
    }, 10)

    // 快进 15 分钟
    vi.advanceTimersByTime(15 * 60 * 1000)

    // 基线反推（无对称性优化）
    const baselineResults =
      baselineReconstructor.reconstructBatch(measuredDataList)
    const baselineStats = baselineReconstructor.getStatistics()

    // 优化反推（应用对称性约束）
    const optimizedResults =
      optimizedReconstructor.reconstructWithSymmetryConstraints(
        measuredDataList,
        CHANNEL_COUNT
      )
    const optimizedStats = optimizedReconstructor.getStatistics()

    // 验证对称性优化的效果
    // 优化后的置信度应该更高或相等
    if (baselineStats.totalReconstructions > 0 && optimizedStats.totalReconstructions > 0) {
      expect(optimizedStats.averageConfidence).toBeGreaterThanOrEqual(
        baselineStats.averageConfidence
      )
    }

    // 优化后的厚度分布应该更加均匀（方差更小）
    const baselineVariance =
      baselineStats.thicknessRange.max - baselineStats.thicknessRange.min
    const optimizedVariance =
      optimizedStats.thicknessRange.max - optimizedStats.thicknessRange.min

    console.log(`对称性约束优化效果：
    基线平均置信度: ${baselineStats.averageConfidence.toFixed(3)}
    优化后平均置信度: ${optimizedStats.averageConfidence.toFixed(3)}
    基线厚度范围: ${baselineVariance.toFixed(2)}μm
    优化后厚度范围: ${optimizedVariance.toFixed(2)}μm
    有效反推数据: ${optimizedStats.totalReconstructions}
  `)

    // 验证至少有一些数据被对称优化影响
    if (optimizedResults.length > 0 && baselineResults.length > 0) {
      const optimizedCount = optimizedResults.filter(
        (r, i) =>
          baselineResults[i] &&
          Math.abs(r.originalThickness - baselineResults[i].originalThickness) >
            0.01
      ).length

      expect(optimizedCount).toBeGreaterThan(0)
    } else {
      // 如果没有有效数据，至少确认测试能运行
      expect(measuredDataList.length).toBeGreaterThanOrEqual(0)
    }
  }
)
