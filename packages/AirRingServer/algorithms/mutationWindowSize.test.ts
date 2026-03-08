import { expect, test } from 'vitest'
import { calibrateMutationWindowSize } from './mutationWindowSize'

test('测试突变窗口大小标定 - 基本功能', () => {
  const CHANNEL_COUNT = 64
  const { next } = calibrateMutationWindowSize({ CHANNEL_COUNT })

  // 场景1: 先收到thickness数据，再收到airRing数据
  let result = next({ thickness: { ProbeValue: 100, timestamp: 1000 } })
  expect(result).toBe(null) // 第一个行程，还没有足够数据

  result = next({ thickness: { ProbeValue: 101, timestamp: 1010 } })
  expect(result).toBe(null)

  result = next({ thickness: { ProbeValue: 102, timestamp: 1020 } })
  expect(result).toBe(null)

  // 第一次airRing数据，应该初始化preSignal，不应该视为换向
  result = next({
    airRing: { ForwardRotation: true, ReverseRotation: false },
  })
  expect(result).toBe(null)

  // 继续添加thickness数据
  result = next({ thickness: { ProbeValue: 103, timestamp: 1030 } })
  expect(result).toBe(null)

  // 换向 - 第一个行程完成
  result = next({
    airRing: { ForwardRotation: false, ReverseRotation: true },
  })
  expect(result).toBe(null)

  // 第二个行程开始 - 现在就应该可以返回窗口大小了！
  result = next({ thickness: { ProbeValue: 104, timestamp: 1040 } })
  expect(result).not.toBe(null)
  // 第一个行程有 4 个点，除以 64 个通道，乘以 1.5 系数
  // 4 / 64 * 1.5 = 0.09375，Math.round = 0
  expect(result).toBe(0)

  result = next({ thickness: { ProbeValue: 105, timestamp: 1050 } })
  expect(result).toBe(0)
})

test('测试突变窗口大小标定 - 实际场景', () => {
  const CHANNEL_COUNT = 64
  const { next } = calibrateMutationWindowSize({ CHANNEL_COUNT })

  // 模拟第一个行程：1000个点
  for (let i = 0; i < 1000; i++) {
    next({ thickness: { ProbeValue: 100 + i * 0.1, timestamp: 1000 + i * 10 } })
  }

  // 初始化airRing信号
  next({ airRing: { ForwardRotation: true, ReverseRotation: false } })

  // 换向 - 第一个行程完成
  next({ airRing: { ForwardRotation: false, ReverseRotation: true } })

  // 第二个行程开始，应该立即返回窗口大小
  const result = next({
    thickness: { ProbeValue: 200, timestamp: 20000 },
  })

  expect(result).not.toBe(null)
  // 1000 / 64 * 1.5 = 23.4375，Math.round = 23
  expect(result).toBe(23)

  // 继续第二个行程，窗口大小应该保持一致
  const result2 = next({
    thickness: { ProbeValue: 201, timestamp: 20010 },
  })
  expect(result2).toBe(23)
})

test('测试突变窗口大小标定 - airRing先于thickness', () => {
  const CHANNEL_COUNT = 64
  const { next } = calibrateMutationWindowSize({ CHANNEL_COUNT })

  // 先收到airRing数据
  let result = next({
    airRing: { ForwardRotation: true, ReverseRotation: false },
  })
  expect(result).toBe(null)

  // 再收到thickness数据
  result = next({ thickness: { ProbeValue: 100, timestamp: 1000 } })
  expect(result).toBe(null)

  result = next({ thickness: { ProbeValue: 101, timestamp: 1010 } })
  expect(result).toBe(null)

  // 换向 - 第一个行程完成（2个点）
  result = next({
    airRing: { ForwardRotation: false, ReverseRotation: true },
  })
  expect(result).toBe(null)

  // 第二个行程开始，应该立即返回窗口大小
  result = next({
    thickness: { ProbeValue: 102, timestamp: 1020 },
  })
  expect(result).not.toBe(null)
  // 2 / 64 * 1.5 = 0.046875，Math.round = 0
  expect(result).toBe(0)

  // 继续收集更多数据
  for (let i = 0; i < 99; i++) {
    result = next({
      thickness: { ProbeValue: 103 + i, timestamp: 1030 + i * 10 },
    })
    expect(result).toBe(0) // 第一个行程的窗口大小
  }

  // 再次换向 - 第二个行程完成（100个点）
  result = next({
    airRing: { ForwardRotation: true, ReverseRotation: false },
  })
  expect(result).toBe(null)

  // 第三个行程，窗口大小应该基于前两个行程的平均值
  result = next({ thickness: { ProbeValue: 200, timestamp: 3000 } })
  expect(result).not.toBe(null)
  // (2 + 100) / 2 / 64 * 1.5 = 1.1953，Math.round = 1
  expect(result).toBe(1)
})

test('测试突变窗口大小标定 - 持续优化', () => {
  const CHANNEL_COUNT = 64
  const { next } = calibrateMutationWindowSize({ CHANNEL_COUNT })

  // 第一个行程：800个点
  for (let i = 0; i < 800; i++) {
    next({ thickness: { ProbeValue: 100 + i * 0.1, timestamp: 1000 + i * 10 } })
  }
  next({ airRing: { ForwardRotation: true, ReverseRotation: false } })
  next({ airRing: { ForwardRotation: false, ReverseRotation: true } })

  // 第二个行程开始，基于第一个行程
  let result = next({ thickness: { ProbeValue: 200, timestamp: 10000 } })
  expect(result).toBe(19) // 800 / 64 * 1.5 = 18.75，Math.round = 19

  // 完成第二个行程：1000个点
  for (let i = 1; i < 1000; i++) {
    next({
      thickness: { ProbeValue: 200 + i * 0.1, timestamp: 10000 + i * 10 },
    })
  }
  next({ airRing: { ForwardRotation: true, ReverseRotation: false } })

  // 第三个行程，基于前两个行程的平均值
  result = next({ thickness: { ProbeValue: 300, timestamp: 20000 } })
  expect(result).toBe(21) // (800 + 1000) / 2 / 64 * 1.5 = 21.09，Math.round = 21

  // 完成第三个行程：1200个点
  for (let i = 1; i < 1200; i++) {
    next({
      thickness: { ProbeValue: 300 + i * 0.1, timestamp: 20000 + i * 10 },
    })
  }
  next({ airRing: { ForwardRotation: false, ReverseRotation: true } })

  // 第四个行程，基于前三个行程的平均值
  result = next({ thickness: { ProbeValue: 400, timestamp: 30000 } })
  expect(result).toBe(23) // (800 + 1000 + 1200) / 3 / 64 * 1.5 = 23.44，Math.round = 23
})
