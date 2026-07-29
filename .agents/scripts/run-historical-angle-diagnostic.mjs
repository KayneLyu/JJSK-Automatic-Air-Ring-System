import { Worker } from 'node:worker_threads'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const dbPath = process.argv[2]
const startMs = Number(process.argv[3])
const endMs = Number(process.argv[4])
const objectiveMode = process.argv[5] ?? 'auto'

if (!dbPath || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
  throw new Error('usage: run-historical-angle-diagnostic.mjs <db> <startMs> <endMs>')
}

const workerPath = pathToFileURL(
  resolve('apps/AirRingSys/dist-electron/historicalCalibrationWorker.js')
)
const worker = new Worker(workerPath)
const timeout = setTimeout(() => {
  console.error('diagnostic timeout')
  void worker.terminate()
  process.exitCode = 1
}, 190_000)

worker.on('message', (message) => {
  if (message.type === 'progress') {
    if (message.processed === message.total || message.processed % 100_000 === 0) {
      console.log(`progress ${message.processed}/${message.total}`)
    }
    return
  }
  clearTimeout(timeout)
  console.log(JSON.stringify(message, null, 2))
  void worker.terminate()
})

worker.on('error', (error) => {
  clearTimeout(timeout)
  console.error(error)
  process.exitCode = 1
})

worker.postMessage({
  id: 1,
  dbPath,
  startMs,
  endMs,
  angleOnly: true,
  config: {
    roller: { numCycles: 10, maxIntervalMs: 10_000 },
    upperRotation: {
      deltaRange: { min: 180, max: 359, step: 1 },
      objectiveMode,
    },
  },
  standardized: {
    CHANNEL_COUNT: 48,
    THICKNESS_UNIT_PULSE_DIS: 0.1,
    ROLLER: { DIAMETER: 100 },
  },
})
