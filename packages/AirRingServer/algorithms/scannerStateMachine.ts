/**
 * 测厚仪运动控制状态机
 *
 * 状态流转：
 *   UNKNOWN → IN_MEMBRANE → TOLERATING → DECELERATING → TURNING → IN_MEMBRANE
 *   任意状态 ──(LeftLimit/RightLimit)──► EMERGENCY_STOP
 */
import type { OutOfBoundsResult } from './outOfBoundsDetector'

/** 状态机状态 */
export type ScannerState =
  | 'UNKNOWN'
  | 'IN_MEMBRANE'
  | 'TOLERATING'
  | 'DECELERATING'
  | 'TURNING'
  | 'EMERGENCY_STOP'

/** 控制动作 */
export type ControlAction = 'NONE' | 'STOP' | 'REV' | 'FWD' | 'ALERT' | 'MOVE_TO'

/** 左右出界脉冲记录 */
export interface BoundaryPulseMap {
  left: number | null
  right: number | null
}

/** 状态机输出 */
export interface StateMachineOutput {
  state: ScannerState
  action: ControlAction
  log: string | null
  boundaryPulses: BoundaryPulseMap
  /** 换向目标脉冲位置（TURNING 状态时有效，回到膜入口位置） */
  targetPulse?: number
  /** 出膜边界侧（TURNING 时有效，供 adbox 计算换向目标 0/maxPulse） */
  boundarySide?: 'left' | 'right' | null
  /** 状态机内部计时器状态（调试用） */
  machineDebug?: {
    toleranceStartTime: number | null
    decelStartTime: number | null
    decelStableSince: number | null
    turnStartTime: number | null
  }
}

export interface ScannerStateMachineOptions {
  /** 容错窗口（ms），默认 200 */
  toleranceMs?: number
  /** 停止确认窗口（ms），默认 200 */
  stopConfirmMs?: number
  /** 减速超时（ms），默认 5000 */
  decelTimeoutMs?: number
  /** 换向超时（ms），默认 3000 */
  turnTimeoutMs?: number
  /** 停稳速度阈值（脉冲/采样），变化低于此值视为已停稳（默认 2） */
  stopSpeedThreshold?: number
  /** 换向回退偏移（脉冲），确保回到膜内而非精确边界（默认 100） */
  turnBackOffset?: number
}

