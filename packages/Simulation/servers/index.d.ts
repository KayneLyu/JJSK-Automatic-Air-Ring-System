/**
 * 上旋系统原始信号
 * 描述上旋的运动和传感器状态
 */
interface UpperRotationSignal {
  /**
   * 正向旋转信号
   * 类型：布尔值，表示是否处于正向旋转状态
   */
  forwardRotation: boolean

  /**
   * 反向旋转信号
   * 类型：布尔值，表示是否处于反向旋转状态
   */
  reverseRotation: boolean

  /**
   * 正换向信号
   * 类型：布尔值，表示正向换向触发
   */
  forwardDirectionChange: boolean

  /**
   * 反换向信号
   * 类型：布尔值，表示反向换向触发
   */
  reverseDirectionChange: boolean

  /**
   * 复位信号
   * 类型：布尔值，表示复位触发
   */
  reset: boolean

  /**
   * 电机频率- 旋转速度
   * 类型：数值，表示电机当前频率（单位：Hz）
   */
  motorFrequency: number
}

/**
 * 机架系统原始信号接口
 * 描述横向扫描机架的运动和传感器状态
 */
interface RackSignals {
  /**
   * 横向脉冲计数 数值增加=前进，反之后退
   * 类型：数值，表示当前横向位置的脉冲累计（单位：脉冲数）
   */
  horizontalPulse: number

  /**
   * 左限位信号
   * 类型：布尔值，表示是否触发左端限位开关（true 为已触发）
   */
  leftLimit: boolean

  /**
   * 右限位信号
   * 类型：布尔值，表示是否触发右端限位开关（true 为已触发）
   */
  rightLimit: boolean

  /**
   * 归零信号
   * 类型：布尔值，表示是否检测到归零点（原点）触发（true 为触发）
   */
  resetSignal: boolean

  /**
   * 换向信号
   * 类型：布尔值，表示方向切换触发（true 为换向发生）
   */
  swapDirection: boolean

  /**
   * 运动方向
   * 类型：布尔值，表示当前运动方向（true 为正向/向右，false 为反向/向左）
   */
  motionDirection: boolean

  /**
   * 探头测量值
   * 类型：数值，表示当前探头检测的厚度值（单位：μm）
   */
  probeValue: number

  /**
   * 辊速信号
   * 类型：boolean，表示当前辊速信号状态（true 转过一圈，false 未到接触点）
   */
  rollSpeedSignal: boolean
}

/**
 * 上旋系统数据模拟
 */
interface IPollingRotationData extends UpperRotationSignal {
  /**
   * 模拟脉冲总行程 （实际不存在，通过监听旋转信号模拟）
   * 类型：数值，表示上旋总行程
   */
  rotationMaxPulse: number

  /**
   * 模拟当前脉冲 （实际不存在，通过监听旋转信号模拟）
   * 类型：数值，表示上旋位置
   */
  rotationPulse: number
  /**
   * 最大旋转角度
   * 类型：数值，需要通过计算得出最大旋转角度
   */
  maxAngle: number

  /**
   * 当前角度
   * 类型：数值，表示当前旋转的角度 deg
   */
  rotationAngle: number
}

/**
 * 机架系统数据模拟
 */

interface IPollingRackData extends RackSignals {
  /**
   * 模拟辊速信号时间间隔 （实际不存在，通过监听辊速信号）
   * 类型：数值，表示辊转一圈花费时间
   */
  rollSpeedTime: number
  /**
   * 膜速度  （生产速度）
   * 类型：数值，描述薄膜的生产速度 mm/s
   */
  filmSpeed: number
}
