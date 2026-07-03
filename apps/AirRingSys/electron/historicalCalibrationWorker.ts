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
import { createCalibrationSession } from '@jjsk/air-ring-server/electron'
import type {
  CalibrationConfig,
  Scalar,
  RingData,
  PendingAngleEstimate,
} from '@jjsk/air-ring-server/electron'
import {
  queryThicknessRawPage,
  countThicknessRawInRange,
  countRotationRawInRange,
  queryRotationRaw,
} from './db/rawQueries'
import { runCalibrationAngleEstimate } from './calibrationBridge'

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
      result: ReturnType<ReturnType<typeof createCalibrationSession>['getResult']>
    }
  | {
      type: 'result'
      id: number
      ok: false
      disturbanceTs: number
      error: string
    }

type WorkerMessage = HistoricalCalibrationRequest

// ═══════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 5000

// ═══════════════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════════════

if (!parentPort) {
  throw new Error('historicalCalibrationWorker must be run as a worker_threads Worker')
}

parentPort.on('message', async (msg: WorkerMessage) => {
  const { id, dbPath, startMs, endMs, manualTractionSpeed, disturbanceTs, config, standardized } = msg

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

      // ── 读取厚度数据 ──
      type FeedEvent = {
        timestamp: number
        thickness?: {
          timestamp: number
          ProbeValue: number
          HorizontalPulse: number
          MotionDirection: boolean
        }
        airRing?: RingData
      }
      const events: FeedEvent[] = []

      let prevPulse: number | undefined
      for (let offset = 0; offset < totalThickness; offset += PAGE_SIZE) {
        const rows = queryThicknessRawPage(ro.db, startMs, endMs, PAGE_SIZE, offset)
        for (const r of rows) {
          const md = prevPulse === undefined ? true : r.pulse >= prevPulse
          prevPulse = r.pulse
          events.push({
            timestamp: r.timestamp,
            thickness: {
              timestamp: r.timestamp,
              ProbeValue: r.ad,
              HorizontalPulse: r.pulse,
              MotionDirection: md,
            },
          })
        }

        // 报告进度
        parentPort!.postMessage({
          type: 'progress',
          id,
          processed: events.length,
          total,
        } satisfies HistoricalCalibrationWorkerProgress)
      }

      // ── 读取旋转数据 ──
      const rotationRows = queryRotationRaw(ro.db, startMs, endMs)
      for (const r of rotationRows) {
        events.push({
          timestamp: r.timestamp,
          airRing: {
            timestamp: r.timestamp,
            ForwardRotation: r.forwardRotation === 1,
            ReverseRotation: r.reverseRotation === 1,
            MotorFrequency: r.motorFrequency,
            ForwardDirectionChange: r.forwardDirChange === 1,
            ReverseDirectionChange: r.reverseDirChange === 1,
            Reset: r.reset === 1,
            Heats: JSON.parse(r.heats || '[]') as number[],
          },
        })
      }

      // 事件排序
      events.sort((a, b) => a.timestamp - b.timestamp)

      // ── 运行标定会话 ──
      const session = createCalibrationSession({
        config,
        standardized,
        manualTractionSpeed,
      })

      if (disturbanceTs !== undefined) {
        session.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
      }

      let pending: PendingAngleEstimate | null = null
      let processed = 0

      for (let offset = 0; offset < events.length; offset += PAGE_SIZE) {
        const batch = events.slice(offset, offset + PAGE_SIZE)
        for (const ev of batch) {
          if (ev.thickness) {
            const ret = session.feedThickness(ev.thickness)
            if (ret.pendingAngleEstimate) pending = ret.pendingAngleEstimate
          }
          if (ev.airRing) {
            const ret2 = session.feedAirRing(ev.airRing)
            if (ret2.pendingAngleEstimate) pending = ret2.pendingAngleEstimate
          }
        }

        processed += batch.length
        parentPort!.postMessage({
          type: 'progress',
          id,
          processed,
          total,
        } satisfies HistoricalCalibrationWorkerProgress)
      }

      // ── 角度估算（委托给 calibrationWorker） ──
      if (pending) {
        try {
          const maxAngle = await runCalibrationAngleEstimate({
            tripSegments: pending.tripSegments,
            options: pending.options,
          })
          if (maxAngle != null) {
            session.applyAngleEstimate(maxAngle)
          }
        } catch (e) {
          console.error('[HistoricalCalibrationWorker] 角度估算失败:', e)
        }
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
