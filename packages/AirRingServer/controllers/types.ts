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