export const scannerStateMachine = (options: ScannerStateMachineOptions = {}) => {
  const {
    toleranceMs = 200,
    stopConfirmMs = 200,
    decelTimeoutMs = 5000,
    turnTimeoutMs = 3000,
    stopSpeedThreshold = 2,
    turnBackOffset = 100,
  } = options

  let state: ScannerState = 'UNKNOWN'
  let toleranceStartTime: number | null = null
  let decelStartTime: number | null = null
  let turnStartTime: number | null = null
  let turnStartPulse: number | null = null
  let expectedTurnDirection: boolean | null = null // true=向右, false=向左
  let lastBoundarySide: 'left' | 'right' | null = null // 出膜瞬间的真实方向（停止后方向会丢失）
  let membraneEntryPulse: number | null = null // 本次扫描趟进入膜时的脉冲位置（换向目标）
  const boundaryPulses: BoundaryPulseMap = { left: null, right: null }

  // 减速→停止检测：追踪脉冲稳定时间
  let decelLastStablePulse: number | null = null
  let decelStableSince: number | null = null

  let lastPulse: number | null = null
  let lastPulseTime: number | null = null

  const logPrefix = '[ScannerMotion]'

  const makeLog = (
    from: ScannerState,
    to: ScannerState,
    reason: string,
    detail: string = ''
  ): string => {
    const now = new Date()
    // 本地时间格式化（UTC+8）
    const pad = (n: number) => String(n).padStart(2, '0')
    const localTime =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}`
    return `${logPrefix} ${localTime} ${from} → ${to} reason="${reason}"${detail}`
  }

  const machineDebug = () => ({
    toleranceStartTime,
    decelStartTime,
    decelStableSince,
    turnStartTime,
  })

  const next = (
    detection: OutOfBoundsResult,
    now: number,
    /** 当前脉冲值 */
    pulse: number,
    /** 是否触发左限位 */
    leftLimit: boolean,
    /** 是否触发右限位 */
    rightLimit: boolean
  ): StateMachineOutput => {
    // 记录上一次脉冲用于速度判断
    lastPulse = pulse
    lastPulseTime = now

    let action: ControlAction = 'NONE'
    let log: string | null = null
    let targetPulse: number | undefined

    // ── 全局限位急停（最高优先级） ──
    if (leftLimit || rightLimit) {
      const prev = state
      state = 'EMERGENCY_STOP'
      log = makeLog(prev, state, leftLimit ? 'left-limit' : 'right-limit',
        ` pulse=${pulse}`)
      return { state, action: 'NONE', log, boundaryPulses: { ...boundaryPulses }, targetPulse, boundarySide: lastBoundarySide, machineDebug: machineDebug() }
    }

    const prevState = state

    switch (state) {
      case 'UNKNOWN':
        if (detection.confirmedInMembrane) {
          state = 'IN_MEMBRANE'
          membraneEntryPulse = pulse
          log = makeLog(prevState, state, 'confirmed-in-membrane',
            ` pulse=${pulse}`)
        }
        break

      case 'IN_MEMBRANE':
        if (detection.confirmedOutOfBounds) {
          state = 'TOLERATING'
          toleranceStartTime = now
          // 记录出界脉冲和边界方向（此时扫描仪仍在运动，方向准确）
          if (detection.boundaryPulse !== undefined && detection.boundarySide) {
            boundaryPulses[detection.boundarySide] = detection.boundaryPulse
            lastBoundarySide = detection.boundarySide
          }
          log = makeLog(prevState, state, 'out-of-bounds',
            ` pulse=${pulse} side=${detection.boundarySide} toleranceMs=${toleranceMs}`)
        }
        break

      case 'TOLERATING':
        if (toleranceStartTime !== null && now - toleranceStartTime >= toleranceMs) {
          // 容错到期
          const elapsed = now - toleranceStartTime
          state = 'DECELERATING'
          decelStartTime = now
          decelLastStablePulse = pulse
          decelStableSince = null
          toleranceStartTime = null
          action = 'STOP'
          log = makeLog(prevState, state, 'tolerance-expired',
            ` pulse=${pulse} elapsedMs=${elapsed}`)
        }
        break

      case 'DECELERATING':
        if (decelStartTime !== null && now - decelStartTime >= decelTimeoutMs) {
          // 减速超时（状态不变，发出告警）
          log = makeLog(prevState, state, 'timeout',
            ` reason=decel-timeout pulse=${pulse} elapsedMs=${now - decelStartTime}`)
          return { state, action: 'ALERT', log, boundaryPulses: { ...boundaryPulses }, targetPulse, boundarySide: lastBoundarySide, machineDebug: machineDebug() }
        }

        // 检查是否已停止：脉冲变化速度 < stopSpeedThreshold，且持续 ≥ stopConfirmMs
        if (decelStartTime !== null) {
          const speed = decelLastStablePulse !== null ? Math.abs(pulse - decelLastStablePulse) : Infinity
          if (speed <= stopSpeedThreshold) {
            // 速度低于阈值 → 开始或继续累积稳定时间
            if (decelStableSince === null) {
              decelStableSince = now
            }
            if (now - decelStableSince >= stopConfirmMs) {
              state = 'TURNING'
              turnStartTime = now
              turnStartPulse = pulse
              // 换向目标 = 入膜位置 + 回扫余量（确保回到膜内，而非卡在边界）
              targetPulse = membraneEntryPulse !== null
                ? lastBoundarySide === 'left'
                  ? membraneEntryPulse + turnBackOffset  // 左边出→往右，多走一点进入膜内
                  : lastBoundarySide === 'right'
                    ? membraneEntryPulse - turnBackOffset  // 右边出→往左，多走一点进入膜内
                    : membraneEntryPulse                   // 方向未知，退回精确位置
                : undefined
              lastBoundarySide = null // 消费后重置
              action = 'MOVE_TO'
              log = makeLog(prevState, state, 'stopped',
                ` pulse=${pulse} stopDurationMs=${now - decelStartTime} targetPulse=${targetPulse}`)
              decelStartTime = null
              decelLastStablePulse = null
              decelStableSince = null
            }
          } else {
            // 速度超过阈值 → 更新参考点，重置稳定计时
            decelLastStablePulse = pulse
            decelStableSince = null
          }
        }
        break

      case 'TURNING':
        if (turnStartTime !== null && now - turnStartTime >= turnTimeoutMs) {
          // 换向超时 → 判定为已到达目标位置，强制回膜继续扫描
          state = 'IN_MEMBRANE'
          turnStartTime = null
          turnStartPulse = null
          expectedTurnDirection = null
          lastBoundarySide = null
          membraneEntryPulse = pulse
          log = makeLog(prevState, state, 'turn-timeout-force-in',
            ` pulse=${pulse} elapsedMs=${now - turnStartTime}`)
        } else if (detection.confirmedInMembrane) {
          // 回到膜内 — 但必须离出膜点足够远（防止边缘假回膜）
          const distFromEdge = Math.abs(pulse - (turnStartPulse ?? pulse))
          if (distFromEdge >= turnBackOffset) {
            state = 'IN_MEMBRANE'
            turnStartTime = null
            turnStartPulse = null
            expectedTurnDirection = null
            lastBoundarySide = null
            membraneEntryPulse = pulse
            log = makeLog(prevState, state, 'confirmed-in-membrane',
              ` pulse=${pulse} distFromEdge=${distFromEdge}`)
          }
        break

      case 'EMERGENCY_STOP':
        // 需要手动复位，不做自动转换
        break
    }

    return { state, action, log, boundaryPulses: { ...boundaryPulses }, targetPulse, boundarySide: lastBoundarySide, machineDebug: machineDebug() }
  }

  /** 手动复位紧急停止 */
  const resetEmergencyStop = () => {
    if (state === 'EMERGENCY_STOP') {
      state = 'UNKNOWN'
    }
  }

  /** 完全重置状态机 */
  const reset = () => {
    state = 'UNKNOWN'
    toleranceStartTime = null
    decelStartTime = null
    decelLastStablePulse = null
    decelStableSince = null
    turnStartTime = null
    turnStartPulse = null
    expectedTurnDirection = null
    lastBoundarySide = null
    membraneEntryPulse = null
    boundaryPulses.left = null
    boundaryPulses.right = null
    lastPulse = null
    lastPulseTime = null
  }

  return {
    next,
    reset,
    resetEmergencyStop,
    getState: () => state,
    getBoundaryPulses: () => ({ ...boundaryPulses }),
  }
}
