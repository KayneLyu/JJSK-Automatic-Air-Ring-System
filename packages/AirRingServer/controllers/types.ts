/**
 * 收卷辊的标定量
 * */
export type RollerStandardized =
  | {
      /**
       * 直径
       * */
      DIAMETER: number
    }
  | {
      /**
       * 半径
       * */
      RADIUS: number
    }
  | {
      /**
       * 周长
       * */
      CIRCUMFERENCE: number
    }

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
   * 标定量
   * */
  standardized: {
    /**
     * 风道数量
     * */
    CHANNEL_COUNT: number
    /**
     * 辊的标定量
     * */
    roller: RollerStandardized
  }
  /**
   * 辊参配置参数
   * */
  roller: {
    /**
     * 度评估圈数 默认：3
     * */
    numCycles?: number
    /**
     * 最大允许脉冲间隔 默认10_000 ms = 10秒
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
