/**
 * 数据标定
 * */
import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { CalibrationConfig, Scalar } from './types'
import { getCircumference } from '@jjsk/core'
import {
  computeTractionSpeedSmooth,
  extractScanSegments,
  findSignificantDip,
} from './common/thickness'
import { inferMaxAngle } from './common/upperRotation'

export type CalibrateOptions = {
  thicknessData: ThickNessData[]
  ringData: RingData[]
  standardized: Scalar
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
  /**
   * 膜宽 单位：mm
   * */
  membraneWidth?: number
}

/**
 * 标定，用于设备特征标定
 * */
export const calibrate = ({
  thicknessData,
  ringData,
  config,
  disturbanceTs,
  standardized,
}: CalibrateOptions): CalibrateResult | null => {
  const { CHANNEL_COUNT, ROLLER } = standardized
  const {
    roller: { numCycles = 10, maxIntervalMs = 10_000 },
    upperRotation: { deltaRange: { min = 180, max = 359, step = 1 } = {} },
  } = config
  const deltaRange = { min, max, step }
  // ---------- Step 1: 计算牵引速度 ----------
  const circumference = getCircumference(ROLLER)
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
  // ---------- Step 2: 检测厚度凹陷 ----------
  const dip = findSignificantDip(thicknessData)
  if (dip === null) {
    /* 未检测到有效扰动响应 */
    return {
      tractionSpeed: v,
    }
  }
  // ---------- Step 3: 计算上旋人字架到测厚仪的距离 ----------
  const tau_ms = dip.timestamp! - disturbanceTs

  const distance = v * (tau_ms / 1000)

  // ---------- Step 4: 提取测厚仪有效扫描段 ----------
  const segments = extractScanSegments(thicknessData)
  if (segments.length === 0) {
    /* 无法提取有效扫描数据 */
    return {
      tractionSpeed: v,
      distance,
    }
  }

  const latestScan = segments[segments.length - 1]

  // ---------- Step 5: 推测上旋人字架最大旋转角度 ----------
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
      distance,
    }
  }

  return {
    tractionSpeed: v,
    maxAngle,
    distance,
  }
}
