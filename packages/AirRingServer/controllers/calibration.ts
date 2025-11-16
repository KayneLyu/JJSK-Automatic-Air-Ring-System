/**
 * 数据标定
 * */
import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { CalibrationConfig } from './types'
import { getCircumference } from '../utils'
import {
  computeTractionSpeedSmooth,
  extractScanSegments,
  ScanSegment,
} from './common/thickness'
import { inferMaxAngle } from './common/upperRotation'
import { findSignificantDip } from '../utils/thickness'

export type CalibrateOptions = {
  thicknessData: ThickNessData[]
  ringData: RingData[]
  config: CalibrationConfig
  /**
   * 开始扰动时间戳
   * */
  disturbanceTs: number
}

export type CalibrateResult = {
  /**
   * 膜的牵引速度 单位：mm/s
   * */
  tractionSpeed?: number
  /**
   * 上旋人字架到测厚仪的距离 单位：mm
   * */
  distance?: number
  /**
   * 上旋人字架最大旋转角度
   * */
  maxAngle?: number
}

/**
 * 标定，用于设备特征标定
 * */
export const calibrate = ({
  thicknessData,
  ringData,
  config,
  disturbanceTs,
}: CalibrateOptions): CalibrateResult | null => {
  const {
    standardized: { CHANNEL_COUNT, roller },
    roller: { numCycles = 3, maxIntervalMs = 10_000 },
    upperRotation: { deltaRange: { min = 180, max = 359, step = 1 } = {} },
  } = config
  const deltaRange = { min, max, step }
  // ---------- Step 1: 计算牵引速度 ----------
  const circumference = getCircumference(roller)
  const v = computeTractionSpeedSmooth(
    thicknessData,
    circumference,
    numCycles,
    maxIntervalMs
  )
  if (v === null || v <= 0) {
    /* 无法计算牵引速度 */
    return null
  }

  // ---------- Step 2: 提取测厚仪有效扫描段 ----------
  const segments = extractScanSegments(thicknessData)
  if (segments.length === 0) {
    /* 无法提取有效扫描数据 */
    return {
      tractionSpeed: v,
    }
  }

  const latestScan = segments[segments.length - 1]

  // ---------- Step 3: 推测上旋人字架最大旋转角度 ----------
  const maxAngle = inferMaxAngle({
    CHANNEL_COUNT,
    ringData,
    deltaRange,
    latestScan,
  })
  if (!maxAngle) {
    /* 无法上旋计算最大旋转角度 */
    return {
      tractionSpeed: v,
    }
  }
  // ---------- Step 4: 检测厚度凹陷 ----------
  let responseSeg: ScanSegment | null = null

  for (const seg of segments) {
    const dip = findSignificantDip(seg)
    if (dip.found) {
      responseSeg = seg
      break
    }
  }
  if (!responseSeg) {
    /* 未检测到有效扰动响应 */
    return {
      tractionSpeed: v,
      maxAngle,
    }
  }
  // ---------- Step 5: 计算上旋人字架到测厚仪的距离 ----------
  const tau_ms = responseSeg.startTime - disturbanceTs
  const distance = v * (tau_ms / 1000)
  return {
    tractionSpeed: v,
    maxAngle,
    distance,
  }
}
