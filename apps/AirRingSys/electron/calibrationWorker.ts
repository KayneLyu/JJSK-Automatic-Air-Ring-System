/**
 * 上旋角度算法 Worker 线程
 *
 * 运行在独立的 Node.js worker_threads 线程中，
 * 接收 tripSegments + options，执行 CPU 密集型的
 * estimateThetaMaxWithPhaseCorrection，并将结果 postMessage 回主线程。
 *
 * 这样主进程事件循环不会被 10s 量级的算法阻塞，ADBox 1ms 推送可持续正常接收。
 */
import { parentPort } from 'node:worker_threads'
import {
  estimateThetaMaxWithPhaseCorrectionDetailed,
  type TripSegment,
  type UpperRotationObjectiveMode,
} from '@jjsk/air-ring-server/electron'

export type CalibrationWorkerRequest = {
  id: number
  tripSegments: TripSegment[]
  options: {
    deltaRange: { min: number; max: number; step: number }
    objectiveMode?: UpperRotationObjectiveMode
  }
}

export type CalibrationWorkerResponse =
  | { id: number; ok: true; maxAngle: number }
  | { id: number; ok: false; error: string }

if (!parentPort) {
  throw new Error('calibrationWorker must be run as a worker_threads Worker')
}

parentPort.on('message', (req: CalibrationWorkerRequest) => {
  try {
    const estimate = estimateThetaMaxWithPhaseCorrectionDetailed(
      req.tripSegments,
      req.options
    )
    const response: CalibrationWorkerResponse = estimate.thetaMaxDeg != null
      ? { id: req.id, ok: true, maxAngle: estimate.thetaMaxDeg }
      : {
          id: req.id,
          ok: false,
          error: `角度估算被拒绝（原因=${estimate.diagnostics.rejectReason ?? 'signalInsufficient'}，完整行程=${estimate.diagnostics.completeSegments}，过滤后行程=${estimate.diagnostics.filteredSegments}，有效测点=${estimate.diagnostics.totalPoints}）`,
        }
    parentPort!.postMessage(response)
  } catch (err) {
    const response: CalibrationWorkerResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    parentPort!.postMessage(response)
  }
})
