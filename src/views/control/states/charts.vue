<template>
  <div class="canvas-wrapper">
    <canvas ref="canvasRef" :width="200" :height="200"></canvas>
    <div class="info">
      <div><span>{{ storePollingData.apiThickData.CurrRotatePosition }}</span>°</div>
      <div class="info_thick"><span>{{ storePollingData.apiThickData.CurrThk }}</span></div> um
      <div v-if="storePollingData.apiThickData.IsWaitThkStabilize ">
        <p class="time_left">{{ storePollingData.apiThickData.WaitThkSurplusSec }} (s)</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useApiDataStore } from '@/store/polling-data';

const storePollingData = useApiDataStore()
// 缩小倍数
const scale = 70 / storePollingData.apiThickData.RailwayRadius

const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let animationId = 0

// 画布中心
const cx = 100
const cy = 100

// 膜泡 & 轨道参数

const trackRadius = 70

// 探头参数
const probeBaseLen = 0
let extendDir = 1

let angle = 0
let probeExtend = 10


/**
* 工程角度（度）
* 0° = 正上
* 顺时针为正
*/
function degToCanvasRad(deg: number) {
  return (deg - 90) * Math.PI / 180
}

function drawBubble() {
  if (!ctx) return
  const bubbleRadius = scale * storePollingData.apiThickData.CurrBubbleShape
  ctx.beginPath()
  ctx.arc(cx, cy, bubbleRadius, 0, Math.PI * 2)
  ctx.strokeStyle = '#0f8'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawTrack() {
  if (!ctx) return
  ctx.beginPath()
  ctx.arc(cx, cy, trackRadius, 0, Math.PI * 2)
  ctx.strokeStyle = 'gray'
  ctx.setLineDash([6, 6])
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.setLineDash([])
}

function drawCar(theta: number) {
  if (!ctx) return

  const carWidth = 24
  const carHeight = 16

  const a = degToCanvasRad(theta)
  const x = cx + trackRadius * Math.cos(a)
  const y = cy + trackRadius * Math.sin(a)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)

  ctx.fillStyle = '#888'
  ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight)

  ctx.restore()
}

function drawProbe(theta: number, extend: number) {
  if (!ctx) return

  const a = degToCanvasRad(theta)
  const baseX = cx + trackRadius * Math.cos(a)
  const baseY = cy + trackRadius * Math.sin(a)

  const len = probeBaseLen + extend
  const tipX = baseX - len * Math.cos(a)
  const tipY = baseY - len * Math.sin(a)

  // 探头杆
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.lineTo(tipX, tipY)
  ctx.strokeStyle = '#f55'
  ctx.lineWidth = 3
  ctx.stroke()

  // 探头头部
  ctx.beginPath()
  ctx.arc(tipX, tipY, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#f00'
  ctx.fill()
}

function update() {
  if (!ctx) return

  ctx.clearRect(0, 0, 700, 700)

  drawTrack()
  drawBubble()
  drawCar(angle)
  drawProbe(angle, probeExtend)

  angle = storePollingData.apiThickData.CurrRotatePosition

  // 探头伸缩（可启用）
  // probeExtend += extendDir * 1
  probeExtend = storePollingData.apiThickData.CurrStretchPosition * scale
  if (probeExtend > 50 || probeExtend < 20) {
    extendDir *= -1
  }

  animationId = requestAnimationFrame(update)
}

onMounted(() => {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d')
  update()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
})
</script>

<style scoped>
.canvas-wrapper {
  position: relative;
  display: flex;
  justify-content: left;
  align-items: center;
  width: 100%;
  height: 100%;
}

canvas {}

.info {
  position: absolute;
  left: 25%;
  width: 100px;
  text-align: center;
  font-weight: 700;

  span {
    font-size: 16px;
  }
}

.info_thick {
  margin-top: 12px;

  span {
    background-color: #f55;
    padding: 3px;
    border-radius: 5px;
    color: #fff;
  }
}

.time_left {
  font-size: 12px;
  width: 40px;
  margin: 0 auto;
  margin-top: 5px;
  background-color: #ffb11590;
}
</style>