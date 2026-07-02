/**
 * 测厚仪扫描趟实时检测器
 *
 * 基于横向脉冲位置（pos0/pulse）的方向变化，实时识别每次扫描趟的
 * 起止边界。与现有的 6-CTE SQL 事后检测逻辑等价，但运行在数据接收
 * 路径上，无需等待 flush 或事后扫描。
 *
 * 方向约定：
 * - 内部 CurrentScan.direction = 1 | -1（ScannerDirection，与数学符号一致）
 * - 外部 ClosedScanPass.scannerDirection = 0 | 1（对应 scan_pass 表列，0=反向）
 * - 转换：closeCurrentScan 中 direction === 1 ? 1 : 0
 *
 * 物理背景：
 * - 测厚仪约 30 秒完成一次往返扫描，期间 ADBox 约产生 30,000 帧
 * - 扫描换向时 pos0 变化方向反转（递增 ↔ 递减）
 */

import { detectBimodalThreshold } from '@jjsk/air-ring-server/electron'

/** 扫描趟最小脉冲跨度：低于该值视为窄幅抖动，不可用于重构 */
export const MIN_SCAN_PULSE_SPAN = 1000
/** 膜内有效跨度最小值：首末膜内 pulse 间距低于该值视为覆盖不足 */
export const MIN_MEMBRANE_PULSE_SPAN = 800

/** 扫描趟方向：1 = 正向（脉冲递增），-1 = 反向（脉冲递减） */
export type ScannerDirection = 1 | -1

interface CurrentScan {
  direction: ScannerDirection
  startTs: number
  pulseMin: number
  pulseMax: number
  /** 有效厚度点数量（ad > 0 且非 NaN） */
  validCount: number
  /** 总采样点数 */
  totalCount: number
  /** 原始脉冲序列（用于双峰完整性判定） */
  pulses: number[]
  /** 原始 AD 序列（用于双峰完整性判定） */
  ads: number[]
}

/** 一个已完成的扫描趟 */
export interface ClosedScanPass {
  /** 扫描方向：0 = 反向，1 = 正向 */
  scannerDirection: 0 | 1
  /** 起始时间戳 (ms) */
  startTs: number
  /** 结束时间戳 (ms) */
  endTs: number
  /** 该趟最小 pulse（整趟范围，含出界区域） */
  pulseMin: number
  /** 该趟最大 pulse（整趟范围，含出界区域） */
  pulseMax: number
  /** 膜内最小 pulse（双峰边沿检测首膜内脉冲；rejected 时为 null） */
  membranePulseMin: number | null
  /** 膜内最大 pulse（双峰边沿检测末膜内脉冲；rejected 时为 null） */
  membranePulseMax: number | null
  /** 有效测点占比 (0-1) */
  validRatio: number
  /** 总采样点数 */
  totalCount: number
  /** 扫描趟状态：complete=完整趟，rejected=不满足双峰完整性 */
  status: 'complete' | 'rejected'
}

const isAdValid = (ad: number): boolean => {
  return ad > 0 && Number.isFinite(ad)
}

const inferDirection = (
  pulse: number,
  lastPulse: number
): ScannerDirection | null => {
  if (pulse > lastPulse) return 1
  if (pulse < lastPulse) return -1
  return null
}

const createCurrentScan = (
  direction: ScannerDirection,
  startTs: number,
  pulse: number,
  ad: number
): CurrentScan => ({
  direction,
  startTs,
  pulseMin: pulse,
  pulseMax: pulse,
  validCount: isAdValid(ad) ? 1 : 0,
  totalCount: 1,
  pulses: [pulse],
  ads: [ad],
})

const isCompleteByBimodal = (
  scan: CurrentScan
): {
  complete: boolean
  membranePulseMin: number | null
  membranePulseMax: number | null
} => {
  const reject = {
    complete: false,
    membranePulseMin: null,
    membranePulseMax: null,
  }
  if (scan.ads.length < 100 || scan.pulses.length < 100) return reject
  if (scan.pulseMax - scan.pulseMin < MIN_SCAN_PULSE_SPAN) return reject
  const threshold = detectBimodalThreshold(scan.ads)
  if (threshold === null) return reject

  let leadingPulse: number | null = null
  let trailingPulse: number | null = null
  for (let i = 0; i < scan.ads.length; i++) {
    if (scan.ads[i] <= threshold) {
      leadingPulse = scan.pulses[i]
      break
    }
  }
  for (let i = scan.ads.length - 1; i >= 0; i--) {
    if (scan.ads[i] <= threshold) {
      trailingPulse = scan.pulses[i]
      break
    }
  }
  if (leadingPulse === null || trailingPulse === null) return reject
  // 方向无关：正向/反向都用绝对跨度判断膜内覆盖宽度。
  if (Math.abs(trailingPulse - leadingPulse) < MIN_MEMBRANE_PULSE_SPAN)
    return reject

  return {
    complete: true,
    membranePulseMin: Math.min(leadingPulse, trailingPulse),
    membranePulseMax: Math.max(leadingPulse, trailingPulse),
  }
}

const closeCurrentScan = (scan: CurrentScan, endTs: number): ClosedScanPass => {
  const bimodal = isCompleteByBimodal(scan)
  return {
    scannerDirection: scan.direction === 1 ? 1 : 0,
    startTs: scan.startTs,
    endTs,
    pulseMin: scan.pulseMin,
    pulseMax: scan.pulseMax,
    membranePulseMin: bimodal.membranePulseMin,
    membranePulseMax: bimodal.membranePulseMax,
    validRatio: scan.totalCount > 0 ? scan.validCount / scan.totalCount : 0,
    totalCount: scan.totalCount,
    status: bimodal.complete ? 'complete' : 'rejected',
  }
}

/**
 * 扫描趟检测器
 *
 * 用法：
 * ```typescript
 * const detector = createScanPassDetector()
 * detector.feed(ts, pulse, ad) // 返回 ClosedScanPass 当扫描趟完成时
 * detector.reset()             // 丢弃当前扫描趟（ADBox reset）
 * ```
 */
export const createScanPassDetector = () => {
  let current: CurrentScan | null = null
  let lastPulse: number | null = null

  const feed = (
    ts: number,
    pulse: number,
    ad: number
  ): ClosedScanPass | null => {
    if (lastPulse === null) {
      // 首帧：需要等待下一帧才能判断方向
      lastPulse = pulse
      return null
    }

    const dir = inferDirection(pulse, lastPulse)
    lastPulse = pulse

    if (current === null) {
      if (dir !== null) {
        current = createCurrentScan(dir, ts, pulse, ad)
      }
      return null
    }

    // 脉冲方向改变 → 扫描趟结束 + 新趟开始
    if (dir !== null && dir !== current.direction) {
      const closed = closeCurrentScan(current, ts)
      current = createCurrentScan(dir, ts, pulse, ad)
      return closed
    }

    // 脉冲未变（测厚仪暂停或同位置多帧）→ 继续当前趟
    current.totalCount += 1
    if (isAdValid(ad)) current.validCount += 1
    current.pulses.push(pulse)
    current.ads.push(ad)
    if (pulse < current.pulseMin) current.pulseMin = pulse
    if (pulse > current.pulseMax) current.pulseMax = pulse
    return null
  }

  /** 强制关闭当前扫描趟（用于设备 reset 或 shutdown） */
  const close = (endTs: number): ClosedScanPass | null => {
    if (current === null) return null
    const closed = closeCurrentScan(current, endTs)
    current = null
    return closed
  }

  const reset = (): void => {
    current = null
    lastPulse = null
  }

  return { feed, close, reset }
}
