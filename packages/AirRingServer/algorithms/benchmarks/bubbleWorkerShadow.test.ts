import { describe, expect, test, vi } from 'vitest'
import {
  solveBatch,
  type BubbleNativeBinding,
  type SparseSystem,
} from '../bubbleReconstruction'
import {
  handleBubbleWorkerRequest,
  resolveBubbleRustPrimaryEnabled,
  type BubbleWorkerRequest,
  type BubbleWorkerRuntime,
} from '../../../../apps/AirRingSys/electron/bubbleWorker'

const request: BubbleWorkerRequest = {
  id: 1,
  type: 'reconstruct',
  triples: Array.from({ length: 160 }, (_, index) => ({
    upperAngleDeg: (index * 7) % 360,
    scannerPosMm: -150 + (index % 40) * (300 / 39),
    thickness: 90 + Math.sin(index / 8) * 4,
  })),
  membraneWidthMm: 300,
  options: { numBins: 48, lambda: 1e-4, mu: 0.0005 },
}

const fakeBinding: BubbleNativeBinding = {
  solveBubbleBatch: (rowPtr, colInd, values, targets, numBins, lambda, mu) =>
    solveBatch(
      {
        M: targets.length,
        N: numBins,
        rowPtr,
        colInd,
        values,
        b: targets,
        rawThickness: new Float64Array(targets.length),
      } satisfies SparseSystem,
      lambda,
      mu
    ),
}

const createRuntime = (
  overrides: Partial<BubbleWorkerRuntime> = {}
): BubbleWorkerRuntime => ({
  rustShadowEnabled: true,
  rustPrimaryEnabled: false,
  loadNativeBinding: () => fakeBinding,
  logTelemetry: vi.fn(),
  logPrimaryTelemetry: vi.fn(),
  ...overrides,
})

