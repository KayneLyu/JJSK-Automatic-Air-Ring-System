// ============================================================
// 膜泡重建 — 极坐标图
//
// 在极坐标系中绘制膜泡厚度分布 B(φ)，
// 用于直观展示圆周方向的厚度变化。
// ============================================================

/**
 * 生成极坐标图的 ASCII 文本表示
 *
 * @param profile 膜泡厚度分布 B[0..N-1]
 * @param width   输出宽度（字符）
 * @param height  输出高度（字符）
 * @returns ASCII 文本
 */
export const renderAsciiPolar = (
  profile: number[],
  width: number = 60,
  height: number = 30
): string => {
  const N = profile.length
  const maxVal = Math.max(...profile)
  const minVal = Math.min(...profile)
  const range = maxVal - minVal || 1

  const grid: string[][] = Array.from({ length: height }, () =>
    new Array<string>(width).fill(' ')
  )

  const cx = width / 2
  const cy = height / 2
  const rMax = Math.min(cx, cy) - 1

  // 绘制基准圆
  for (let angle = 0; angle < 360; angle += 5) {
    const rad = (angle * Math.PI) / 180
    const x = Math.round(cx + rMax * Math.cos(rad))
    const y = Math.round(cy - rMax * Math.sin(rad))
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y][x] = '.'
    }
  }

  // 绘制厚度分布
  const chars = ' ▁▂▃▄▅▆▇█'
  for (let i = 0; i < N; i++) {
    const normalizedVal = (profile[i] - minVal) / range
    const r = rMax * (0.3 + 0.7 * normalizedVal)
    const angle = (i * 2 * Math.PI) / N
    const x = Math.round(cx + r * Math.cos(angle))
    const y = Math.round(cy - r * Math.sin(angle))

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const charIdx = Math.min(8, Math.floor(normalizedVal * 9))
      grid[y][x] = chars[charIdx]
    }
  }

  // 标注圆心和角度
  if (0 <= cy && cy < height && 0 <= cx && cx < width) {
    grid[Math.floor(cy)][Math.floor(cx)] = '+'
  }

  const header = `B(φ) 极坐标: range [${minVal.toFixed(1)}, ${maxVal.toFixed(1)}] μm\n`
  const lines = grid.map((row) => row.join(''))
  return header + lines.join('\n')
}

/**
 * 简单极坐标 SVG 生成（HTML 片段）
 *
 * 可用于 Web 界面渲染。
 */
export const renderSvgPolar = (
  profile: number[],
  size: number = 400
): string => {
  const N = profile.length
  const maxVal = Math.max(...profile)
  const minVal = Math.min(...profile)
  const range = maxVal - minVal || 1
  const cx = size / 2
  const cy = size / 2
  const rMax = size / 2 - 20

  let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">\n`

  // 同心圆
  for (let r = 0.2; r <= 1.0; r += 0.2) {
    const radius = r * rMax
    svg += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#ccc" stroke-width="0.5"/>\n`
  }

  // 辐射线
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180
    const x2 = cx + rMax * Math.cos(rad)
    const y2 = cy - rMax * Math.sin(rad)
    svg += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#ddd" stroke-width="0.5"/>\n`
  }

  // 厚度多边形
  let pathD = ''
  for (let i = 0; i < N; i++) {
    const normalizedVal = (profile[i] - minVal) / range
    const r = rMax * (0.2 + 0.8 * normalizedVal)
    const angle = (i * 360) / N
    const rad = (angle * Math.PI) / 180
    const x = cx + r * Math.cos(rad)
    const y = cy - r * Math.sin(rad)
    pathD += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`
  }
  pathD += ' Z'

  const intensity = Math.round(255 * (1 - 0.3))
  svg += `<path d="${pathD}" fill="rgba(0,120,200,0.3)" stroke="rgb(0,80,160)" stroke-width="1.5"/>\n`

  // 标签
  svg += `<text x="${cx}" y="${size - 5}" text-anchor="middle" font-size="12" fill="#666">Max: ${maxVal.toFixed(1)} Min: ${minVal.toFixed(1)} μm</text>\n`
  svg += '</svg>'
  return svg
}

/**
 * 数据导出为 CSV
 */
export const exportProfileCsv = (profile: number[]): string => {
  return `angle_deg,thickness_um\n${profile.map((val, i) => `${i},${val.toFixed(2)}`).join('\n')}`
}

/**
 * 统计信息
 */
export const profileStats = (profile: number[]) => {
  const N = profile.length
  const mean = profile.reduce((a, b) => a + b, 0) / N
  const sorted = [...profile].sort((a, b) => a - b)
  const median = sorted[Math.floor(N / 2)]
  let variance = 0
  for (const v of profile) variance += (v - mean) ** 2
  const stdDev = Math.sqrt(variance / N)
  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[N - 1] * 100) / 100,
    range: Math.round((sorted[N - 1] - sorted[0]) * 100) / 100,
  }
}
