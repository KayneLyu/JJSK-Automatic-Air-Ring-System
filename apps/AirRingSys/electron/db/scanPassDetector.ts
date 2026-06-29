/**
 * 测厚仪扫描趟实时检测器
 *
 * 基于横向脉冲位置（pos0/pulse）的方向变化，实时识别每次扫描趟的
 * 起止边界。与现有的 6-CTE SQL 事后检测逻辑等价，但运行在数据接收
 * 路径上，无需等待 flush 或事后扫描。
 *
 * 方向约定：
 * - scannerDirection = 0: 反向扫描（脉冲递减）
 * - scannerDirection = 1: 正向扫描（脉冲递增）
 *
 * 物理背景：
 * - 测厚仪约 30 秒完成一次往返扫描，期间 ADBox 约产生 30,000 帧
 * - 扫描换向时 pos0 变化方向反转（递增 ↔ 递减）
 */

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
}

/** 一个已完成的扫描趟 */
export interface ClosedScanPass {
  /** 扫描方向：0 = 反向，1 = 正向 */
  scannerDirection: 0 | 1
  /** 起始时间戳 (ms) */
  startTs: number
  /** 结束时间戳 (ms) */
  endTs: number
  /** 该趟最小 pulse */
  pulseMin: number
  /** 该趟最大 pulse */
  pulseMax: number
  /** 有效测点占比 (0-1) */
  validRatio: number
  /** 总采样点数 */
  totalCount: number
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
})

const closeCurrentScan = (scan: CurrentScan, endTs: number): ClosedScanPass => ({
  scannerDirection: scan.direction === 1 ? 1 : 0,
  startTs: scan.startTs,
  endTs,
  pulseMin: scan.pulseMin,
  pulseMax: scan.pulseMax,
  validRatio: scan.totalCount > 0 ? scan.validCount / scan.totalCount : 0,
  totalCount: scan.totalCount,
})

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
