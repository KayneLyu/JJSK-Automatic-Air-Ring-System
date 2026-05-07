/**
 * 膜泡厚度反推控制器
 * 自动反推原始膜泡厚度
 * */
import type { ThicknessData } from '../connections/thickness'
import type { RingData } from '../connections/airRing/types'
import {
  createBubbleThicknessReconstructor,
  BubbleModelConfig,
  MeasuredThicknessData,
} from '../algorithms/thicknessReverseCalculation'
import { buildTimeToAngle } from '../algorithms/timeToAngle'

export interface ThicknessReversalOptions {
  /**
   * 膜泡基准半径 (mm)
   * */
  baseRadius: number
  /**
   * 膜泡高度 (mm)
   * */
  bubbleHeight: number
  /**
   * 上旋最大旋转角度 (deg)
   * */
  thetaMaxDeg: number
  /**
   * 上旋单程时间 (ms)
   * */
  T_half: number
  /**
   * 材料泊松比 (默认: 0.3)
   * */
  poissonRatio?: number
  /**
   * 历史数据窗口大小 (默认: 1000)
   * */
  historyWindowSize?: number
  /**
   * 风道总数
   * */
  fanCount?: number
  /**
   * 是否在批量处理时启用对称性约束
   * */
  useSymmetryConstraint?: boolean
}

export interface ThicknessReversalResult {
  /**
   * 原始膜泡厚度 (μm)
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
  /**
   * 测量时间戳
   * */
  timestamp: number
}

export interface ThicknessReversalState {
  /**
   * 最后一次测量的角度
   * */
  lastAngle: number
  /**
   * 当前上旋方向
   * true: 正向  false: 反向
   * */
  isForward: boolean
  /**
   * 当前单程起始时间戳
   * */
  tripStartTime?: number
  /**
   * 反推结果历史
   * */
  history: ThicknessReversalResult[]
  /**
   * 平均原始厚度
   * */
  averageOriginalThickness?: number
  /**
   * 平均厚度标准差
   * */
  thicknessStdDev?: number
}

/**
 * 创建膜泡厚度反推控制器
 * */
