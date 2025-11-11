import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'

interface FullRingData extends RingData {
  angle?: number
}
export const tracker = (
  data: {
    thickness: ThickNessData[]
    airRing: FullRingData[]
  },
  options: {
    /**
     * 上旋电机速率 即每Hz旋转多少圈rpm
     * */
    UP_FREQ_TO_RPS: number
  }
) => {
  const { airRing } = data
  const { UP_FREQ_TO_RPS } = options
  /*最大旋转角度*/
  let maxAngle = 0
  for (let i = 1; i < airRing.length; i++) {
    const pre = airRing[i - 1]
    const cur = airRing[i]
    if (!(pre.timestamp && cur.timestamp)) continue
    const dt = (cur.timestamp - pre.timestamp) / 1000

    const freq = cur.MotorFrequency ?? 0
    const direction = cur.ForwardRotation ? 1 : cur.ReverseRotation ? -1 : 0

    // 积分计算角度
    cur.angle = 2 * Math.PI * freq * UP_FREQ_TO_RPS * direction * dt

    // 换向点更新
    if (cur.ForwardDirectionChange || cur.ReverseDirectionChange) {
      if (cur.angle > maxAngle) {
        maxAngle = cur.angle
      }
    }
  }
  return {
    maxAngle,
  }
}
