/**
 * 膜泡厚度反推算法
 * 根据测厚仪测得的压平厚度，反推膜泡的原始三维厚度
 * */

export interface BubbleGeometry {
  /**
   * 膜泡半径 (mm)
   * */
  radius: number
  /**
   * 膜泡高度 (mm)
   * */
  height: number
  /**
   * 牵引速度 (mm/s)
   * */
  drawSpeed: number
}

export interface MeasuredThicknessData {
  /**
   * 测厚仪测得的压平厚度 (μm)
   * */
  flattenedThickness: number
  /**
   * 测量角度 (弧度)
   * */
  measurementAngle: number
  /**
   * 时间戳
   * */
  timestamp: number
}

export interface ReverseCalculationResult {
  /**
   * 反推的膜泡原始厚度 (μm)
   * */
  originalThickness: number
  /**
   * 厚度拉伸比
   * */
  stretchRatio: number
  /**
   * 计算置信度 (0-1)
   * */
  confidence: number
  /**
   * 对应的角度位置
   * */
  angle: number
}

/**
 * 膜泡几何模型参数
 * */
export interface BubbleModelConfig {
  /**
   * 膜泡基准半径 (mm)
   * */
  baseRadius: number
  /**
   * 膜泡高度 (mm)
   * */
  bubbleHeight: number
  /**
   * 材料泊松比
   * */
  poissonRatio: number
  /**
   * 历史数据窗口大小
   * */
  historyWindowSize: number
}

/**
 * 创建膜泡厚度反推计算器
 * */
