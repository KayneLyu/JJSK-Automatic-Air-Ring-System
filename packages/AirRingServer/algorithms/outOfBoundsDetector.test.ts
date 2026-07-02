import { describe, expect, test } from 'vitest'
import { outOfBoundsDetector } from './outOfBoundsDetector'

const AIR_AD = 50300

describe('outOfBoundsDetector', () => {
  test('膜内 AD 值 → 不在膜外', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    const result = detector.next(35000, 1000, true) // AD=35000, 膜内典型值
    expect(result.inMembrane).toBe(true)
    expect(result.confirmedOutOfBounds).toBe(false)
  })

  test('膜外 AD 值 → 确认出膜需要连续3点', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    // 第1点：出膜
    let r = detector.next(AIR_AD, 1000, true)
    expect(r.inMembrane).toBe(false)
    expect(r.confirmedOutOfBounds).toBe(false) // 仅1点，未确认

    // 第2点：出膜
    r = detector.next(AIR_AD, 1001, true)
    expect(r.confirmedOutOfBounds).toBe(false) // 仅2点，未确认

    // 第3点：出膜 → 确认
    r = detector.next(AIR_AD, 1002, true)
    expect(r.confirmedOutOfBounds).toBe(true)
    expect(r.boundaryPulse).toBe(1002)
    expect(r.boundarySide).toBe('right')
  })

  test('非连续出膜 → 计数重置', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    detector.next(AIR_AD, 1000, true) // outCount=1
    detector.next(35000, 1001, true)  // 回到膜内 → outCount=0
    detector.next(AIR_AD, 1002, true) // outCount=1
    const r = detector.next(AIR_AD, 1003, true) // outCount=2
    expect(r.confirmedOutOfBounds).toBe(false)
  })

  test('对称回退：连续3点厚度>0 → confirmedInMembrane', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    // 先出膜
    detector.next(AIR_AD, 1000, true)
    detector.next(AIR_AD, 1001, true)
    detector.next(AIR_AD, 1002, true) // confirmedOut

    // 再回膜
    detector.next(35000, 1003, true) // inCount=1
    detector.next(35000, 1004, true) // inCount=2
    const r = detector.next(35000, 1005, true) // inCount=3
    expect(r.confirmedInMembrane).toBe(true)
    expect(r.inMembrane).toBe(true)
  })

  test('左右边界标记正确', () => {
    // 向右运动 (motionDirection=true) → boundarySide='right'
    const detector1 = outOfBoundsDetector({ airAD: AIR_AD })
    detector1.next(AIR_AD, 2000, true)
    detector1.next(AIR_AD, 2001, true)
    const r1 = detector1.next(AIR_AD, 2002, true)
    expect(r1.boundarySide).toBe('right')

    // 向左运动 (motionDirection=false) → boundarySide='left'
    const detector2 = outOfBoundsDetector({ airAD: AIR_AD })
    detector2.next(AIR_AD, 500, false)
    detector2.next(AIR_AD, 501, false)
    const r2 = detector2.next(AIR_AD, 502, false)
    expect(r2.boundarySide).toBe('left')
  })

  test('持续出膜不重复覆盖 boundaryPulse', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    // 确认出膜（第3点）
    detector.next(AIR_AD, 1000, true)
    detector.next(AIR_AD, 1000, true)
    let r = detector.next(AIR_AD, 1000, true)
    expect(r.boundaryPulse).toBe(1000) // 确认点记录

    // 后续持续出膜，不再覆盖
    r = detector.next(AIR_AD, 2000, true)
    expect(r.confirmedOutOfBounds).toBe(true)
    expect(r.boundaryPulse).toBeUndefined() // 不重复覆盖
  })

  test('reset 重置计数', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    detector.next(AIR_AD, 1000, true)
    detector.next(AIR_AD, 1001, true)
    detector.reset()
    const r = detector.next(AIR_AD, 1002, true)
    expect(r.confirmedOutOfBounds).toBe(false) // 重置后从0开始
  })

  test('ProbeValue=0 → 厚度也为0 → 出膜', () => {
    // ProbeValue=0 时 calcThickness 也返回 0（ad <= 0 的路径）
    const detector = outOfBoundsDetector({ airAD: AIR_AD })
    detector.next(0, 1000, true)
    detector.next(0, 1001, true)
    const r = detector.next(0, 1002, true)
    expect(r.confirmedOutOfBounds).toBe(true)
  })

  test('膜内低 AD 值 → 不在膜外', () => {
    const detector = outOfBoundsDetector({ airAD: AIR_AD, confirmCount: 3 })
    // 膜内典型值 30000-40000，calcThickness 返回正值
    const r = detector.next(40000, 1000, true)
    expect(r.inMembrane).toBe(true)
    expect(r.confirmedOutOfBounds).toBe(false)
  })
})
