import { describe, expect, test, vi } from 'vitest'
import type { TripSegment } from '../../electron'
import {
  handleCalibrationWorkerRequest,
  resolveRustPrimaryEnabled,
  resolveRustShadowThreadLimit,
  type CalibrationWorkerRuntime,
} from '../../../../apps/AirRingSys/electron/calibrationWorker'

const makeTripSegments = (): TripSegment[] => {
  const makeSegment = (isForward: boolean, phase: number): TripSegment => ({
    startTime: 0,
    duration: 420_000,
    isForward,
    measurements: Array.from({ length: 2_000 }, (_, index) => {
      const progress = index / 1_999
      return {
        t: progress * 420_000,
        y: 50 + Math.sin(progress * Math.PI * 8 + phase) * 4,
        pulse: progress * 10_000,
      }
    }),
  })
  return [makeSegment(true, 0), makeSegment(false, 0.7)]
}

const makeRuntime = (
  overrides: Partial<CalibrationWorkerRuntime> = {}
): CalibrationWorkerRuntime => ({
  rustShadowEnabled: false,
  threadLimit: 2,
  loadNativeBinding: () => {
    throw new Error('Native 不应加载')
  },
  logTelemetry: vi.fn(),
  ...overrides,
})

const request = {
  id: 1,
  tripSegments: makeTripSegments(),
  options: { deltaRange: { min: 180, max: 360, step: 1 } },
}

describe.sequential('Calibration Worker Rust 影子隔离', () => {
  test('mise primary 可通过独立禁用开关临时回滚', () => {
    expect(resolveRustPrimaryEnabled({ AIR_RING_RUST_PRIMARY: '1' })).toBe(true)
    expect(
      resolveRustPrimaryEnabled({
        AIR_RING_RUST_PRIMARY: '1',
        AIR_RING_RUST_PRIMARY_DISABLE: '1',
      })
    ).toBe(false)
  })

  test('线程上限仅接受 1–32 整数', () => {
    expect(resolveRustShadowThreadLimit(undefined)).toBeGreaterThanOrEqual(1)
    expect(resolveRustShadowThreadLimit(undefined)).toBeLessThanOrEqual(4)
    expect(resolveRustShadowThreadLimit('6')).toBe(6)
    expect(() => resolveRustShadowThreadLimit('0')).toThrow(/1–32/)
    expect(() => resolveRustShadowThreadLimit('33')).toThrow(/1–32/)
    expect(() => resolveRustShadowThreadLimit('1.5')).toThrow(/1–32/)
  })

  test('影子关闭时不加载 Native 且响应不包含 telemetry', () => {
    const loadNativeBinding = vi.fn(() => {
      throw new Error('Native 不应加载')
    })
    const response = handleCalibrationWorkerRequest(
      request,
      makeRuntime({ loadNativeBinding })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).not.toHaveBeenCalled()
    if (response.ok) expect(response.rustShadow).toBeUndefined()
  })

  test('观测策略跳过时不加载 Native 且不记录 telemetry', () => {
    const loadNativeBinding = vi.fn(() => {
      throw new Error('Native 不应加载')
    })
    const logTelemetry = vi.fn()
    const response = handleCalibrationWorkerRequest(
      request,
      makeRuntime({
        rustShadowEnabled: true,
        shouldRunRustShadow: () => false,
        loadNativeBinding,
        logTelemetry,
      })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).not.toHaveBeenCalled()
    expect(logTelemetry).not.toHaveBeenCalled()
    if (response.ok) expect(response.rustShadow).toBeUndefined()
  })

  test('Native 加载失败不改变 TypeScript maxAngle', () => {
    const production = handleCalibrationWorkerRequest(request, makeRuntime())
    const logTelemetry = vi.fn()
    const shadow = handleCalibrationWorkerRequest(
      request,
      makeRuntime({
        rustShadowEnabled: true,
        loadNativeBinding: () => {
          throw new Error('binding missing')
        },
        logTelemetry,
      })
    )

    expect(production.ok).toBe(true)
    expect(shadow.ok).toBe(true)
    if (production.ok && shadow.ok) {
      expect(shadow.maxAngle).toBe(production.maxAngle)
      expect(shadow.rustShadow?.status).toBe('loadError')
      expect(shadow.rustShadow?.error).toContain('binding missing')
    }
    expect(logTelemetry).toHaveBeenCalledOnce()
  })

  test('Native 搜索结果只进入 telemetry，不覆盖 maxAngle', () => {
    const production = handleCalibrationWorkerRequest(request, makeRuntime())
    const shadow = handleCalibrationWorkerRequest(
      request,
      makeRuntime({
        rustShadowEnabled: true,
        loadNativeBinding: () => ({
          configureThreadPool: (threads) => threads,
          searchBestDirect: () => ({ theta: 250, loss: 1, evaluations: 1 }),
          searchBestExpanded: () => ({ theta: 250, loss: 1, evaluations: 1 }),
        }),
      })
    )

    expect(production.ok).toBe(true)
    expect(shadow.ok).toBe(true)
    if (production.ok && shadow.ok) {
      expect(shadow.maxAngle).toBe(production.maxAngle)
      expect(shadow.maxAngle).not.toBe(250)
      expect(shadow.rustShadow?.nativeThetaDeg).toBe(250)
      expect(shadow.rustShadow?.status).toBe('success')
    }
  })

  test('Rust primary 成功时提供最终 maxAngle，并与 shadow 互斥', () => {
    const search = () => ({
      theta: 250,
      loss: 1,
      evaluations: 2,
      sampleThetas: [180, 250],
      sampleLosses: [2, 1],
    })
    const loadNativeBinding = vi.fn(() => ({
      configureThreadPool: (threads: number) => threads,
      evaluateDirect: () => 1,
      evaluateExpanded: () => 1,
      searchBestDirect: search,
      searchBestExpanded: search,
    }))
    const logTelemetry = vi.fn()
    const response = handleCalibrationWorkerRequest(
      request,
      makeRuntime({
        rustPrimaryEnabled: true,
        rustShadowEnabled: true,
        loadNativeBinding,
        logTelemetry,
      })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).toHaveBeenCalledOnce()
    expect(logTelemetry).not.toHaveBeenCalled()
    if (response.ok) {
      expect(response.rustPrimary?.status).toBe('success')
      expect(response.rustPrimary?.finalThetaDeg).toBe(response.maxAngle)
      expect(response.rustShadow).toBeUndefined()
    }
  })

  test('Rust primary 执行失败时自动回退 TypeScript 结果', () => {
    const production = handleCalibrationWorkerRequest(request, makeRuntime())
    const response = handleCalibrationWorkerRequest(
      request,
      makeRuntime({
        rustPrimaryEnabled: true,
        loadNativeBinding: () => ({
          configureThreadPool: (threads) => threads,
          evaluateDirect: () => {
            throw new Error('native evaluate failed')
          },
          evaluateExpanded: () => {
            throw new Error('native evaluate failed')
          },
          searchBestDirect: () => {
            throw new Error('native search failed')
          },
          searchBestExpanded: () => {
            throw new Error('native search failed')
          },
        }),
      })
    )

    expect(production.ok).toBe(true)
    expect(response.ok).toBe(true)
    if (production.ok && response.ok) {
      expect(response.maxAngle).toBe(production.maxAngle)
      expect(response.rustPrimary?.status).toBe('fallback')
      expect(response.rustPrimary?.error).toContain('未返回有效扫描估算')
    }
  })
})