describe('膜泡 Worker Rust shadow', () => {
  test('mise primary 可通过独立禁用开关临时回滚', () => {
    expect(
      resolveBubbleRustPrimaryEnabled({ AIR_RING_BUBBLE_RUST_PRIMARY: '1' })
    ).toBe(true)
    expect(
      resolveBubbleRustPrimaryEnabled({
        AIR_RING_BUBBLE_RUST_PRIMARY: '1',
        AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: '1',
      })
    ).toBe(false)
  })

  test('shadow 关闭时不加载 Native', () => {
    const loadNativeBinding = vi.fn(() => fakeBinding)
    const response = handleBubbleWorkerRequest(
      request,
      createRuntime({ rustShadowEnabled: false, loadNativeBinding })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).not.toHaveBeenCalled()
    expect('rustShadow' in response).toBe(false)
  })

  test('Batch shadow 成功但 TypeScript 仍提供生产结果', () => {
    const runtime = createRuntime()
    const response = handleBubbleWorkerRequest(request, runtime)

    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.result.profile).toHaveLength(48)
    expect(response.rustShadow).toMatchObject({
      status: 'success',
      numBins: 48,
      maxAbsProfileDelta: 0,
      rmsProfileDelta: 0,
      error: null,
    })
    expect(response.rustShadow?.tsTotalMs).toBeGreaterThanOrEqual(0)
    expect(response.rustShadow?.rustTotalMs).toBeGreaterThanOrEqual(0)
    expect(runtime.logTelemetry).toHaveBeenCalledOnce()
  })

  test('Native 加载失败只记录 telemetry，不影响结果', () => {
    const response = handleBubbleWorkerRequest(
      request,
      createRuntime({
        loadNativeBinding: () => {
          throw new Error('native unavailable')
        },
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.result.profile).toHaveLength(48)
    expect(response.rustShadow).toMatchObject({
      status: 'loadError',
      rustTotalMs: null,
      error: 'native unavailable',
    })
  })

  test('Native 执行失败只记录 telemetry，不影响结果', () => {
    const response = handleBubbleWorkerRequest(
      request,
      createRuntime({
        loadNativeBinding: () => ({
          solveBubbleBatch: () => {
            throw new Error('native execution failed')
          },
        }),
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.result.profile).toHaveLength(48)
    expect(response.rustShadow).toMatchObject({
      status: 'executionError',
      rustTotalMs: null,
      error: 'native execution failed',
    })
  })

  test('RLS 请求不执行 Batch Native shadow', () => {
    const loadNativeBinding = vi.fn(() => fakeBinding)
    const response = handleBubbleWorkerRequest(
      { ...request, options: { ...request.options, solverMode: 'rls' } },
      createRuntime({ loadNativeBinding })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).not.toHaveBeenCalled()
    expect('rustShadow' in response).toBe(false)
  })

  test('Rust primary 成功时提供生产结果，并与 shadow 互斥', () => {
    const production = handleBubbleWorkerRequest(
      request,
      createRuntime({ rustShadowEnabled: false })
    )
    const logTelemetry = vi.fn()
    const logPrimaryTelemetry = vi.fn()
    const primary = handleBubbleWorkerRequest(
      request,
      createRuntime({
        rustPrimaryEnabled: true,
        rustShadowEnabled: true,
        logTelemetry,
        logPrimaryTelemetry,
      })
    )

    expect(production.ok).toBe(true)
    expect(primary.ok).toBe(true)
    if (!production.ok || !primary.ok) return
    expect(primary.result).toEqual(production.result)
    expect(primary.rustPrimary).toMatchObject({
      status: 'success',
      fallbackTsTotalMs: null,
      error: null,
    })
    expect(primary.rustShadow).toBeUndefined()
    expect(logPrimaryTelemetry).toHaveBeenCalledOnce()
    expect(logTelemetry).not.toHaveBeenCalled()
  })

  test('Rust primary 加载失败时完整回退 TypeScript', () => {
    const production = handleBubbleWorkerRequest(
      request,
      createRuntime({ rustShadowEnabled: false })
    )
    const primary = handleBubbleWorkerRequest(
      request,
      createRuntime({
        rustPrimaryEnabled: true,
        loadNativeBinding: () => {
          throw new Error('native unavailable')
        },
      })
    )

    expect(production.ok).toBe(true)
    expect(primary.ok).toBe(true)
    if (!production.ok || !primary.ok) return
    expect(primary.result).toEqual(production.result)
    expect(primary.rustPrimary).toMatchObject({
      status: 'fallback',
      rustSolveMs: null,
      rustTotalMs: null,
      error: 'native unavailable',
    })
  })

  test('Rust primary 执行或结果校验失败时完整回退 TypeScript', () => {
    const production = handleBubbleWorkerRequest(
      request,
      createRuntime({ rustShadowEnabled: false })
    )
    const primary = handleBubbleWorkerRequest(
      request,
      createRuntime({
        rustPrimaryEnabled: true,
        loadNativeBinding: () => ({ solveBubbleBatch: () => [Number.NaN] }),
      })
    )

    expect(production.ok).toBe(true)
    expect(primary.ok).toBe(true)
    if (!production.ok || !primary.ok) return
    expect(primary.result).toEqual(production.result)
    expect(primary.rustPrimary).toMatchObject({
      status: 'fallback',
      error: 'Native 膜泡 profile 长度不匹配: 1 !== 48',
    })
  })

  test('RLS 请求不执行 Rust primary', () => {
    const loadNativeBinding = vi.fn(() => fakeBinding)
    const response = handleBubbleWorkerRequest(
      { ...request, options: { ...request.options, solverMode: 'rls' } },
      createRuntime({ rustPrimaryEnabled: true, loadNativeBinding })
    )

    expect(response.ok).toBe(true)
    expect(loadNativeBinding).not.toHaveBeenCalled()
    expect('rustPrimary' in response).toBe(false)
  })
})
