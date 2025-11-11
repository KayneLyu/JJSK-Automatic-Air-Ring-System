
/**
 * 模拟器
 */
class Simulator {
  // ========== 配置参数 ==========（实际可设定）
  // 编码器比例
  private encoderRatio = 0.14
  // 编码脉冲
  private encoderPulse = 1
  // 电机脉冲
  private motorPulse = 4
  // 机架长度 脉冲
  private rackLength = 13900
  // 机架总长度 实际 mm
  private rackLengthMm = this.rackLength * this.encoderRatio
  // 探头移动速度  脉冲/s
  private probeSpeed = 3000
  // 探头移动速度  m/min
  private probeSpeedMm =
    (this.probeSpeed / this.motorPulse) *
    this.encoderRatio *
    60 *
    this.encoderPulse
  // 辊周长
  private rollCircumference = 0.05

  private tickInterval = 10 // ms 采样周期

  //  ========== 运行时状态 ==========
  private rackState: IPollingRackData
  private rotationState: IPollingRotationData
  private timer?: NodeJS.Timeout
  private lastTime = Date.now()

  constructor() {
    this.rackState = {
      horizontalPulse: 0,
      leftLimit: false,
      rightLimit: false,
      resetSignal: false,
      swapDirection: false,
      motionDirection: true,
      probeValue: 0,
      rollSpeedSignal: false,
      rollSpeedTime: 0,
      filmSpeed: 0,
    }

    this.rotationState = {
      forwardRotation: true,
      reverseRotation: false,
      forwardDirectionChange: false,
      reverseDirectionChange: false,
      reset: false,
      motorFrequency: 50,
      rotationPulse: 6000,
      rotationAngle: 0,
      rotationMaxPulse: 6000,
      maxAngle: 330,
    }
  }


  /** 停止模拟器 */
  public stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** 每次tick的逻辑（模拟1帧数据） */
  private updateTick() {
    const now = Date.now()
    const dt = (now - this.lastTime) / 1000 // 秒
    this.lastTime = now
    this.updateRack(dt)
    this.updateRotation(dt)

    return {

    }
  }

  /** 模拟机架系统运动 */
  private updateRack(dt: number) {
    const direction = this.rackState.motionDirection ? 1 : -1
    this.rackState.horizontalPulse += direction * this.probeSpeed * dt

    // 到达限位自动换向
    if (this.rackState.horizontalPulse >= this.rackLength) {
      this.rackState.rightLimit = true
      this.rackState.leftLimit = false
      this.rackState.swapDirection = true
      this.rackState.motionDirection = false
    } else if (this.rackState.horizontalPulse <= 0) {
      this.rackState.leftLimit = true
      this.rackState.rightLimit = false
      this.rackState.swapDirection = true
      this.rackState.motionDirection = true
    } else {
      this.rackState.leftLimit = this.rackState.rightLimit = false
      this.rackState.swapDirection = false
    }

    // 模拟厚度信号波动
    this.rackState.probeValue =
      50 +
      5 *
        Math.sin(
          (this.rackState.horizontalPulse / this.rackLength) * Math.PI * 2
        )

    // 模拟辊速信号（周期性触发）
    const rollPeriod = 1.2 // s 每圈时间
    const rollSignal = Math.floor(Date.now() / (rollPeriod * 1000)) % 2 === 0
    this.rackState.rollSpeedSignal = rollSignal
    this.rackState.rollSpeedTime = rollPeriod
    this.rackState.filmSpeed = this.rollCircumference / rollPeriod // m/s

  }

  /** 模拟上旋系统 */
  private updateRotation(dt: number) {
    const state = this.rotationState
    const anglePerSecond = (state.motorFrequency / 50) * 30 // Hz -> 角速度(°/s)
    const deltaAngle = anglePerSecond * dt

    if (state.forwardRotation) {
      state.rotationAngle += deltaAngle
      state.rotationPulse += deltaAngle * 10 // 脉冲计数模拟
      if (state.rotationAngle >= state.maxAngle) {
        state.forwardRotation = false
        state.reverseRotation = true
        state.forwardDirectionChange = true
      } else {
        state.forwardDirectionChange = false
      }
    } else {
      state.rotationAngle -= deltaAngle
      state.rotationPulse -= deltaAngle * 10
      if (state.rotationAngle <= 0) {
        state.forwardRotation = true
        state.reverseRotation = false
        state.reverseDirectionChange = true
      } else {
        state.reverseDirectionChange = false
      }
    }

    // 限制角度范围
    state.rotationAngle = Math.max(
      0,
      Math.min(state.rotationAngle, state.maxAngle)
    )
  }
}

export default Simulator
