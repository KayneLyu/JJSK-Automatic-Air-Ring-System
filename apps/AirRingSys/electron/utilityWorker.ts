/**
 * utilityProcess Worker — 承载全部 CPU / I/O 密集型业务逻辑
 *
 * 运行在独立的 utilityProcess 子进程中，通过 postMessage 与主进程通信。
 * 主进程仅负责：窗口管理、ADBox TCP 连接、S7 TCP 连接、IPC 路由透传。
 *
 * 本 worker 拥有：
 *   - DataPipeline (RingBuffer + 计算路由 + 数据批推)
 *   - SQLiteService (better-sqlite3 同步写入，不阻塞 UI)
 *   - CalibrationBridge (标定会话管理)
 *   - 全部标定/查询 IPC 处理逻辑
 */

import { SQLiteService } from './db/service'
import { DataPipeline } from './dataPipeline'
import { createModbusCalibrationBridge, type ICalibrationBridge } from './calibrationBridge'
import {
  createCalibrationSession,
  calibrateTractionSpeed,
  calibrateMutationWindowSize,
  calibrateDistance,
  detectMutation,
  detectBimodalThreshold,
  estimateThetaMaxWithPhaseCorrection,
  type CalibrationConfig,
  type Scalar,
  type RingData,
  type PendingAngleEstimate,
} from '@jjsk/air-ring-server/electron'
import type {
  MainToUtilityMsg,
  UtilityToMainMsg,
  IpcRequestHandler,
} from './utilityProtocol'
import type {
  ICalibrationResult,
  MeasurementTripleInput,
  ICalibrationControlResult,
  ICalibrationBridgeState,
  IHistoricalCalibrationProgress,
  RotationTripSummaryRow,
} from '@/types/ipc'
import { reconstructBubbleThickness } from '@/views/settings/rack/utils/bubbleReconstruction'

// ═══════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: CalibrationConfig = {
  roller: { numCycles: 10, maxIntervalMs: 10_000 },
  upperRotation: {},
}

const DEFAULT_STANDARDIZED: Scalar = {
  CHANNEL_COUNT: 48,
  THICKNESS_UNIT_PULSE_DIS: 0.1,
  ROLLER: { DIAMETER: 100 },
}

const PAGE_SIZE = 5000
const MIN_VALID_ROTATION_TRIP_MS = 30_000
const MAX_VALID_ROTATION_TRIP_MS = 900_000

// ═══════════════════════════════════════════════════════════════
// 全局状态
// ═══════════════════════════════════════════════════════════════

let sqliteDb: SQLiteService | null = null
let pipeline: DataPipeline | null = null
let calibrationBridge: ICalibrationBridge | null = null
let maxPulse = 7000

// ═══════════════════════════════════════════════════════════════
// 消息发送辅助
// ═══════════════════════════════════════════════════════════════

function post(msg: UtilityToMainMsg): void {
  process.parentPort?.postMessage(msg)
}

function sendToRenderer(channel: string, data: unknown): void {
  post({ type: 'renderer-send', channel, data })
}

// ═══════════════════════════════════════════════════════════════
// 事件循环让出（用于大批量历史数据回放）
// ═══════════════════════════════════════════════════════════════

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

// ═══════════════════════════════════════════════════════════════
// 标定桥创建
// ═══════════════════════════════════════════════════════════════

