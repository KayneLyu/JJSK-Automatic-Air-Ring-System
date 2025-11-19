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

  // 辊速信号周期 s
  private rollPeriod = 1.2

  // private tickInterval = 10 // ms 采样周期

  //  ========== 运行时状态 ==========
  private rackState: RackSignals
  // private rotationState: IPollingRotationData
  private timer?: NodeJS.Timeout
  private lastTime = Date.now()

  constructor() {
    this.rackState = {
      horizontalPulse: 0,
      leftLimit: false,
      rightLimit: false,
      resetSignal: false,
      motionDirection: true,
      probeValue: 0,
      rollSpeedSignal: false,
    }
  }

  /** 停止模拟器 */
  public stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  /** 每次tick的逻辑（模拟1帧数据） */
  public updateTick() {
    const now = Date.now()
    const dt = (now - this.lastTime) / 1000 // 秒
    this.lastTime = now
    this.updateRack(dt)
    return {
      HorizontalPulse: this.rackState.horizontalPulse,
      LeftLimit: this.rackState.leftLimit,
      RightLimit: this.rackState.rightLimit,
      ResetSignal:  this.rackState.resetSignal,
      MotionDirection:  this.rackState.motionDirection,
      ProbeValue:  this.rackState.probeValue,
      RollSpeedSignal:  this.rackState.rollSpeedSignal,
    }
  }

  // 模拟探头厚度：随 position 变化呈周期性波动 + 随机噪声
  private simulatedThicknessAt(positionMm: number) {
    // 基线厚度（μm）
    const base = 50 // 50 μm
    // 按位置生成波形
    const normalized =
      ((positionMm % (this.rackLengthMm * 0.6)) / this.rackLengthMm) * 0.6
    const wave = Math.sin(normalized * Math.PI * 4) * 8 // ±8 μm
    const localPeak = Math.exp(-Math.pow((normalized - 0.5) * 6, 2)) * 20 // 中间峰
    const noise = (Math.random() - 0.5) * 2 // ±1 μm 随机噪声
    return Math.max(0, base + wave + localPeak + noise)
  }

  /** 模拟横扫机架系统运动 */
  private updateRack(dt: number) {
    const direction = this.rackState.motionDirection ? 1 : -1
    this.rackState.horizontalPulse += direction * this.probeSpeed * dt

    // 到达限位自动换向
    if (this.rackState.horizontalPulse >= this.rackLength) {
      this.rackState.rightLimit = true
      this.rackState.leftLimit = false
      this.rackState.motionDirection = false
    } else if (this.rackState.horizontalPulse <= 0) {
      this.rackState.leftLimit = true
      this.rackState.rightLimit = false
      this.rackState.motionDirection = true
    } else {
      this.rackState.leftLimit = this.rackState.rightLimit = false
    }

    // 模拟厚度信号波动
    this.rackState.probeValue = this.simulatedThicknessAt(
      this.rackState.horizontalPulse * this.encoderRatio
    )

    // 模拟辊速信号（周期性触发）
    const now = Date.now();
    const phase = (now / 1000) % this.rollPeriod;
    // 重新进入 0~50ms 区间就视为触发
    this.rackState.rollSpeedSignal =  phase < 0.05 || phase > this.rollPeriod - 0.01;
  }
}

export default Simulator
