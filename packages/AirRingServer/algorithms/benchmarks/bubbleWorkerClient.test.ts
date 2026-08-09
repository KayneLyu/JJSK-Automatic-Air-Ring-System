import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { createBubbleWorkerClient } from '../../../../apps/AirRingSys/electron/bubbleWorkerClient'

const WORKER_PATH = pathToFileURL(
  resolve(import.meta.dirname, 'bubbleWorkerClient.fixture.mjs')
)

const createRequest = (membraneWidthMm = 300) => ({
  type: 'reconstruct' as const,
  triples: [],
  membraneWidthMm,
})

describe.sequential('Bubble Worker 持久客户端', () => {
  test('复用单个 Worker、FIFO 排队并优雅关闭', async () => {
    const client = createBubbleWorkerClient({ workerPath: WORKER_PATH })
    const responses = await Promise.all([
      client.run(createRequest()),
      client.run(createRequest()),
      client.run(createRequest()),
    ])

    expect(responses.map((response) => response.result.profile[0])).toEqual([
      1, 2, 3,
    ])
    expect(client.getWorkerCreateCount()).toBe(1)
    expect(client.isBusy()).toBe(false)
    expect(client.getQueueLength()).toBe(0)
    await expect(client.shutdown()).resolves.toBeUndefined()
  })

  test('异常退出后重建 Worker 并继续队列', async () => {
    const client = createBubbleWorkerClient({ workerPath: WORKER_PATH })
    const failed = client.run(createRequest(-999))
    const queued = client.run(createRequest())

    await expect(failed).rejects.toThrow('异常退出')
    await expect(queued).resolves.toMatchObject({ ok: true })
    expect(client.getWorkerCreateCount()).toBe(2)
    await expect(client.shutdown()).resolves.toBeUndefined()
  })

  test('超时回收后重建 Worker 并继续队列', async () => {
    const client = createBubbleWorkerClient({
      workerPath: WORKER_PATH,
      timeoutMs: 200,
    })
    const timedOut = client.run(createRequest(-998))
    const queued = client.run(createRequest())

    await expect(timedOut).rejects.toThrow('超时')
    await expect(queued).resolves.toMatchObject({ ok: true })
    expect(client.getWorkerCreateCount()).toBe(2)
    await expect(client.shutdown()).resolves.toBeUndefined()
  })
})
