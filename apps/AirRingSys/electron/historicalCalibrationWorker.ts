/**
 * 历史标定数据回放 Worker
 *
 * 在独立 Worker 线程中执行 calibration-feed-historical 的完整流程：
 *   1. 打开只读 SQLite WAL 连接
 *   2. 分页读取 thickness_raw + rotation_raw
 *   3. 构造 events 并 feed 进 CalibrationSession
 *   4. 角度估算委托给 calibrationWorker（嵌套 Worker）
 *   5. 通过 parentPort 报告进度，最终返回标定结果
 *
 * 目的：将重型 SQL 查询从 utilityProcess 主线程剥离，
 *       确保 ADBox/S7 实时数据流的持续接收不被阻塞。
 */
import { parentPort } from 'node:worker_threads'
import { createReadOnlyConnection } from './db/service'
import {
  buildTripSegment,
  createCalibrationSession,
} from '@jjsk/air-ring-server/electron'
import type {
  CalibrationConfig,
  Scalar,
  PendingAngleEstimate,
  TripSegment,
} from '@jjsk/air-ring-server/electron'
import {
  countThicknessRawInRange,
  countRotationRawInRange,
  queryRotationRaw,
} from './db/rawQueries'
import {
  runCalibrationAngleEstimate,
  shutdownCalibrationAngleWorker,
} from './calibrationBridge'

// ═══════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════

export type HistoricalCalibrationRequest = {
  id: number
  /** SQLite 数据库路径 */
  dbPath: string
  /** 查询时间范围 */
  startMs: number
  endMs: number
  /** 可选的手动牵引速度 */
  manualTractionSpeed?: number
  /** 可选的扰动时间戳 */
  disturbanceTs?: number
  /** 仅构建上旋行程并估算最大角度，不依赖完整标定前置项 */
  angleOnly?: boolean
  /** 标定配置 */
  config: CalibrationConfig
  /** 标准化参数 */
  standardized: Scalar
}

export type HistoricalCalibrationWorkerProgress = {
  type: 'progress'
  id: number
  processed: number
  total: number
}

export type HistoricalCalibrationWorkerResponse =
  | {
      type: 'result'
      id: number
      ok: true
      manualTractionSpeed?: number
      disturbanceTs: number
      result: ReturnType<
        ReturnType<typeof createCalibrationSession>['getResult']
      >
    }
  | {
      type: 'result'
      id: number
      ok: false
      disturbanceTs: number
      error: string
    }

type WorkerMessage = HistoricalCalibrationRequest

type HistoricalThicknessRow = {
  id: number
  timestamp: number
  pulse: number
  ad: number
}

// ═══════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 5000

// ═══════════════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════════════

if (!parentPort) {
  throw new Error(
    'historicalCalibrationWorker must be run as a worker_threads Worker'
  )
}