export const createThicknessReversalController = (
  options: ThicknessReversalOptions
) => {
  const {
    baseRadius,
    bubbleHeight,
    thetaMaxDeg,
    T_half,
    poissonRatio = 0.3,
    historyWindowSize = 1000,
    fanCount = 8,
  } = options

  const modelConfig: BubbleModelConfig = {
    baseRadius,
    bubbleHeight,
    poissonRatio,
    historyWindowSize,
  }

  const reconstructor = createBubbleThicknessReconstructor(modelConfig)
  const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, fanCount)

  // 维护状态
  const state: ThicknessReversalState = {
    lastAngle: 0,
    isForward: true,
    tripStartTime: undefined,
    history: [],
  }

  const normalizeAngle = (angle: number) => {
    const normalized = angle % (2 * Math.PI)
    return normalized >= 0 ? normalized : normalized + 2 * Math.PI
  }

  const trimHistory = () => {
    if (state.history.length > historyWindowSize) {
      state.history.splice(0, state.history.length - historyWindowSize)
    }
  }

  /**
   * 根据上旋状态更新单程起点与方向
   * */
  const updateAirRingState = (ringData: RingData) => {
    const timestamp = ringData.timestamp
    if (timestamp === undefined) {
      return
    }

    if (ringData.Reset) {
      state.tripStartTime = timestamp
      state.isForward = true
      state.lastAngle = 0
      return
    }

    if (ringData.ReverseDirectionChange) {
      state.tripStartTime = timestamp
      state.isForward = true
      state.lastAngle = 0
      return
    }

    if (ringData.ForwardDirectionChange) {
      state.tripStartTime = timestamp
      state.isForward = false
      state.lastAngle = normalizeAngle((thetaMaxDeg * Math.PI) / 180)
      return
    }

    if (
      ringData.ForwardRotation !== undefined ||
      ringData.ReverseRotation !== undefined
    ) {
      const nextIsForward =
        !!ringData.ForwardRotation && !ringData.ReverseRotation

      if (state.tripStartTime === undefined) {
        state.tripStartTime = timestamp
        state.isForward = nextIsForward
        return
      }

      if (nextIsForward !== state.isForward) {
        state.tripStartTime = timestamp
        state.isForward = nextIsForward
      }
    }
  }

  /**
   * 根据厚度数据时间戳推算当前角度
   * */
  const calculateAngle = (timestamp: number) => {
    if (state.tripStartTime === undefined) {
      return null
    }

    const relativeTime = Math.max(0, timestamp - state.tripStartTime)
    const clampedRelativeTime = Math.min(relativeTime, T_half)
    return normalizeAngle(timeToAngle(clampedRelativeTime, state.isForward))
  }

  /**
   * 构造算法所需测厚数据
   * */
  const buildMeasuredData = (
    thicknessData: ThicknessData,
    ringData?: RingData
  ): MeasuredThicknessData | null => {
    if (ringData) {
      updateAirRingState(ringData)
    }

    if (
      thicknessData.ProbeValue === undefined ||
      thicknessData.ProbeValue <= 0 ||
      thicknessData.timestamp === undefined
    ) {
      return null
    }

    const angle = calculateAngle(thicknessData.timestamp)
    if (angle === null) {
      return null
    }

    state.lastAngle = angle

    return {
      flattenedThickness: thicknessData.ProbeValue,
      measurementAngle: angle,
      timestamp: thicknessData.timestamp,
    }
  }

  /**
   * 处理单个厚度测量
   * */
  const processThicknessMeasurement = (
    thicknessData: ThicknessData,
    ringData?: RingData
  ): ThicknessReversalResult | null => {
    const measuredData = buildMeasuredData(thicknessData, ringData)
    if (!measuredData) {
      return null
    }

    const result = reconstructor.reconstructSingle(measuredData)

    const reversalResult: ThicknessReversalResult = {
      originalThickness: result.originalThickness,
      stretchRatio: result.stretchRatio,
      confidence: result.confidence,
      angle: result.angle,
      timestamp: measuredData.timestamp,
    }

    state.history.push(reversalResult)
    trimHistory()

    updateStatistics()

    return reversalResult
  }

  /**
   * 批量处理厚度数据
   * */
  const processBatch = (
    thicknessDataList: ThicknessData[],
    ringDataList?: RingData[]
  ): ThicknessReversalResult[] => {
    const results: ThicknessReversalResult[] = []

    thicknessDataList.forEach((thicknessData, index) => {
      const result = processThicknessMeasurement(
        thicknessData,
        ringDataList?.[index]
      )

      if (result) {
        results.push(result)
      }
    })

    return results
  }

  /**
   * 使用对称性约束优化结果
   * */
  const reconstructWithSymmetry = (
    thicknessDataList: ThicknessData[],
    ringDataList?: RingData[]
  ): ThicknessReversalResult[] => {
    const measuredDataList = thicknessDataList
      .map((thicknessData, index) =>
        buildMeasuredData(thicknessData, ringDataList?.[index])
      )
      .filter((item): item is MeasuredThicknessData => item !== null)

    if (measuredDataList.length === 0) {
      return []
    }

    const results = reconstructor.reconstructWithSymmetryConstraints(
      measuredDataList,
      fanCount
    )

    const finalResults = results.map<ThicknessReversalResult>(
      (result, index) => ({
        originalThickness: result.originalThickness,
        stretchRatio: result.stretchRatio,
        confidence: result.confidence,
        angle: result.angle,
        timestamp: measuredDataList[index].timestamp,
      })
    )

    state.history.push(...finalResults)
    trimHistory()

    updateStatistics()

    return finalResults
  }

  /**
   * 更新统计信息
   * */
  const updateStatistics = () => {
    if (state.history.length === 0) {
      return
    }

    const thicknesses = state.history.map((r) => r.originalThickness)
    const mean = thicknesses.reduce((a, b) => a + b, 0) / thicknesses.length

    const variance =
      thicknesses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      thicknesses.length

    state.averageOriginalThickness = mean
    state.thicknessStdDev = Math.sqrt(variance)
  }

  /**
   * 获取角度范围内的平均厚度
   * */
  const getAverageThicknessInAngleRange = (
    angleStart: number,
    angleEnd: number
  ): number | null => {
    const filtered = state.history.filter((r) => {
      const angle = r.angle % (2 * Math.PI)
      const start = angleStart % (2 * Math.PI)
      const end = angleEnd % (2 * Math.PI)

      if (start <= end) {
        return angle >= start && angle <= end
      } else {
        return angle >= start || angle <= end
      }
    })

    if (filtered.length === 0) {
      return null
    }

    return (
      filtered.reduce((sum, r) => sum + r.originalThickness, 0) /
      filtered.length
    )
  }

  /**
   * 获取当前状态
   * */
  const getState = (): ThicknessReversalState => {
    return {
      ...state,
      history: [...state.history],
    }
  }

  /**
   * 重置控制器状态
   * */
  const reset = () => {
    state.lastAngle = 0
    state.isForward = true
    state.tripStartTime = undefined
    state.history = []
    state.averageOriginalThickness = undefined
    state.thicknessStdDev = undefined
  }

  /**
   * 流式处理 - 订阅模式
   * 返回一个 next 函数，持续接收数据并返回结果
   * */
  const subscribe = (
    onResult: (result: ThicknessReversalResult) => void,
    onError?: (error: Error) => void
  ) => {
    return (thicknessData?: ThicknessData, ringData?: RingData) => {
      try {
        if (ringData && !thicknessData) {
          updateAirRingState(ringData)
        }

        if (thicknessData) {
          const result = processThicknessMeasurement(thicknessData, ringData)
          if (result) {
            onResult(result)
          }
        }
      } catch (error) {
        if (onError) {
          onError(error as Error)
        }
      }
    }
  }

  return {
    updateAirRingState,
    processThicknessMeasurement,
    processBatch,
    reconstructWithSymmetry,
    getState,
    reset,
    getAverageThicknessInAngleRange,
    updateStatistics,
    subscribe,
  }
}

