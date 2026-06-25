// ============================================================
// 膜泡重建 — 热力图可视化
//
// 展示 T(x,t) 二维数据的热力图（时间-位置-厚度）。
//
// x 轴：扫描仪位置 x（或归一化位置）
// y 轴：时间 t（或扫描序号）
// 颜色：厚度值 T(x,t)
// ============================================================

import type { MeasurementTriple } from '../types'

/**
 * 将测量序列转换为 t-x 网格（用于热力图）
 *
 * @param measurements   测量序列
 * @param numX           x 方向网格数
 * @param timeGroupBy    时间分组方式：'scan' 按扫描周期分组
 * @returns { xAxis, yAxis, zMatrix }
 */
export const measurementsToHeatmapGrid = (
  measurements: MeasurementTriple[],
  numX: number = 100,
  timeGroupBy: 'auto' | 'scan' = 'auto'
): {
  xAxis: number[]
  yAxis: number[]
  zMatrix: number[][]
} => {
  if (measurements.length === 0) {
    return { xAxis: [], yAxis: [], zMatrix: [] }
  }

  // x 轴：归一化位置 [0, 1]
  const xAxis = Array.from({ length: numX }, (_, i) => i / (numX - 1))

  // 确定最大 x 值用于归一化
  let maxX = 0
  for (const m of measurements) {
    if (m.scannerPosMm > maxX) maxX = m.scannerPosMm
  }
  if (maxX === 0) maxX = 1

  // 时间分组
  // 简化：按扫描周期自然分组（基于 scannerPosMm 回零检测）
  const scanGroups: MeasurementTriple[][] = []
  let currentGroup: MeasurementTriple[] = []
  let prevPos = -1

  for (const m of measurements) {
    const normX = m.scannerPosMm / maxX
    if (prevPos >= 0 && normX < prevPos - 0.05) {
      // 检测到位置归零 → 新扫描开始
      if (currentGroup.length > 0) {
        scanGroups.push(currentGroup)
        currentGroup = []
      }
    }
    currentGroup.push(m)
    prevPos = normX
  }
  if (currentGroup.length > 0) scanGroups.push(currentGroup)

  // y 轴：扫描序号
  const numScans = scanGroups.length
  const yAxis = Array.from({ length: numScans }, (_, i) => i)

  // z 矩阵 [numScans × numX]
  const zMatrix: number[][] = Array.from({ length: numScans }, () =>
    new Array<number>(numX).fill(NaN)
  )

  for (let scanIdx = 0; scanIdx < numScans; scanIdx++) {
    const scan = scanGroups[scanIdx]
    for (const m of scan) {
      const xIdx = Math.min(numX - 1, Math.round((m.scannerPosMm / maxX) * (numX - 1)))
      zMatrix[scanIdx][xIdx] = m.thickness
    }
  }

  return { xAxis, yAxis, zMatrix }
}

/**
 * 生成 ASCII 热力图
 */
export const renderAsciiHeatmap = (
  measurements: MeasurementTriple[],
  maxWidth: number = 80,
  maxHeight: number = 30
): string => {
  const { zMatrix } = measurementsToHeatmapGrid(measurements, maxWidth)

  if (zMatrix.length === 0) return '(No data)'

  // 找出全局面板范围
  let globalMin = Infinity
  let globalMax = -Infinity
  for (const row of zMatrix) {
    for (const v of row) {
      if (!isNaN(v)) {
        if (v < globalMin) globalMin = v
        if (v > globalMax) globalMax = v
      }
    }
  }
  const range = globalMax - globalMin || 1

  // 下采样高度
  const step = Math.max(1, Math.ceil(zMatrix.length / maxHeight))
  const chars = ' .:-=+*#%@'

  let output = `T(x,t) 热力图: range [${globalMin.toFixed(1)}, ${globalMax.toFixed(1)}] μm\n`
  for (let r = 0; r < zMatrix.length; r += step) {
    let line = ''
    const row = zMatrix[r]
    for (let c = 0; c < row.length; c++) {
      if (isNaN(row[c])) {
        line += ' '
      } else {
        const idx = Math.min(9, Math.floor(((row[c] - globalMin) / range) * 10))
        line += chars[idx]
      }
    }
    output += line + '\n'
  }

  return output
}

/**
 * 生成 HTML 热力图（使用内联 canvas 或 SVG）
 */
export const renderHtmlHeatmap = (
  measurements: MeasurementTriple[],
  elementId: string = 'heatmap'
): string => {
  const { xAxis, yAxis, zMatrix } = measurementsToHeatmapGrid(measurements, 200)
  if (zMatrix.length === 0) return ''

  let globalMin = Infinity
  let globalMax = -Infinity
  for (const row of zMatrix) {
    for (const v of row) {
      if (!isNaN(v)) {
        if (v < globalMin) globalMin = v
        if (v > globalMax) globalMax = v
      }
    }
  }
  const range = globalMax - globalMin || 1

  const width = 600
  const height = 400
  const cellW = width / xAxis.length
  const cellH = height / zMatrix.length

  let svg = `<svg id="${elementId}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">\n`

  for (let r = 0; r < zMatrix.length; r++) {
    for (let c = 0; c < zMatrix[r].length; c++) {
      const v = zMatrix[r][c]
      if (isNaN(v)) continue
      const t = (v - globalMin) / range
      // 蓝(冷)-白-红(热) 颜色映射
      let r_col: number, g: number, b_col: number
      if (t < 0.5) {
        const s = t * 2
        r_col = Math.round(30 + s * 200)
        g = Math.round(100 + s * 155)
        b_col = Math.round(200 - s * 100)
      } else {
        const s = (t - 0.5) * 2
        r_col = Math.round(230 + s * 25)
        g = Math.round(255 - s * 155)
        b_col = Math.round(100 - s * 80)
      }
      const color = `rgb(${r_col},${g},${b_col})`
      svg += `<rect x="${(c * cellW).toFixed(1)}" y="${(r * cellH).toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${color}"/>\n`
    }
  }

  svg += '</svg>'
  return svg
}

/**
 * 导出 CSV 格式的测量数据
 */
export const exportMeasurementsCsv = (measurements: MeasurementTriple[]): string => {
  return 'time_idx,upperAngle_deg,scannerPos_mm,thickness_um\n' +
    measurements.map((m, i) => `${i},${m.upperAngleDeg.toFixed(2)},${m.scannerPosMm.toFixed(2)},${m.thickness.toFixed(2)}`).join('\n')
}
