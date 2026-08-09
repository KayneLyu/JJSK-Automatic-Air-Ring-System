import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import { createCalibrationWorkerClient } from '../../../../apps/AirRingSys/electron/calibrationWorkerClient'

const WORKER_PATH = pathToFileURL(
  resolve(import.meta.dirname, 'calibrationWorkerClient.fixture.mjs')
)

const createRequest = (min = 180) => ({
  tripSegments: [],
  options: { deltaRange: { min, max: 360, step: 1 } },
})

describe.sequential('Calibration Worker 持久客户端', () => {
  test('复用单个 Worker、FIFO 排队并在忙时拒绝实时请求', async () => {
    const client = createCalibrationWorkerClient({ workerPath: WORKER_PATH })
    const onResult = vi.fn()

    const first = client.run(createRequest())
    expect(client.tryRun(createRequest(), onResult)).toBe(false)
    const second = client.run(createRequest())
    const third = client.run(createRequest())

    const responses = await Promise.all([first, second, third])
    expect(responses.map((response) => response.maxAngle)).toEqual([1, 2, 3])
    expect(onResult).not.toHaveBeenCalled()
    expect(client.getWorkerCreateCount()).toBe(1)
    expect(client.isBusy()).toBe(false)
    expect(client.getQueueLength()).toBe(0)

    await expect(client.shutdown()).resolves.toBeUndefined()
  })

  test('Worker 异常退出后拒绝当前请求并用新 Worker 继续队列', async () => {
    const internalErrors: Error[] = []
    const client = createCalibrationWorkerClient({
      workerPath: WORKER_PATH,
      onInternalError: (error) => internalErrors.push(error),
    })

    const failed = client.run(createRequest(-999))
    const queued = client.run(createRequest())

    await expect(failed).rejects.toThrow('异常退出')
    await expect(queued).resolves.toMatchObject({ ok: true, maxAngle: 2 })
    expect(client.getWorkerCreateCount()).toBe(2)
    expect(internalErrors).toHaveLength(1)

    await expect(client.shutdown()).resolves.toBeUndefined()
  })

  test('超时回收 Worker 后继续处理队列', async () => {
    const client = createCalibrationWorkerClient({
      workerPath: WORKER_PATH,
      timeoutMs: 200,
    })

    const timedOut = client.run(createRequest(-998))
    const queued = client.run(createRequest())

    await expect(timedOut).rejects.toThrow('超时')
    await expect(queued).resolves.toMatchObject({ ok: true, maxAngle: 2 })
    expect(client.getWorkerCreateCount()).toBe(2)

    await expect(client.shutdown()).resolves.toBeUndefined()
  })
})
