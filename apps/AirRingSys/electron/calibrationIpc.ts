import { ipcMain } from 'electron'
import type {
  ICalibrationControlResult,
  ICalibrationBridgeState,
  ICalibrationResult,
  IHistoricalCalibrationProgress,
} from '@/types/ipc'
import {
  createCalibrationSession,
  calibrateTractionSpeed,
  calibrateMutationWindowSize,
  detectMutation,
  calibrateDistance,
  buildTripSegments,
  calibrateMaxAngle,
  detectBimodalThreshold,
  estimateThetaMaxWithPhaseCorrection,
  type CalibrationConfig,
  type Scalar,
  type RingData,
  type PendingAngleEstimate,
} from '@jjsk/air-ring-server/electron'
import type { ICalibrationBridge } from './calibrationBridge'
import type { SQLiteService } from './sqliteService'

export type { ICalibrationBridge }

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

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => setImmediate(resolve))

export type InitCalibrationIpcOptions = {
  bridge: ICalibrationBridge
  sqliteDb: SQLiteService
  sendToWindow: (channel: string, data: unknown) => void
}

export function initCalibrationIpc(options: InitCalibrationIpcOptions) {
  const { bridge, sqliteDb, sendToWindow } = options

  ipcMain.handle(
    'calibration-set-manual-traction-speed',
    async (
      _event: unknown,
      data: unknown
    ): Promise<ICalibrationControlResult> => {
      const manualTractionSpeed = Number(
        (data as { manualTractionSpeed: number }).manualTractionSpeed
      )

      if (!Number.isFinite(manualTractionSpeed) || manualTractionSpeed <= 0) {
        return {
          success: false,
          disturbanceTs: bridge.getDisturbanceTs() ?? Date.now(),
          error: '牵引速度必须是大于 0 的有效数字',
        }
      }

      const disturbanceTs = Date.now()
      bridge.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
      sendToWindow('calibration-result', { tractionSpeed: manualTractionSpeed })

      return { success: true, manualTractionSpeed, disturbanceTs }
    }
  )

  ipcMain.handle(
    'calibration-get-state',
    async (): Promise<ICalibrationBridgeState> => ({
      manualTractionSpeed: bridge.getManualTractionSpeed(),
      disturbanceTs: bridge.getDisturbanceTs() ?? Date.now(),
      result: bridge.getResult(),
    })
  )

  ipcMain.handle(
    'calibration-reset',
    async (): Promise<ICalibrationControlResult> => {
      const disturbanceTs = Date.now()
      const manualTractionSpeed = bridge.getManualTractionSpeed()
      bridge.reset(disturbanceTs)

      if (manualTractionSpeed !== undefined) {
        sendToWindow('calibration-result', {
          tractionSpeed: manualTractionSpeed,
        })
      }

      return { success: true, manualTractionSpeed, disturbanceTs }
    }
  )

  ipcMain.handle(
    'calibration-feed-historical',
    async (
      _event: unknown,
      input: {
        startMs: number
        endMs: number
        manualTractionSpeed?: number
        disturbanceTs?: number
      }
    ): Promise<ICalibrationControlResult & { result?: ICalibrationResult }> => {
      const { startMs, endMs, disturbanceTs } = input
      const manualTractionSpeed = input.manualTractionSpeed

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

      // 按时间戳合并所有事件（厚度 + 旋转），确保 MutationWindowSizeNext
      // 能同时看到 thickness 和 airRing 信号来正确计算 size
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

      // 收集所有事件
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

      // 按时间戳排序
      events.sort((a, b) => a.timestamp - b.timestamp)

      // 创建临时标定 session
      const session = createCalibrationSession({
        config: DEFAULT_CONFIG,
        standardized: DEFAULT_STANDARDIZED,
        manualTractionSpeed,
      })

      // 如果提供了扰动时间戳，在喂数据前设置
      if (disturbanceTs !== undefined) {
        session.setManualTractionSpeed(manualTractionSpeed, disturbanceTs)
      }

      let pending: PendingAngleEstimate | null = null
      let processed = 0

      // 分批喂入（按时间排序的事件），每批之间让出事件循环
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
        sendToWindow('calibration-historical-progress', {
          processed,
          total,
        } satisfies IHistoricalCalibrationProgress)
        await yieldToEventLoop()
      }

      // 角度估算
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
          console.error('[CalibrationIpc] 历史数据角度估算失败:', e)
        }
      }

      const result = session.getResult()

      if (!result) {
        return {
          success: false,
          disturbanceTs: disturbanceTs ?? Date.now(),
          error:
            '所选范围内数据不足以完成标定（需要测厚仪来回扫描、上旋有换向动作、有扰动信号）',
        }
      }

      return {
        success: true,
        manualTractionSpeed,
        disturbanceTs: disturbanceTs ?? Date.now(),
        result,
      }
    }
  )

  // ═══ 单参数独立标定（历史数据） ═══

  ipcMain.handle(
    'calibration-run-traction-speed',
    async (
      _event: unknown,
      input: {
        startMs: number
        endMs: number
        circumference: number
        numCycles?: number
      }
    ): Promise<{
      success: boolean
      tractionSpeed?: number
      error?: string
    }> => {
      const { startMs, endMs, circumference, numCycles } = input
      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      if (thickness.length < 10) {
        return { success: false, error: '数据不足' }
      }
      const data = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const speed = calibrateTractionSpeed(data, {
        circumference,
        numCycles,
      })
      if (speed === null) {
        return {
          success: false,
          error: '历史数据中未检测到辊速信号，无法计算牵引速度',
        }
      }
      return { success: true, tractionSpeed: Math.round(speed * 100) / 100 }
    }
  )

  ipcMain.handle(
    'calibration-auto-traction-speed',
    async (
      _event: unknown,
      input: {
        circumference: number
        numCycles?: number
      }
    ): Promise<{
      success: boolean
      tractionSpeed?: number
      source?: string
      error?: string
    }> => {
      const { circumference, numCycles = 10 } = input

      // 实时路径：尝试从桥读取当前标定结果
      const bridgeResult = bridge.getResult()
      if (bridgeResult?.tractionSpeed && bridgeResult.tractionSpeed > 0) {
        return {
          success: true,
          tractionSpeed: Math.round(bridgeResult.tractionSpeed * 100) / 100,
          source: 'live',
        }
      }

      // 历史路径：自动取最新 numCycles * 10 倍数据量
      const latestTs = sqliteDb.getLatestThicknessTimestamp()
      if (!latestTs) {
        return {
          success: false,
          error: '数据库无厚度数据',
          source: 'historical',
        }
      }
      // 每一圈保守估计最少 2 秒，总共 numCycles * 10 圈
      const windowMs = numCycles * 10 * 2000
      const startMs = Math.max(0, latestTs - windowMs)
      const thickness = sqliteDb.queryThicknessRaw(startMs, latestTs)

      if (thickness.length < 10) {
        return { success: false, error: '数据不足', source: 'historical' }
      }
      const data = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const speed = calibrateTractionSpeed(data, { circumference, numCycles })
      if (speed === null) {
        return {
          success: false,
          error: '未检测到辊速信号，无法计算牵引速度',
          source: 'historical',
        }
      }
      return {
        success: true,
        tractionSpeed: Math.round(speed * 100) / 100,
        source: 'historical',
      }
    }
  )

  ipcMain.handle(
    'calibration-run-mutation-window',
    async (
      _event: unknown,
      input: {
        startMs: number
        endMs: number
        channelCount: number
        alpha?: number
      }
    ): Promise<{
      success: boolean
      mutationWindowSize?: number
      error?: string
    }> => {
      const { startMs, endMs, channelCount, alpha } = input
      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      const rotation = sqliteDb.queryRotationRaw(startMs, endMs)
      if (thickness.length < 10) {
        return { success: false, error: '厚度数据不足' }
      }
      const thickData = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const ringData = rotation.map((r) => ({
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

  ipcMain.handle(
    'calibration-run-max-angle',
    async (
      _event: unknown,
      input: {
        startMs: number
        endMs: number
        deltaMin?: number
        deltaMax?: number
        objectiveMode?: string
      }
    ): Promise<{ success: boolean; maxAngle?: number; error?: string }> => {
      const { startMs, endMs, deltaMin, deltaMax, objectiveMode } = input
      const thickness = sqliteDb.queryThicknessRaw(startMs, endMs)
      const rotation = sqliteDb.queryRotationRaw(startMs, endMs)
      if (thickness.length < 100 || rotation.length < 2) {
        return {
          success: false,
          error: '数据不足（需要足够厚度数据和上旋换向信号）',
        }
      }
      const thickData = thickness.map((r) => ({
        timestamp: r.timestamp,
        ProbeValue: r.ad,
        HorizontalPulse: r.pulse,
        MotionDirection: true,
      }))
      const ringData = rotation.map((r) => ({
        timestamp: r.timestamp,
        ForwardRotation: r.forwardRotation === 1,
        ReverseRotation: r.reverseRotation === 1,
        MotorFrequency: r.motorFrequency,
        ForwardDirectionChange: r.forwardDirChange === 1,
        ReverseDirectionChange: r.reverseDirChange === 1,
        Reset: r.reset === 1,
        Heats: JSON.parse(r.heats || '[]') as number[],
      }))
      const segments = buildTripSegments(thickData, ringData)
      if (segments.length < 2) {
        return {
          success: false,
          error: '未能构建完整行程（至少需要 2 个上旋换向行程）',
        }
      }
      const angle = calibrateMaxAngle(segments, {
        deltaRange: {
          min: deltaMin ?? 180,
          max: deltaMax ?? 359,
          step: 1,
        },
        objectiveMode: objectiveMode as any,
      })
      if (angle === null) {
        return {
          success: false,
          error: '角度估算失败',
        }
      }
      return { success: true, maxAngle: Math.round(angle * 10) / 10 }
    }
  )

  ipcMain.handle(
    'calibration-max-angle-historical',
    async (
      _event: unknown,
      input: {
        deltaMin?: number
        deltaMax?: number
        objectiveMode?: string
      }
    ): Promise<{ success: boolean; maxAngle?: number; error?: string }> => {
      const { deltaMin, deltaMax, objectiveMode } = input
      const BATCH_MS = 60_000
      const MAX_BATCHES = 1440

      const latestTs = sqliteDb.getLatestThicknessTimestamp()
      if (!latestTs) {
        return { success: false, error: '没有厚度历史数据' }
      }

      let endMs = latestTs + 1
      let allThickness: Awaited<ReturnType<typeof sqliteDb.queryThicknessRaw>> = []
      let allRotation: Awaited<ReturnType<typeof sqliteDb.queryRotationRaw>> = []

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        await yieldToEventLoop()
        const startMs = endMs - BATCH_MS
        const thicknessBatch = sqliteDb.queryThicknessRaw(startMs, endMs)
        const rotationBatch = sqliteDb.queryRotationRaw(startMs, endMs)

        allThickness = [...thicknessBatch, ...allThickness]
        allRotation = [...rotationBatch, ...allRotation]
        endMs = startMs

        if (allThickness.length < 100 || allRotation.length < 2) continue

        await yieldToEventLoop()
        const thickData = allThickness.map((r) => ({
          timestamp: r.timestamp,
          ProbeValue: r.ad,
          HorizontalPulse: r.pulse,
          MotionDirection: true,
        }))
        const ringData = allRotation.map((r) => ({
          timestamp: r.timestamp,
          ForwardRotation: r.forwardRotation === 1,
          ReverseRotation: r.reverseRotation === 1,
          MotorFrequency: r.motorFrequency,
          ForwardDirectionChange: r.forwardDirChange === 1,
          ReverseDirectionChange: r.reverseDirChange === 1,
          Reset: r.reset === 1,
          Heats: JSON.parse(r.heats || '[]') as number[],
        }))

        await yieldToEventLoop()
        const segments = buildTripSegments(thickData, ringData)
        if (segments.length < 2) continue

        await yieldToEventLoop()
        const angle = calibrateMaxAngle(segments, {
          deltaRange: {
            min: deltaMin ?? 180,
            max: deltaMax ?? 359,
            step: 1,
          },
          objectiveMode: objectiveMode as any,
        })
        if (angle !== null) {
          return { success: true, maxAngle: Math.round(angle * 10) / 10 }
        }
      }

      return { success: false, error: '数据不足以完成标定（需要至少 2 个上旋换向行程）' }
    }
  )

  ipcMain.handle(
    'calibration-run-distance',
    async (
      _event: unknown,
      input: {
        startMs: number
        endMs: number
        tractionSpeed: number
        disturbanceTs: number
        windowSize: number
        deviation?: number
      }
    ): Promise<{ success: boolean; distance?: number; error?: string }> => {
      const {
        startMs,
        endMs,
        tractionSpeed,
        disturbanceTs,
        windowSize,
        deviation,
      } = input
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
  // 趟的切分复用 sqliteService 的 SQL 分段索引（与 LongitudinalCharts 同源）。
  // 寻边直接用 AD：测厚仪在膜上 AD 较低（材料吸收多），出膜 AD 升高（接近 airAD）
  // 双峰阈值就是 AD 在膜内/膜外的分界
  const MEMBRANE_CAL_SWEEP_COUNT = 10

  ipcMain.handle(
    'calibration-run-membrane-width',
    async (
      _event: unknown,
      input: { mmPerPulse: number }
    ): Promise<{
      success: boolean
      membraneWidthMm?: number
      sampleCount?: number
      sweepCount?: number
      edgeSweepCount?: number
      error?: string
    }> => {
      const { mmPerPulse } = input
      if (!Number.isFinite(mmPerPulse) || mmPerPulse <= 0) {
        return { success: false, error: 'mm/脉冲无效，请先填写' }
      }
      const totalSweeps = sqliteDb.querySweepCountByMode('single')
      if (totalSweeps <= 0) {
        return { success: false, error: '没有可用的历史扫描数据' }
      }

      const targetCount = Math.min(MEMBRANE_CAL_SWEEP_COUNT, totalSweeps)
      const recentSweeps: Array<{
        points: { pos: number; ad: number; ts: number }[]
      }> = []
      for (let idx = 0; idx < targetCount; idx += 1) {
        const result = sqliteDb.querySweepByIndex('single', idx)
        if (!result || result.sweeps.length === 0) continue
        const firstSweep = result.sweeps[0]
        if (firstSweep.points.length === 0) continue
        recentSweeps.push({ points: firstSweep.points })
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
}