function initCalibrationBridge(): void {
  calibrationBridge = createModbusCalibrationBridge({
    onResult: (result) => {
      post({
        type: 'calibration-result',
        result: result as ICalibrationResult,
      })
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// IPC 请求处理器注册表
// ═══════════════════════════════════════════════════════════════

const ipcHandlers: Record<string, IpcRequestHandler> = {}

function registerIpcHandler(channel: string, handler: IpcRequestHandler): void {
  ipcHandlers[channel] = handler
}

async function handleIpcRequest(
  id: string,
  channel: string,
  args: unknown[]
): Promise<void> {
  const handler = ipcHandlers[channel]
  if (!handler) {
    post({ type: 'ipc-response', id, error: `未知 IPC 通道: ${channel}` })
    return
  }

  try {
    const result = await handler(args)
    post({ type: 'ipc-response', id, result })
  } catch (err) {
    post({
      type: 'ipc-response',
      id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// 注册所有 IPC 处理器
// ═══════════════════════════════════════════════════════════════

function registerAllIpcHandlers(): void {
  // ── 标定控制 ──
  registerIpcHandler(
    'calibration-set-manual-traction-speed',
    async ([data]: unknown[]): Promise<ICalibrationControlResult> => {
      const manualTractionSpeed = Number(
        (data as { manualTractionSpeed: number }).manualTractionSpeed
      )
      if (!Number.isFinite(manualTractionSpeed) || manualTractionSpeed <= 0) {
        return {
          success: false,
          disturbanceTs: calibrationBridge?.getDisturbanceTs() ?? Date.now(),
          error: '牵引速度必须是大于 0 的有效数字',
        }
      }

      const disturbanceTs = Date.now()
      calibrationBridge?.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
      sendToRenderer('calibration-result', { tractionSpeed: manualTractionSpeed })
      return { success: true, manualTractionSpeed, disturbanceTs }
    }
  )

  registerIpcHandler('calibration-get-state', async (): Promise<ICalibrationBridgeState> => ({
    manualTractionSpeed: calibrationBridge?.getManualTractionSpeed(),
    disturbanceTs: calibrationBridge?.getDisturbanceTs() ?? Date.now(),
    result: calibrationBridge?.getResult() ?? null,
  }))

  registerIpcHandler(
    'calibration-reset',
    async (): Promise<ICalibrationControlResult> => {
      const disturbanceTs = Date.now()
      const manualTractionSpeed = calibrationBridge?.getManualTractionSpeed()
      calibrationBridge?.reset(disturbanceTs)

      if (manualTractionSpeed !== undefined) {
        sendToRenderer('calibration-result', { tractionSpeed: manualTractionSpeed })
      }
      return { success: true, manualTractionSpeed, disturbanceTs }
    }
  )

  // ── 标定历史数据回放 ──
  registerIpcHandler(
    'calibration-feed-historical',
    async ([input]: unknown[]) => {
      const {
        startMs,
        endMs,
        manualTractionSpeed,
        disturbanceTs,
      } = input as {
        startMs: number
        endMs: number
        manualTractionSpeed?: number
        disturbanceTs?: number
      }

      if (
        manualTractionSpeed !== undefined &&
        (!Number.isFinite(manualTractionSpeed) || manualTractionSpeed <= 0)
      ) {
        return {
          success: false,
          disturbanceTs: Date.now(),
          error: '牵引速度必须是大于 0 的有效数字',
        }
      }

      if (!sqliteDb) return { success: false, error: '数据库未初始化' }

      const totalThickness = sqliteDb.countThicknessRawInRange(startMs, endMs)
      const totalRotation = sqliteDb.countRotationRawInRange(startMs, endMs)

      if (totalThickness < 10) {
        return {
          success: false,
          disturbanceTs: disturbanceTs ?? Date.now(),
          error: `所选范围内有效数据不足 (thickness=${totalThickness})`,
        }
      }

      const total = totalThickness + totalRotation

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
        const rows = sqliteDb.queryThicknessRawPage(
          startMs,
          endMs,
          PAGE_SIZE,
          offset
        )
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
        await yieldToEventLoop()
      }

      const rotationRows = sqliteDb.queryRotationRaw(startMs, endMs)
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

      events.sort((a, b) => a.timestamp - b.timestamp)

      const session = createCalibrationSession({
        config: DEFAULT_CONFIG,
        standardized: DEFAULT_STANDARDIZED,
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
        sendToRenderer('calibration-historical-progress', {
          processed,
          total,
        } satisfies IHistoricalCalibrationProgress)
        await yieldToEventLoop()
      }

      if (pending) {
        try {
          const maxAngle = estimateThetaMaxWithPhaseCorrection(
            pending.tripSegments,
            pending.options
          )
          if (maxAngle != null) {
            session.applyAngleEstimate(maxAngle)
          }
        } catch (e) {
          console.error('[UtilityWorker] 历史数据角度估算失败:', e)
        }
      }

      const result = session.getResult()
      if (!result) {
        return {
          success: false,
          disturbanceTs: disturbanceTs ?? Date.now(),
          error: '所选范围内数据不足以完成标定',
        }
      }

      return { success: true, manualTractionSpeed, disturbanceTs: disturbanceTs ?? Date.now(), result }
    }
  )

  // ── 单参数独立标定 ──
  registerIpcHandler(
    'calibration-run-traction-speed',
    async ([input]: unknown[]) => {
      const { startMs, endMs, circumference, numCycles } = input as {
        startMs: number; endMs: number; circumference: number; numCycles?: number
      }
      if (!sqliteDb) return { success: false, error: '数据库未初始化' }

      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      if (thickness.length < 10) return { success: false, error: '数据不足' }

      let prevPos1: number | undefined
      const data = thickness.map((r) => {
        const rollSignal = prevPos1 !== undefined && r.pos1 !== prevPos1
        prevPos1 = r.pos1
        return {
          timestamp: r.timestamp,
          ProbeValue: r.ad,
          HorizontalPulse: r.pulse,
          MotionDirection: true,
          RollSpeedSignal: rollSignal || undefined,
        }
      })
      const speed = calibrateTractionSpeed(data, { circumference, numCycles })
      if (speed === null) {
        return { success: false, error: '历史数据中未检测到辊速信号' }
      }
      return { success: true, tractionSpeed: Math.round(speed * 100) / 100 }
    }
  )

  registerIpcHandler(
    'calibration-auto-traction-speed',
    async ([input]: unknown[]) => {
      const { circumference, numCycles = 10 } = input as {
        circumference: number; numCycles?: number
      }
      if (!sqliteDb) return { success: false, error: '数据库未初始化' }

      const bridgeResult = calibrationBridge?.getResult()
      if (bridgeResult?.tractionSpeed && bridgeResult.tractionSpeed > 0) {
        return {
          success: true,
          tractionSpeed: Math.round(bridgeResult.tractionSpeed * 100) / 100,
          source: 'live',
        }
      }

      const latestTs = sqliteDb.getLatestThicknessTimestamp()
      if (!latestTs) {
        return { success: false, error: '数据库无厚度数据', source: 'historical' }
      }
      const windowMs = numCycles * 10 * 2000
      const startMs = Math.max(0, latestTs - windowMs)
      const thickness = sqliteDb.queryThicknessRaw(startMs, latestTs)

      if (thickness.length < 10) {
        return { success: false, error: '数据不足', source: 'historical' }
      }
      let prevPos1: number | undefined
      const data = thickness.map((r) => {
        const rollSignal = prevPos1 !== undefined && r.pos1 !== prevPos1
        prevPos1 = r.pos1
        return {
          timestamp: r.timestamp,
          ProbeValue: r.ad,
          HorizontalPulse: r.pulse,
          MotionDirection: true,
          RollSpeedSignal: rollSignal || undefined,
        }
      })
      const speed = calibrateTractionSpeed(data, { circumference, numCycles })
      if (speed === null) {
        return { success: false, error: '未检测到辊速信号', source: 'historical' }
      }
      return {
        success: true,
        tractionSpeed: Math.round(speed * 100) / 100,
        source: 'historical',
      }
    }
  )

  registerIpcHandler(
    'calibration-run-mutation-window',
    async ([input]: unknown[]) => {
      const { startMs, endMs, channelCount, alpha } = input as {
        startMs: number; endMs: number; channelCount: number; alpha?: number
      }
      if (!sqliteDb) return { success: false, error: '数据库未初始化' }

      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      const rotation = sqliteDb.queryRotationRaw(startMs, endMs)
      if (thickness.length < 10) return { success: false, error: '厚度数据不足' }
      if (rotation.length < 10) return { success: false, error: '旋转数据不足' }

      const thickData = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const ringData: RingData[] = rotation.map((r) => ({
        timestamp: r.timestamp,
        ForwardRotation: r.forwardRotation === 1,
        ReverseRotation: r.reverseRotation === 1,
        MotorFrequency: r.motorFrequency,
        ForwardDirectionChange: r.forwardDirChange === 1,
        ReverseDirectionChange: r.reverseDirChange === 1,
        Reset: r.reset === 1,
        Heats: JSON.parse(r.heats || '[]') as number[],
      }))

      const result = calibrateMutationWindowSize(thickData, ringData, {
        channelCount,
        alpha,
      })
      const windowSize = result.size ?? result.fastSize
      if (windowSize === undefined) {
        return {
          success: false,
          error: '数据中未检测到换向信号，无法标定突变窗口',
        }
      }
      return { success: true, mutationWindowSize: Math.round(windowSize) }
    }
  )

  registerIpcHandler(
    'calibration-run-distance',
    async ([input]: unknown[]) => {
      const {
        startMs,
        endMs,
        tractionSpeed,
        disturbanceTs,
        windowSize,
        deviation,
      } = input as {
        startMs: number
        endMs: number
        tractionSpeed: number
        disturbanceTs: number
        windowSize: number
        deviation?: number
      }
      if (!sqliteDb) return { success: false, error: '数据库未初始化' }

      if (!Number.isFinite(tractionSpeed) || tractionSpeed <= 0) {
        return { success: false, error: '牵引速度无效，请先标定牵引速度' }
      }
      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      if (thickness.length < windowSize + 10) {
        return { success: false, error: '数据不足' }
      }
      const thickData = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const mutation = detectMutation(thickData, windowSize, deviation)
      if (!mutation || !mutation.timestamp) {
        return {
          success: false,
          error: '未检测到厚度突变，请确保窗口内有扰动信号',
        }
      }
      const distance = calibrateDistance(
        tractionSpeed,
        mutation.timestamp,
        disturbanceTs
      )
      return {
        success: true,
        distance: Math.round(distance * 100) / 100,
      }
    }
  )

  // 膜宽标定：取测厚仪最近 10 趟扫描，按 AD 寻边算法算出每趟的膜内 pulse 区间，取中位数
  // 寻边直接用 AD：测厚仪在膜上 AD 较低（材料吸收多），出膜 AD 升高（接近 airAD）
  // 双峰阈值就是 AD 在膜内/膜外的分界
  const MEMBRANE_CAL_SWEEP_COUNT = 10

  registerIpcHandler(
    'calibration-run-membrane-width',
    async ([input]: unknown[]) => {
      const { mmPerPulse } = input as { mmPerPulse: number }
      if (!sqliteDb) return { success: false, error: '数据库未初始化' }
      if (!Number.isFinite(mmPerPulse) || mmPerPulse <= 0) {
        return { success: false, error: 'mm/脉冲无效，请先填写' }
      }

      // 优化：原实现循环 10 次调用 querySweepByIndex，每次都触发一次
      // 全表 6-CTE trip 切分流水线 — 在大数据库上 N×O(N) 远超 60s 超时。
      // 改为：1 次全表扫描拿到所有 trip summary（保留原 ASC 顺序语义，
      // 即原 querySweepByIndex('single', 0..9) 的 idx 0..9 取法），
      // 然后按时间区间分别拉点数据。
      const allSummaries = sqliteDb.queryAllSweepSummaries()
      if (allSummaries.length === 0) {
        return { success: false, error: '没有可用的历史扫描数据' }
      }

      const targetCount = Math.min(MEMBRANE_CAL_SWEEP_COUNT, allSummaries.length)
      const recentSweeps: Array<{
        points: { pos: number; ad: number; ts: number }[]
      }> = []
      for (let idx = 0; idx < targetCount; idx += 1) {
        const s = allSummaries[idx]
        const points = sqliteDb.querySweepPointsByTimeRange(s.startTs, s.endTs)
        if (points.length > 0) recentSweeps.push({ points })
      }

      if (recentSweeps.length === 0) {
        return { success: false, error: '没有可用的历史扫描数据' }
      }

      // 每趟独立做寻边：AD → detectBimodalThreshold → 首/末 in-membrane pulse
      // AD <= threshold 表示在膜（AD 较低 = 在膜材料内）
      const sweepWidthsPulses: number[] = []
      let totalSamples = 0
      for (const sweep of recentSweeps) {
        if (sweep.points.length < 100) continue
        totalSamples += sweep.points.length
        const ads: number[] = []
        const pulses: number[] = []
        for (const p of sweep.points) {
          pulses.push(p.pos)
          ads.push(p.ad)
        }

        const threshold = detectBimodalThreshold(ads)
        if (threshold === null) continue
        // 寻边：AD <= threshold 表示在膜
        // 取首/末仍在膜内的 pulse 位置 = 膜物理边界
        let leadingPulse: number | null = null
        let trailingPulse: number | null = null
        for (let i = 0; i < ads.length; i++) {
          if (ads[i] <= threshold) {
            leadingPulse = pulses[i]
            break
          }
        }
        for (let i = ads.length - 1; i >= 0; i--) {
          if (ads[i] <= threshold) {
            trailingPulse = pulses[i]
            break
          }
        }
        if (
          leadingPulse === null ||
          trailingPulse === null ||
          trailingPulse <= leadingPulse
        ) {
          continue
        }
        sweepWidthsPulses.push(trailingPulse - leadingPulse)
      }

      if (sweepWidthsPulses.length === 0) {
        return {
          success: false,
          error:
            '最近 10 趟中没有一趟能通过寻边判定膜边界（检查 airAD 是否正确，或最近扫描是否覆盖膜边界）',
        }
      }

      // 中位数（比均值更抗单趟异常）
      const sortedWidths = [...sweepWidthsPulses].sort((a, b) => a - b)
      const medianWidthPulses =
        sortedWidths[Math.floor(sortedWidths.length / 2)]
      const membraneWidthMm = medianWidthPulses * mmPerPulse

      return {
        success: true,
        membraneWidthMm: Math.round(membraneWidthMm * 10) / 10,
        sampleCount: totalSamples,
        sweepCount: recentSweeps.length,
        edgeSweepCount: sweepWidthsPulses.length,
      }
    }
  )

  // ── SQLite 历史数据查询 ──
  registerIpcHandler('db-get-thickness-raw', async ([startMs, endMs]: unknown[]) => {
    return sqliteDb?.queryThicknessRaw(startMs as number, endMs as number) ?? []
  })

  registerIpcHandler('db-get-latest-thickness-raw', async ([count]: unknown[]) => {
    return sqliteDb?.queryLatestThicknessRaw(count as number) ?? []
  })

  registerIpcHandler('db-get-sweep-summaries', async ([count, beforeTs]: unknown[]) => {
    return sqliteDb?.queryLatestSweepSummaries(count as number, (beforeTs as number) ?? 0) ?? []
  })

  registerIpcHandler('db-get-latest-rotation-trips', async ([count, beforeTs]: unknown[]) => {
    return sqliteDb?.queryLatestRotationTripSummaries(count as number, (beforeTs as number) ?? 0) ?? []
  })

  registerIpcHandler('db-get-latest-rotation-trips-fallback', async ([count, beforeTs]: unknown[]) => {
    if (!sqliteDb) return []
    const limit = Math.max(1, Number(count) || 1)
    const changes = sqliteDb.queryLatestDirectionChanges(limit + 1, (beforeTs as number) ?? 0)
    if (changes.length < 2) return []

    const asc = [...changes].sort((a, b) => a.timestamp - b.timestamp)
    const trips: RotationTripSummaryRow[] = []
    for (let i = 0; i < asc.length - 1; i++) {
      const cur = asc[i]
      const next = asc[i + 1]
      const isForward = cur.forwardDirChange > 0 && cur.reverseDirChange <= 0
      const isReverse = cur.reverseDirChange > 0 && cur.forwardDirChange <= 0
      if (!isForward && !isReverse) continue
      if (next.timestamp <= cur.timestamp) continue
      if (next.timestamp - cur.timestamp < MIN_VALID_ROTATION_TRIP_MS) continue
      if (next.timestamp - cur.timestamp > MAX_VALID_ROTATION_TRIP_MS) continue
      trips.push({
        id: `rotation-fallback-${cur.id}`,
        time: cur.timestamp,
        direction: isForward ? 'forward' : 'reverse',
        cycleDurationMs: next.timestamp - cur.timestamp,
      })
    }

    if (trips.length <= limit) return trips
    return trips.slice(trips.length - limit)
  })

  registerIpcHandler('db-get-sweep-points-by-range', async ([startTs, endTs]: unknown[]) => {
    return sqliteDb?.querySweepPointsByRange(startTs as number, endTs as number) ?? []
  })

  registerIpcHandler('db-get-sweep-count-by-mode', async ([mode]: unknown[]) => {
    return sqliteDb?.querySweepCountByMode(mode as 'single' | 'round') ?? 0
  })

  registerIpcHandler('db-get-sweep-ids-by-mode', async ([mode]: unknown[]) => {
    return sqliteDb?.querySweepIdsByMode(mode as 'single' | 'round') ?? []
  })

  registerIpcHandler('db-get-sweep-by-index', async ([mode, index]: unknown[]) => {
    return sqliteDb?.querySweepByIndex(mode as 'single' | 'round', index as number) ?? null
  })

  registerIpcHandler('db-get-frames', async ([startMs, endMs, count]: unknown[]) => {
    return sqliteDb?.queryFramesByTimeRange(
      startMs as number,
      endMs as number,
      (count as number) ?? 100,
      maxPulse,
    ) ?? []
  })

  registerIpcHandler('db-get-latest-frame', async () => null)
  registerIpcHandler('db-get-latest-frames', async () => [])
  registerIpcHandler('db-get-frames-by-id', async () => [])

  registerIpcHandler('db-get-pipeline-stats', async () => {
    return pipeline?.getStats() ?? null
  })

  registerIpcHandler('db-import-sweep', async ([sweep]: unknown[]) => {
    if (!sqliteDb) return 0
    const s = sweep as { pulses: number[]; adValues: number[]; source: string }
    return sqliteDb.importSweep(s.pulses, s.adValues, s.source)
  })

  // ── 膜泡重建 ──
  registerIpcHandler('bubble-reconstruct', async ([params]: unknown[]) => {
    if (!pipeline) return null
    return pipeline.getBubbleProfile(params as Parameters<typeof pipeline.getBubbleProfile>[0])
  })

  registerIpcHandler('bubble-reconstruct-window', async ([input]: unknown[]) => {
    const payload = input as {
      measurements: MeasurementTripleInput[]
      membraneWidthMm: number
      numBins?: number
      processDeformationFactor?: number
      preferAfterTs?: number
    }

    if (!payload || !Array.isArray(payload.measurements)) return null
    if (!Number.isFinite(payload.membraneWidthMm) || payload.membraneWidthMm <= 0) return null
    if (payload.measurements.length < 50) return null

    return reconstructBubbleThickness(
      payload.measurements,
      payload.membraneWidthMm,
      {
        numBins: payload.numBins,
        processDeformationFactor: payload.processDeformationFactor,
        preferAfterTs: payload.preferAfterTs,
      }
    )
  })

  registerIpcHandler('bubble-get-sweeps', async ([params]: unknown[]) => {
    if (!pipeline) return []
    return pipeline.getBubbleSweeps(params as Parameters<typeof pipeline.getBubbleSweeps>[0])
  })

  registerIpcHandler('bubble-get-latest-sweeps', async ([params]: unknown[]) => {
    if (!pipeline) return []
    return pipeline.getLatestBubbleSweeps(params as Parameters<typeof pipeline.getLatestBubbleSweeps>[0])
  })

  registerIpcHandler('bubble-get-current-sweep', async ([params]: unknown[]) => {
    if (!pipeline) return null
    return pipeline.getCurrentBubbleSweep(params as Parameters<typeof pipeline.getCurrentBubbleSweep>[0])
  })

  // ── 膜泡重建 sweep 对比 ──
  registerIpcHandler('bubble-compare-sweeps', async ([sweeps]: unknown[]) => {
    const arr = sweeps as Array<{ profile: number[] }>
    if (!arr || arr.length < 2) return null
    const a = arr[0].profile
    const b = arr[1].profile
    if (!a || !b || a.length !== b.length) return null
    let sumSq = 0
    const n = a.length
    for (let i = 0; i < n; i++) sumSq += (a[i] - b[i]) ** 2
    return { rmse: Math.sqrt(sumSq / n) }
  })
}

// ═══════════════════════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════════════════════

function doInit(payload: MainToUtilityMsg & { type: 'init' }): void {
  const { dbDir, maxPulse: mp } = payload.payload
  maxPulse = mp

  console.log('[UtilityWorker] 初始化数据库:', dbDir)
  sqliteDb = new SQLiteService()
  sqliteDb.init(dbDir)

  console.log('[UtilityWorker] 初始化标定桥...')
  initCalibrationBridge()

  console.log('[UtilityWorker] 初始化数据管道...')
  pipeline = new DataPipeline(
    { webContents: { send: sendToRenderer } } as never,
    sqliteDb,
  )
  pipeline.registerComputation({
    feedThicknessSample: (sample) =>
      calibrationBridge?.feedThicknessSample(sample) ?? null,
    feedUpperRotationData: (data) =>
      calibrationBridge?.feedUpperRotationData(data) ?? null,
    emitUpperRotationData: (data) => sendToRenderer('upperRotation-read', data),
  })
  pipeline.start()

  registerAllIpcHandlers()

  console.log('[UtilityWorker] 初始化完成')
  post({ type: 'ready' })
}

// ═══════════════════════════════════════════════════════════════
// 消息入口
// ═══════════════════════════════════════════════════════════════

if (!process.parentPort) {
  throw new Error('utilityWorker 必须作为 utilityProcess 子进程运行')
}

// 立即通知主进程：子进程已启动
post({ type: 'ready' })

process.parentPort.on('message', (event) => {
  const msg = event.data as MainToUtilityMsg
  switch (msg.type) {
    case 'init':
      doInit(msg)
      break
    case 'shutdown':
      pipeline?.stop()
      sqliteDb?.close()
      process.exit(0)
      break
    case 'thickness-push':
      if (pipeline) {
        pipeline.receiveThickness(msg.push, msg.receivedAt)
      }
      break
    case 'rotation-data':
      if (pipeline) {
        pipeline.receiveRotation(msg.data)
      }
      break
    case 'ipc-request':
      void handleIpcRequest(msg.id, msg.channel, msg.args)
      break
    default:
      console.warn('[UtilityWorker] 未知消息类型:', (msg as { type: string }).type)
  }
})

// 未捕获异常兜底
process.on('uncaughtException', (err) => {
  console.error('[UtilityWorker] 未捕获异常:', err)
  post({ type: 'error', message: err.message })
})

process.on('unhandledRejection', (reason) => {
  console.error('[UtilityWorker] 未处理的 Promise 拒绝:', reason)
})
