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
