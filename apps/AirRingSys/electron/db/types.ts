/**
 * 数据库行类型定义
 *
 * 与 Drizzle schema 一致的手写接口，用于查询结果类型标注。
 */

/** rotation_raw 表行 */
export interface RotationRawRow {
  id: number
  /** 时间戳 (ms) */
  timestamp: number
  /** 正向旋转信号 */
  forwardRotation: number
  /** 反向旋转信号 */
  reverseRotation: number
  /** 电机频率 (Hz) */
  motorFrequency: number
  /** 正向换向触发 */
  forwardDirChange: number
  /** 反向换向触发 */
  reverseDirChange: number
  /** 复位信号 */
  reset: number
  /** 风环热量 JSON */
  heats: string
}

/** thickness_raw 表行 */
export interface ThicknessRawRow {
  id: number
  /** 时间戳 (ms) */
  timestamp: number
  /** 横向脉冲计数 */
  pulse: number
  /** AD 值（光通量） */
  ad: number
  /** 数据来源：adbox | opcua | modbus | file */
  source: string
  /** 空载基准 AD */
  airAD: number
  /** 标定增益 */
  gain: number
}

/** air_ring_raw 表行 */
export interface AirRingRawRow {
  id: number
  /** 时间戳 (ms) */
  timestamp: number
  pct: number
  open: number
}

/** frame 表行（扫描趟统计导出） */
export interface FrameRow {
  frameId: number
  startTime: string
  endTime: string
  startTimestamp: number
  endTimestamp: number
  speed: number
  width: number
  rotateSpeed: number
  /** 2σ 统计值 */
  sigmaVal: number
  /** 2σ 百分比 */
  sigmaPercent: number
  /** AD 均值 */
  mean: number
  /** AD 最小值 */
  minVal: number
  /** 最小值偏差百分比 */
  minPercent: number
  /** AD 最大值 */
  maxVal: number
  /** 最大值偏差百分比 */
  maxPercent: number
  /** 是否为反向扫描 */
  IsBackw: number
  /** AD 值 JSON 数组 */
  datalist: string
  /** AD 值 JSON 数组（原始） */
  rawDatalist: string
  source: string
  airAD: number
  gain: number
}
