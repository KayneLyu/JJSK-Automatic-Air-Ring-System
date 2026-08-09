import { parentPort } from 'node:worker_threads'

parentPort?.on('message', (request) => {
  if (request.type === 'shutdown') {
    parentPort.postMessage({ id: request.id, type: 'shutdown', ok: true })
    parentPort.close()
    return
  }

  if (request.membraneWidthMm === -999) {
    process.exitCode = 2
    parentPort.close()
    return
  }

  const delayMs = request.membraneWidthMm === -998 ? 500 : 10
  setTimeout(() => {
    parentPort.postMessage({
      id: request.id,
      type: 'reconstruct',
      ok: true,
      result: {
        profile: [request.id],
        numBins: 1,
        binWidthDeg: 360,
        rmsError: 0,
        maxError: 0,
        numMeasurements: request.triples.length,
        binCoverage: [1],
        processDeformationFactor: 1,
      },
    })
  }, delayMs)
})
