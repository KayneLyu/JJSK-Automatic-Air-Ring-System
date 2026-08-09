import { parentPort } from 'node:worker_threads'

parentPort?.on('message', (request) => {
  if (request.type === 'shutdown') {
    parentPort.postMessage({ id: request.id, type: 'shutdown', ok: true })
    parentPort.close()
    return
  }

  if (request.options?.deltaRange?.min === -999) {
    process.exitCode = 2
    parentPort.close()
    return
  }

  const delayMs = request.options?.deltaRange?.min === -998 ? 500 : 10
  setTimeout(() => {
    parentPort.postMessage({
      id: request.id,
      ok: true,
      maxAngle: request.id,
    })
  }, delayMs)
})