export const createBubbleThicknessReconstructor = (
  config: BubbleModelConfig
) => {
  const { baseRadius, bubbleHeight, poissonRatio, historyWindowSize } = config

  // 维护历史测量数据
  const measurementHistory: MeasuredThicknessData[] = []

  // 维护反推结果历史
  const reconstructionHistory: ReverseCalculationResult[] = []

  /**
   * 基于膜泡几何模型反推原始厚度
   * @param measuredData 测厚仪测量数据
   * @param geometry 当前膜泡几何参数
   * @returns 反推结果
   * */
  const reconstructSingle = (
    measuredData: MeasuredThicknessData,
    geometry: BubbleGeometry = {
      radius: baseRadius,
      height: bubbleHeight,
      drawSpeed: 1,
    }
  ): ReverseCalculationResult => {
    const { flattenedThickness, measurementAngle, timestamp } = measuredData
    const { radius, height } = geometry

    // 膜泡几何变形模型
    // 假设膜泡为旋转椭球体，压平时厚度会发生变化
    const bubbleVolumePreservation = true // 体积守恒假设

    // 计算膜泡表面任意点的曲率半径
    const calculateCurvatureRadius = (angle: number): number => {
      // 简化的膜泡曲率模型
      // 在角度θ处的曲率半径 R(θ) = R₀ / cos(θ/2)
      return radius / Math.cos(angle / 2)
    }

    // 计算拉伸比
    const curvatureRadius = calculateCurvatureRadius(measurementAngle)
    const stretchRatio = curvatureRadius / radius

    // 基于体积守恒的厚度反推
    // V_original = V_flattened
    // π × R² × h_original = π × R² × h_flattened / stretchRatio
    // 因此: h_original = h_flattened / stretchRatio
    let originalThickness: number

    if (bubbleVolumePreservation) {
      // 考虑泊松效应的修正
      const poissonCorrection = 1 + poissonRatio * (stretchRatio - 1)
      originalThickness =
        flattenedThickness / (stretchRatio * poissonCorrection)
    } else {
      // 简单的几何拉伸模型
      originalThickness = flattenedThickness / stretchRatio
    }

    // 计算置信度
    let confidence = 0.8 // 基础置信度

    // 基于历史数据一致性调整置信度
    if (reconstructionHistory.length > 10) {
      const recentResults = reconstructionHistory.slice(-20)
      const angleSpecificHistory = recentResults.filter(
        (r) => Math.abs(r.angle - measurementAngle) < 0.1
      )

      if (angleSpecificHistory.length > 5) {
        const avgThickness =
          angleSpecificHistory.reduce(
            (sum, r) => sum + r.originalThickness,
            0
          ) / angleSpecificHistory.length

        const variance =
          angleSpecificHistory.reduce(
            (sum, r) => sum + Math.pow(r.originalThickness - avgThickness, 2),
            0
          ) / angleSpecificHistory.length

        // 方差越小，置信度越高
        const stabilityFactor = Math.max(
          0.2,
          1 - variance / (originalThickness * 0.2)
        )
        confidence = Math.min(0.95, confidence * stabilityFactor)
      }
    }

    const result: ReverseCalculationResult = {
      originalThickness: Math.max(0, originalThickness),
      stretchRatio,
      confidence,
      angle: measurementAngle,
    }

    // 更新历史记录
    reconstructionHistory.push(result)
    if (reconstructionHistory.length > historyWindowSize) {
      reconstructionHistory.shift()
    }

    return result
  }

  /**
   * 批量反推膜泡厚度
   * @param measuredDataList 测量数据列表
   * @param geometry 膜泡几何参数
   * @returns 反推结果数组
   * */
  const reconstructBatch = (
    measuredDataList: MeasuredThicknessData[],
    geometry?: BubbleGeometry
  ): ReverseCalculationResult[] => {
    return measuredDataList.map((data) => {
      // 更新测量历史
      measurementHistory.push(data)
      if (measurementHistory.length > historyWindowSize) {
        measurementHistory.shift()
      }

      return reconstructSingle(data, geometry)
    })
  }

  /**
   * 基于对称性约束优化反推结果
   * 利用膜泡 θ 和 θ+π 位置厚度应该相近的物理约束
   * @param measuredDataList 测量数据
   * @param fanCount 风道总数
   * @returns 优化后的结果
   * */
  const reconstructWithSymmetryConstraints = (
    measuredDataList: MeasuredThicknessData[],
    fanCount: number,
    geometry?: BubbleGeometry
  ): ReverseCalculationResult[] => {
    const initialResults = reconstructBatch(measuredDataList, geometry)

    // 利用对称性进行优化
    const optimizedResults = initialResults.map((result) => {
      const { angle, originalThickness, confidence } = result

      // 计算对称角度 (θ + π)
      const symmetricAngle = (angle + Math.PI) % (2 * Math.PI)

      // 查找对称位置的结果
      const symmetricResult = initialResults.find(
        (r) => Math.abs(r.angle - symmetricAngle) < (2 * Math.PI) / fanCount / 2
      )

      if (symmetricResult && symmetricResult.confidence > 0.6) {
        // 基于对称性约束优化
        const symmetricConstraint =
          (originalThickness + symmetricResult.originalThickness) / 2
        const optimizationWeight = 0.3 // 优化权重

        const optimizedThickness =
          originalThickness * (1 - optimizationWeight) +
          symmetricConstraint * optimizationWeight

        // 提高置信度
        const optimizedConfidence = Math.min(0.95, confidence + 0.1)

        return {
          ...result,
          originalThickness: optimizedThickness,
          confidence: optimizedConfidence,
        }
      }

      return result
    })

    return optimizedResults
  }

  /**
   * 动态校准膜泡几何参数
   * 根据历史数据自动调整模型参数
   * */
  const calibrateGeometry = (): Partial<BubbleModelConfig> | null => {
    if (measurementHistory.length < 30 || reconstructionHistory.length < 30) {
      return null
    }

    // 基于历史数据分析膜泡形状特征
    const recentMeasurements = measurementHistory.slice(-50)
    const recentResults = reconstructionHistory.slice(-50)

    // 分析厚度分布的均匀性
    const thicknesses = recentResults.map((r) => r.originalThickness)
    const meanThickness =
      thicknesses.reduce((a, b) => a + b, 0) / thicknesses.length
    const thicknessVariance =
      thicknesses.reduce((sum, t) => sum + Math.pow(t - meanThickness, 2), 0) /
      thicknesses.length

    // 如果厚度变化很大，可能需要调整几何参数
    const variationCoefficient = Math.sqrt(thicknessVariance) / meanThickness

    let suggestedRadius = baseRadius
    let suggestedHeight = bubbleHeight

    if (variationCoefficient > 0.3) {
      // 厚度变化较大，调整几何参数
      const angleThicknessMap = new Map<number, number[]>()

      // 按角度分组统计
      recentResults.forEach((result) => {
        const angleGroup = Math.floor(result.angle / (Math.PI / 6)) // 每30度一组
        if (!angleThicknessMap.has(angleGroup)) {
          angleThicknessMap.set(angleGroup, [])
        }
        angleThicknessMap.get(angleGroup)!.push(result.originalThickness)
      })

      // 分析不同角度区域的厚度特征
      // 这里可以根据具体需求进一步细化参数调整逻辑
    }

    return {
      baseRadius: suggestedRadius,
      bubbleHeight: suggestedHeight,
    }
  }

  /**
   * 获取统计信息
   * */
  const getStatistics = () => ({
    totalReconstructions: reconstructionHistory.length,
    measurementHistorySize: measurementHistory.length,
    averageConfidence:
      reconstructionHistory.length > 0
        ? reconstructionHistory.reduce((sum, r) => sum + r.confidence, 0) /
          reconstructionHistory.length
        : 0,
    thicknessRange:
      reconstructionHistory.length > 0
        ? {
            min: Math.min(
              ...reconstructionHistory.map((r) => r.originalThickness)
            ),
            max: Math.max(
              ...reconstructionHistory.map((r) => r.originalThickness)
            ),
            mean:
              reconstructionHistory.reduce(
                (sum, r) => sum + r.originalThickness,
                0
              ) / reconstructionHistory.length,
          }
        : { min: 0, max: 0, mean: 0 },
  })

  return {
    reconstructSingle,
    reconstructBatch,
    reconstructWithSymmetryConstraints,
    calibrateGeometry,
    getStatistics,
  }
}

/**
 * 简化的膜泡厚度反推函数
 * */
export const simpleBubbleReconstruction = (
  flattenedThickness: number,
  measurementAngle: number,
  bubbleRadius: number = 100,
  bubbleHeight: number = 50,
  poissonRatio: number = 0.35
): number => {
  // 简化的几何模型
  const stretchRatio = 1 / Math.cos(measurementAngle / 2)
  const poissonCorrection = 1 + poissonRatio * (stretchRatio - 1)
  return flattenedThickness / (stretchRatio * poissonCorrection)
}
