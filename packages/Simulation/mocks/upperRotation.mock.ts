import { UpperRotationDevice } from '../types'

export type MockOptions = {
  /**
   * 电机最大频率 默认：30Hz
   * */
  maxMotorFrequency?: number
  /**
   * 最大旋转角度
   * */
  maxAngle: number
  /**
   * 行程时长(单程) 默认：6分钟 单位：秒
   * */
  tripDuration?: number
  /**
   * 加减速时长 默认：20秒 单位：秒
   * */
  decelerationDuration?: number
}
/**
 * 模拟上旋系统
 * */
export const mockUpperRotation = ({
  maxMotorFrequency = 30,
  maxAngle,
  tripDuration = 6 * 60,
  decelerationDuration = 20,
}: MockOptions) => {
  const data: UpperRotationDevice & {
    timestamp?: number
    angle?: number
  } = {}
  const next = (): UpperRotationDevice => {
    const now = Date.now()
    if (!data.timestamp) {
      data.timestamp = now
      data.angle = 0
      data.ForwardRotation = true
      data.MotorFrequency = 0
      return data
    }
    const dt = (now - data.timestamp) / 1000 // 时差，单位：秒
    const deltaAngle = (dt / tripDuration) * maxAngle // 旋转了多少角度
    const decelerationAngle = (decelerationDuration / tripDuration) * maxAngle //加减速所需角度
    if (data.ForwardRotation) {
      if (data.ForwardDirectionChange) {
        data.ForwardDirectionChange = false
      }
      const angle = (data.angle || 0) + deltaAngle

      if (angle < decelerationAngle) {
        /* 还在加速阶段 */
        data.timestamp = now
        data.angle = angle
        data.ForwardRotation = true
        data.MotorFrequency = (angle / decelerationAngle) * maxMotorFrequency
        return data
      }
      if (angle > maxAngle - decelerationAngle) {
        /* 处于减速阶段 */
        data.timestamp = now
        data.angle = angle
        data.ForwardRotation = true
        data.MotorFrequency =
          ((maxAngle - decelerationAngle - angle) / decelerationAngle) *
          maxMotorFrequency
        return data
      }
      if (angle >= maxAngle) {
        /* 达到最大角度 */
        data.timestamp = now
        data.angle = maxAngle
        data.ForwardRotation = false
        data.ReverseRotation = true
        data.ForwardDirectionChange = true
        data.MotorFrequency = 0
        return data
      } else {
        data.timestamp = now
        data.angle = angle
        data.ForwardRotation = true
        data.MotorFrequency = maxMotorFrequency
        return data
      }
    }
    if (data.ReverseDirectionChange) {
      data.ReverseDirectionChange = false
    }
    const angle = (data.angle || 0) - deltaAngle
    if (angle > maxAngle - decelerationAngle) {
      /* 处于加速阶段 */
      data.timestamp = now
      data.angle = angle
      data.ReverseRotation = true
      data.MotorFrequency =
        ((maxAngle - decelerationAngle - angle) / decelerationAngle) *
        maxMotorFrequency
      return data
    }
    if (angle < decelerationAngle) {
      /* 还在减速阶段 */
      data.timestamp = now
      data.angle = angle
      data.ForwardRotation = true
      data.MotorFrequency = (angle / decelerationAngle) * maxMotorFrequency
      return data
    }

    if (angle <= 0) {
      /* 达到最大角度 */
      data.timestamp = now
      data.angle = 0
      data.ForwardRotation = true
      data.ReverseRotation = false
      data.ReverseDirectionChange = true
      data.MotorFrequency = 0
      return data
    } else {
      data.timestamp = now
      data.angle = angle
      data.ForwardRotation = true
      data.MotorFrequency = maxMotorFrequency
      return data
    }
  }
  return {
    next,
  }
}
