import { RollerScalar } from '@jjsk/core'

/**
 * 上旋最大旋转角度评估范围
 * */
export type UpperRotationDeltaRange = {
  /**
   * 最小角度 默认：180°
   * */
  min?: number
  /**
   * 最大角度 默认：359°
   * */
  max?: number
  /**
   * 每次评估度数 默认：1°
   * */
  step?: number
}

/**
 * 标定配置
 * */
export type CalibrationConfig = {
  /**
   * 辊参配置参数
   * */
  roller: {
    /**
     * 度评估圈数
     * */
    numCycles?: number
    /**
     * 最大允许脉冲间隔
     * */
    maxIntervalMs?: number
  }
  /**
   * 上旋配置参数
   * */
  upperRotation: {
    /**
     * 上旋最大旋转角度评估范围
     * */
    deltaRange?: UpperRotationDeltaRange
    /**
     * 理论单程时间（秒），用于计算理论窗口大小
     * 例如：420 表示 7 分钟
     * */
    theoreticalTripDuration?: number
  }
  /**
   * 突变检测配置参数
   * */
  mutation?: {
    /**
     * 理论采样频率（Hz），用于计算理论窗口大小
     * 例如：100 表示每秒 100 个采样点
     * */
    theoreticalSamplingRate?: number
    /**
     * 使用测厚仪单程数据标定窗口大小（推荐）
     * 如果为 true，将使用测厚仪的换向信号来检测单程
     * 优势：约30秒即可完成标定，远快于上旋的6-8分钟
     * 默认：false（使用上旋换向信号）
     * */
    useThicknessTripCalibration?: boolean
  }
}
/**
 * 标量
 * */
export type Scalar = {
  /**
   * 风道数量
   * */
  CHANNEL_COUNT: number
  /**
   * 测厚仪单位脉冲位移量 单位：毫米/每脉冲
   * */
  THICKNESS_UNIT_PULSE_DIS: number
  /**
   * 辊的标定量
   * */
  ROLLER: RollerScalar
}

/**
 * 有效测厚仪数据
 * */
export type ValidThicknessData = {
  /**
   * 相对时间 单位：毫秒
   * */
  t: number
  /**
   * 厚度 单位：微米，出界归一到NaN
   * */
  y: number
}
/**
 * 有效测厚仪数据(携带上旋旋转方向信息)
 * */
export type ThicknessWithDirection = ValidThicknessData & {
  /**
   * 方向
   * */
  isForward: boolean
}
export type BaseTripSegment = {
  /**
   * 行程开始时间
   * */
  startTime: number
  /**
   * 行程持续时间
   * */
  duration: number
  /**
   * 方向
   * */
  isForward: boolean
}
/**
 * 上旋旋转单程
 * */
export type TripSegment = BaseTripSegment & {
  /**
   * 行程内的测厚数据
   * */
  measurements: readonly ValidThicknessData[]
}
export type ThetaMaxEstimateResult = {
  thetaMaxDeg: number
  rSquared: number
  residual: number
  validPoints: number
}
