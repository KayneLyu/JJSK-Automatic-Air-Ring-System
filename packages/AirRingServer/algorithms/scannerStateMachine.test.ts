import { describe, expect, test } from 'vitest'
import { scannerStateMachine } from './scannerStateMachine'
import type { OutOfBoundsResult } from './outOfBoundsDetector'

/** 模拟：厚度正常 → 在膜内 */
const membraneIn = (pulse: number): OutOfBoundsResult => ({
  inMembrane: true,
  confirmedOutOfBounds: false,
  confirmedInMembrane: true,
  boundaryPulse: undefined,
  boundarySide: undefined,
})

/** 模拟：连续3点确认出膜，向右出界 */
const outRight = (pulse: number): OutOfBoundsResult => ({
  inMembrane: false,
  confirmedOutOfBounds: true,
  confirmedInMembrane: false,
  boundaryPulse: pulse,
  boundarySide: 'right',
})

/** 模拟：连续3点确认出膜，向左出界 */
const outLeft = (pulse: number): OutOfBoundsResult => ({
  inMembrane: false,
  confirmedOutOfBounds: true,
  confirmedInMembrane: false,
  boundaryPulse: pulse,
  boundarySide: 'left',
})

/** 模拟：膜外但未确认 */
const outUnconfirmed = (): OutOfBoundsResult => ({
  inMembrane: false,
  confirmedOutOfBounds: false,
  confirmedInMembrane: false,
  boundaryPulse: undefined,
  boundarySide: undefined,
})

const now = 1000000