/**
 * 简化版控制器工厂 - 用于直接集成到 OPCUAController
 * */
export const thicknessReversal = (options: ThicknessReversalOptions) => {
  const { useSymmetryConstraint = false } = options
  const controller = createThicknessReversalController(options)

  const processBatch = (
    thicknessDataList: ThicknessData[],
    ringDataList?: RingData[]
  ) => {
    return useSymmetryConstraint
      ? controller.reconstructWithSymmetry(thicknessDataList, ringDataList)
      : controller.processBatch(thicknessDataList, ringDataList)
  }

  return {
    /**
     * 处理数据流
     * */
    next: (data: {
      thickness?: ThicknessData
      airRing?: RingData
    }): ThicknessReversalResult | null => {
      if (data.airRing && !data.thickness) {
        controller.updateAirRingState(data.airRing)
        return null
      }

      if (data.thickness) {
        return controller.processThicknessMeasurement(
          data.thickness,
          data.airRing
        )
      }
      return null
    },

    /**
     * 批量处理数据
     * */
    processBatch,

    /**
     * 获取统计结果
     * */
    getStatistics: () => {
      const state = controller.getState()
      return {
        averageOriginalThickness: state.averageOriginalThickness,
        thicknessStdDev: state.thicknessStdDev,
        sampleCount: state.history.length,
        lastAngle: state.lastAngle,
        isForward: state.isForward,
        tripStartTime: state.tripStartTime,
        useSymmetryConstraint,
      }
    },

    /**
     * 获取完整状态
     * */
    getState: controller.getState,

    /**
     * 重置状态
     * */
    reset: controller.reset,

    /**
     * 获取历史数据
     * */
    getHistory: (limit?: number) => {
      const state = controller.getState()
      const history = state.history
      return limit ? history.slice(-limit) : history
    },
  }
}
