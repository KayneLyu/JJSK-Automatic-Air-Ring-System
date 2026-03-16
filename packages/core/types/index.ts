/**
 * 上旋数据类型
 * */
export type UpperRotationDevice = {
  /**
   * 正向旋转信号
   * 表示是否处于正向旋转状态
   * */
  ForwardRotation?: boolean
  /**
   * 反向旋转信号
   * 表示是否处于反向旋转状态
   * */
  ReverseRotation?: boolean
  /**
   * 正换向信号
   * 表示正向换向触发，即到了正向旋转的尽头(限位)
   * */
  ForwardDirectionChange?: boolean
  /**
   * 反换向信号
   * 表示反向换向触发，即到了反向旋转的尽头(限位)
   * */
  ReverseDirectionChange?: boolean
  /**
   * 复位信号
   * 表示复位触发
   * */
  Reset?: boolean
  /**
   * 电机频率- 旋转速度
   * 表示电机当前频率（单位：Hz）
   * */
  MotorFrequency?: number
}

/**
 * 收卷辊的定量
 * */
export type RollerScalar =
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
 * 收卷辊数据类型
 * */
export type RollerDevice = {
  /**
   * 辊速信号，表示当前辊速信号状态（true 转过一圈，false 未到接触点）
   * */
  RollSpeedSignal?: boolean
}
/**
 * 测厚仪数据类型
 * */
export type ThicknessDevice = {
  /**
   * 横向脉冲计数 数值增加=前进，反之后退
   * 表示当前横向位置的脉冲累计
   * */
  HorizontalPulse?: number
  /**
   * 左限位信号
   * 表示是否触发左端限位开关（true 为已触发）
   * */
  LeftLimit?: boolean
  /**
   * 右限位信号
   * 表示是否触发右端限位开关（true 为已触发）
   * */
  RightLimit?: boolean
  /**
   * 归零信号
   * 表示是否检测到归零点（原点）触发（true 为触发）
   * */
  ResetSignal?: boolean
  /**
   * 换向信号
   * 表示方向切换触发（true 为换向发生）
   * */
  SwapDirection?: boolean
  /**
   * 运动方向
   * 表示当前运动方向（true 为正向/向右，false 为反向/向左）
   * */
  MotionDirection?: boolean
  /**
   * 探头测量值（单位：μm）
   *
   * 算法接口和仿真器均以膜厚 μm 为单位。
   *
   * ⚠️ 例外：历史样本数据文件（`data/01-05`）直接采集自设备，
   * 存储的是原始**光通量**（膜越厚 → 值越低，出界时极大）而非 μm。
   * 对于仅需相对变化的算法（如 θ_max 估算），可直接使用；
   * 若需要实际厚度值，需通过标定参数换算。
   * */
  ProbeValue?: number
}

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
