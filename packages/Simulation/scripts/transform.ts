import { createReadStream, createWriteStream, writeFileSync } from 'node:fs'
import { parseStream } from '@fast-csv/parse'
import { ThicknessDevice, UpperRotationDevice } from '@jjsk/core'
import * as echarts from 'echarts'
import { createCanvas } from 'canvas'

const transform = () => {
  const tws = createWriteStream('thickness.json')
  const uws = createWriteStream('upper.json')
  const iws = createWriteStream('info.json')
  const list: (ThicknessDevice & { timestamp: number })[] = []
  const list2: (UpperRotationDevice & { timestamp: number })[] = []

  const rs = createReadStream('data.csv')
  let min = Infinity
  let max = -Infinity
  parseStream(rs, { headers: true })
    .on('data', (data: any) => {
      const angle = Number(data.angleOfRotation)
      if (angle < min) {
        min = angle
      }
      if (angle > max) {
        max = angle
      }
      list.push({
        HorizontalPulse: Number(data.position),
        LeftLimit: false,
        RightLimit: false,
        ResetSignal: false,
        SwapDirection: false,
        MotionDirection: false,
        ProbeValue: Number(data.AD),
        timestamp: Number(data.ts),
      })
      list2.push({
        ForwardRotation: Number(data.isRotationCW) === 1,
        ReverseRotation: Number(data.isRotationCW) === 0,
        ForwardDirectionChange: false,
        ReverseDirectionChange: false,
        Reset: false,
        MotorFrequency: 0,
        timestamp: Number(data.ts),
      })
    })
    .on('end', () => {
      // const groups = groupScans(list)
      // for (let i = 0; i < groups.length; i++) {
      //   const options = {
      //     title: {
      //       text: `Scan ${i}`,
      //     },
      //     xAxis: {
      //       type: 'time',
      //       data: groups[i].map((d) => d.t),
      //     },
      //     yAxis: {
      //       type: 'value',
      //     },
      //     series: [
      //       {
      //         data: groups[i].map((d) => d.y),
      //         type: 'line',
      //       },
      //     ],
      //   }
      //   const buffer = renderChartToBuffer(options)
      //   writeFileSync(`./scans/${i}.png`, buffer, {})
      // }
      tws.write(JSON.stringify(list))
      uws.write(JSON.stringify(list2))
      iws.write(JSON.stringify({ angle: max - min }))
    })
}

export type ThicknessData = ThicknessDevice & { timestamp?: number }
export type ScanGroup = Array<{ t: number; y: number }>

export const groupScans = (data: ThicknessData[]): ScanGroup[] => {
  const groups: ThicknessData[][] = []
  const min = data.reduce((acc, cur) => {
    if (cur.ProbeValue! < acc) {
      return cur.ProbeValue!
    }
    return acc
  }, Infinity)
  const max = min + 2000
  let current: ThicknessData[] = []
  let preSignal: boolean | null = null
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    if (d.timestamp && d.ProbeValue) {
      const currentSignal = d.ProbeValue! <= max
      if (currentSignal !== preSignal && currentSignal) {
        groups.push(current)
        current = []
      }
      if (currentSignal) {
        current.push(d)
      }
      preSignal = currentSignal
    }
  }
  return groups
    .filter((d) => d.length > 10)
    .map((d) => {
      return d.map((d) => {
        return {
          t: d.timestamp!,
          y: d.ProbeValue! - min,
        }
      })
    })
}
const renderChartToBuffer = (option: any, width = 800, height = 600) => {
  // 1. 创建一个指定大小的Canvas
  const canvas = createCanvas(width, height)
  // 2. 使用该Canvas初始化ECharts实例
  // 注意：这里传入了node-canvas创建的canvas对象
  const chart = echarts.init(canvas as any)
  // 3. 设置图表配置项
  chart.setOption(option)
  // 4. 将Canvas转换为图片Buffer（如PNG格式）
  const buffer = canvas.toBuffer('image/png')
  // 5. 释放图表实例资源
  chart.dispose()
  return buffer
}
transform()