describe('scannerStateMachine', () => {
  test('UNKNOWN → IN_MEMBRANE', () => {
    const sm = scannerStateMachine()
    const output = sm.next(membraneIn(1000), now, 1000, false, false)
    expect(output.state).toBe('IN_MEMBRANE')
    expect(output.action).toBe('NONE')
  })

  test('IN_MEMBRANE → TOLERATING（向右出膜）', () => {
    const sm = scannerStateMachine()
    sm.next(membraneIn(1000), now, 1000, false, false) // UNKNOWN→IN
    const output = sm.next(outRight(5000), now + 100, 5000, false, false)
    expect(output.state).toBe('TOLERATING')
    expect(output.action).toBe('NONE')
    expect(output.boundaryPulses.right).toBe(5000)
    expect(output.boundaryPulses.left).toBeNull()
  })

  test('IN_MEMBRANE → TOLERATING（向左出膜）', () => {
    const sm = scannerStateMachine()
    sm.next(membraneIn(1000), now, 1000, false, false)
    const output = sm.next(outLeft(500), now + 100, 500, false, false)
    expect(output.state).toBe('TOLERATING')
    expect(output.boundaryPulses.left).toBe(500)
    expect(output.boundaryPulses.right).toBeNull()
  })

  test('TOLERATING → IN_MEMBRANE（容错取消，对称回退）', () => {
    const sm = scannerStateMachine({ toleranceMs: 200 })
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(outRight(5000), now + 100, 5000, false, false) // TOLERATING

    // 容错窗口内（100ms），回到膜内
    const back = membraneIn(5001)
    const output = sm.next(back, now + 200, 5001, false, false)
    expect(output.state).toBe('IN_MEMBRANE')
    expect(output.action).toBe('NONE')
    expect(output.log).toContain('back-to-membrane')
  })

  test('TOLERATING → DECELERATING（容错到期）', () => {
    const sm = scannerStateMachine({ toleranceMs: 200 })
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(outRight(5000), now + 100, 5000, false, false) // TOLERATING

    // 持续出膜（未回膜内），容错到期
    const output = sm.next(outRight(5100), now + 350, 5100, false, false)
    expect(output.state).toBe('DECELERATING')
    expect(output.action).toBe('STOP')
    expect(output.log).toContain('tolerance-expired')
  })

  test('DECELERATING → TURNING（已停止）', () => {
    const sm = scannerStateMachine({ toleranceMs: 200, stopConfirmMs: 200 })
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(outRight(5000), now + 100, 5000, false, false)
    // 容错到期
    sm.next(outRight(5100), now + 350, 5100, false, false) // DECELERATING (pulse=5100)

    // 脉冲持续稳定 ≥200ms
    sm.next(outRight(5100), now + 500, 5100, false, false)   // 脉冲未变，开始计时
    const output = sm.next(outRight(5100), now + 720, 5100, false, false) // 稳定 220ms
    expect(output.state).toBe('TURNING')
    expect(output.action).toBe('REV') // 向右出膜 → 向左回（REV）
  })

  test('DECELERATING 超时 → ALERT', () => {
    const sm = scannerStateMachine({ toleranceMs: 200, decelTimeoutMs: 5000 })
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(outRight(5000), now + 100, 5000, false, false)
    sm.next(outRight(5100), now + 350, 5100, false, false) // DECELERATING

    // 5秒后仍未停止
    const output = sm.next(outRight(6000), now + 5400, 6000, false, false)
    expect(output.action).toBe('ALERT')
    expect(output.log).toContain('timeout')
  })

  test('TURNING → IN_MEMBRANE（回到膜内）', () => {
    const sm = scannerStateMachine({ toleranceMs: 200, stopConfirmMs: 100 })
    sm.next(membraneIn(1000), now, 10000, false, false)
    sm.next(outRight(15000), now + 100, 15000, false, false)  // TOLERATING
    sm.next(outRight(15200), now + 350, 15200, false, false) // DECELERATING (pulse=15200)
    // 脉冲稳定 ≥100ms → TURNING
    sm.next(outRight(15200), now + 400, 15200, false, false)  // 首次检测到稳定
    sm.next(outRight(15200), now + 520, 15200, false, false)  // 稳定 120ms → TURNING

    // 检测到回到膜内
    const back = membraneIn(15100)
    const output = sm.next(back, now + 620, 15100, false, false)
    expect(output.state).toBe('IN_MEMBRANE')
    expect(output.log).toContain('confirmed-in-membrane')
  })

  test('TURNING 超时 → ALERT', () => {
    const sm = scannerStateMachine({
      toleranceMs: 200,
      stopConfirmMs: 100,
      turnTimeoutMs: 3000,
    })
    sm.next(membraneIn(1000), now, 10000, false, false)
    sm.next(outRight(15000), now + 100, 15000, false, false)
    sm.next(outRight(15200), now + 350, 15200, false, false) // DECELERATING
    // 脉冲稳定 → TURNING
    sm.next(outRight(15200), now + 400, 15200, false, false)  // 首次检测到稳定
    sm.next(outRight(15200), now + 520, 15200, false, false)  // 稳定 120ms → TURNING

    // 3秒后仍未回到膜内 → 超时
    const output = sm.next(outRight(15200), now + 3600, 15200, false, false)
    expect(output.action).toBe('ALERT')
  })

  test('Limt急停 → EMERGENCY_STOP', () => {
    const sm = scannerStateMachine()
    sm.next(membraneIn(1000), now, 1000, false, false) // IN_MEMBRANE
    const output = sm.next(membraneIn(1100), now + 100, 1100, true, false)
    expect(output.state).toBe('EMERGENCY_STOP')
    expect(output.action).toBe('NONE')
    expect(output.log).toContain('left-limit')
  })

  test('EMERGENCY_STOP 后需手动复位', () => {
    const sm = scannerStateMachine()
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(membraneIn(1100), now + 100, 1100, false, true) // 右限位
    expect(sm.getState()).toBe('EMERGENCY_STOP')

    // 持续在 EMERGENCY_STOP
    const output = sm.next(membraneIn(1200), now + 200, 1200, false, false)
    expect(output.state).toBe('EMERGENCY_STOP')

    // 手动复位
    sm.resetEmergencyStop()
    expect(sm.getState()).toBe('UNKNOWN')
  })

  test('冷启动在膜外 → 保持 UNKNOWN', () => {
    const sm = scannerStateMachine()
    // 虽然 confirmedOutOfBounds 为 true，但 UNKNOWN 状态只看 confirmedInMembrane
    const output = sm.next(outRight(1000), now, 1000, false, false)
    expect(output.state).toBe('UNKNOWN')
  })

  test('边界脉冲不被 TOLERATING 回退覆盖', () => {
    const sm = scannerStateMachine({ toleranceMs: 500 })
    sm.next(membraneIn(1000), now, 1000, false, false)

    // 向右出膜
    sm.next(outRight(5000), now + 100, 5000, false, false)
    expect(sm.getBoundaryPulses().right).toBe(5000)

    // TOLERATING 期间回退到 IN_MEMBRANE
    sm.next(membraneIn(5001), now + 200, 5001, false, false)
    expect(sm.getBoundaryPulses().right).toBe(5000) // 仍保留

    // 再次出膜（同方向），新值覆盖
    sm.next(outRight(5200), now + 400, 5200, false, false)
    expect(sm.getBoundaryPulses().right).toBe(5200)
  })

  test('TOLERATING 容错中出膜仍持续 → 等待到期', () => {
    const sm = scannerStateMachine({ toleranceMs: 200 })
    sm.next(membraneIn(1000), now, 1000, false, false)
    sm.next(outRight(5000), now + 100, 5000, false, false) // TOLERATING

    // 容错中持续出膜（未确认回膜）
    const output = sm.next(outRight(5050), now + 150, 5050, false, false)
    expect(output.state).toBe('TOLERATING') // 仍在容错中
  })
})