parentPort.on('message', async (msg: WorkerMessage) => {
  const {
    id,
    dbPath,
    startMs,
    endMs,
    manualTractionSpeed,
    disturbanceTs,
    angleOnly,
    config,
    standardized,
  } = msg

  try {
    // ── 打开只读 SQLite 连接（WAL 模式，不阻塞主线程写入） ──
    const ro = createReadOnlyConnection(dbPath)

    try {
      // ── 统计总量 ──
      const totalThickness = countThicknessRawInRange(ro.db, startMs, endMs)
      const totalRotation = countRotationRawInRange(ro.db, startMs, endMs)

      if (totalThickness < 10) {
        parentPort!.postMessage({
          type: 'result',
          id,
          ok: false,
          disturbanceTs: disturbanceTs ?? Date.now(),
          error: `所选范围内有效数据不足 (thickness=${totalThickness})`,
        } satisfies HistoricalCalibrationWorkerResponse)
        return
      }

      const total = totalThickness + totalRotation

      // ── 游标分页读取厚度数据，避免 OFFSET 深分页 ──
      const thicknessRows: HistoricalThicknessRow[] = []
      const thicknessPageStatement = ro.sqliteDb.prepare(`
        SELECT id, timestamp, pulse, ad
        FROM thickness_raw
        WHERE timestamp >= ? AND timestamp < ?
          AND (timestamp > ? OR (timestamp = ? AND id > ?))
        ORDER BY timestamp ASC, id ASC
        LIMIT ?
      `)
      let cursorTimestamp = startMs - 1
      let cursorId = 0
      while (thicknessRows.length < totalThickness) {
        const rows = thicknessPageStatement.all(
          startMs,
          endMs,
          cursorTimestamp,
          cursorTimestamp,
          cursorId,
          PAGE_SIZE
        ) as HistoricalThicknessRow[]
        if (rows.length === 0) break
        thicknessRows.push(...rows)
        const last = rows[rows.length - 1]
        cursorTimestamp = last.timestamp
        cursorId = last.id
        parentPort!.postMessage({
          type: 'progress',
          id,
          processed: thicknessRows.length,
          total,
        } satisfies HistoricalCalibrationWorkerProgress)
      }

      // ── 读取旋转数据 ──
      const rotationRows = queryRotationRaw(ro.db, startMs, endMs)

      // ── 运行标定会话 ──
      const session = createCalibrationSession({
        config,
        standardized,
        manualTractionSpeed,
      })

      if (disturbanceTs !== undefined) {
        session.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
      }

      const tripSegmentBuilder = angleOnly ? buildTripSegment() : null
      let angleOnlySegments: TripSegment[] = []
      let pending: PendingAngleEstimate | null = null
      let processed = 0
      let thicknessIndex = 0
      let rotationIndex = 0
      let previousPulse: number | undefined
      while (
        thicknessIndex < thicknessRows.length ||
        rotationIndex < rotationRows.length
      ) {
        const thickness = thicknessRows[thicknessIndex]
        const rotation = rotationRows[rotationIndex]
        if (
          thickness !== undefined &&
          (rotation === undefined || thickness.timestamp <= rotation.timestamp)
        ) {
          const motionDirection =
            previousPulse === undefined || thickness.pulse >= previousPulse
          previousPulse = thickness.pulse
          const thicknessData = {
            timestamp: thickness.timestamp,
            ProbeValue: thickness.ad,
            HorizontalPulse: thickness.pulse,
            MotionDirection: motionDirection,
          }
          if (tripSegmentBuilder) {
            angleOnlySegments = tripSegmentBuilder.next({
              thickness: thicknessData,
            })
          } else {
            const result = session.feedThickness(thicknessData)
            if (result.pendingAngleEstimate) {
              pending = result.pendingAngleEstimate
            }
          }
          thicknessIndex++
        } else if (rotation !== undefined) {
          const airRingData = {
            timestamp: rotation.timestamp,
            ForwardRotation: rotation.forwardRotation === 1,
            ReverseRotation: rotation.reverseRotation === 1,
            MotorFrequency: rotation.motorFrequency,
            ForwardDirectionChange: rotation.forwardDirChange === 1,
            ReverseDirectionChange: rotation.reverseDirChange === 1,
            Reset: rotation.reset === 1,
            Heats: JSON.parse(rotation.heats || '[]') as number[],
          }
          if (tripSegmentBuilder) {
            angleOnlySegments = tripSegmentBuilder.next({
              airRing: airRingData,
            })
          } else {
            const result = session.feedAirRing(airRingData)
            if (result.pendingAngleEstimate) {
              pending = result.pendingAngleEstimate
            }
          }
          rotationIndex++
        }

        processed++
        if (processed % PAGE_SIZE === 0 || processed === total) {
          parentPort!.postMessage({
            type: 'progress',
            id,
            processed,
            total,
          } satisfies HistoricalCalibrationWorkerProgress)
        }
      }

      if (angleOnly) {
        const usableSegments = angleOnlySegments.filter(
          (segment) => segment.duration > 0 && segment.measurements.length > 0
        )
        if (usableSegments.length < 2) {
          parentPort!.postMessage({
            type: 'result',
            id,
            ok: false,
            disturbanceTs: disturbanceTs ?? Date.now(),
            error: `未能构建至少 2 个有效上旋行程（完整有效行程=${usableSegments.length}，旋转记录=${rotationRows.length}，厚度记录=${thicknessRows.length}）`,
          } satisfies HistoricalCalibrationWorkerResponse)
          return
        }

        const upperRotation = config.upperRotation ?? {}
        const maxAngle = await runCalibrationAngleEstimate({
          tripSegments: usableSegments,
          options: {
            deltaRange: upperRotation.deltaRange ?? {
              min: 180,
              max: 359,
              step: 1,
            },
            objectiveMode: upperRotation.objectiveMode,
          },
        })
        parentPort!.postMessage({
          type: 'result',
          id,
          ok: true,
          manualTractionSpeed,
          disturbanceTs: disturbanceTs ?? Date.now(),
          result: { maxAngle },
        } satisfies HistoricalCalibrationWorkerResponse)
        return
      }

      // ── 角度估算（委托给 calibrationWorker） ──
      if (pending) {
        const maxAngle = await runCalibrationAngleEstimate({
          tripSegments: pending.tripSegments,
          options: pending.options,
        })
        session.applyAngleEstimate(maxAngle)
      }

      // ── 返回结果 ──
      const result = session.getResult()
      if (!result) {
        parentPort!.postMessage({
          type: 'result',
          id,
          ok: false,
          disturbanceTs: disturbanceTs ?? Date.now(),
          error: '所选范围内数据不足以完成标定',
        } satisfies HistoricalCalibrationWorkerResponse)
        return
      }

      parentPort!.postMessage({
        type: 'result',
        id,
        ok: true,
        manualTractionSpeed,
        disturbanceTs: disturbanceTs ?? Date.now(),
        result,
      } satisfies HistoricalCalibrationWorkerResponse)
    } finally {
      ro.close()
      try {
        await shutdownCalibrationAngleWorker()
      } catch (error) {
        console.warn(
          '[HistoricalCalibrationWorker] Calibration Worker 优雅关闭失败:',
          error
        )
      }
    }
  } catch (err) {
    parentPort!.postMessage({
      type: 'result',
      id,
      ok: false,
      disturbanceTs: disturbanceTs ?? Date.now(),
      error: err instanceof Error ? err.message : String(err),
    } satisfies HistoricalCalibrationWorkerResponse)
  }
})
