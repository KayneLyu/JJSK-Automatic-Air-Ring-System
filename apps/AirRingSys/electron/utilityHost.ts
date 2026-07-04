/**
 * utilityHost — 主进程侧 utilityProcess 管理器
 *
 * 负责：
 *   1. fork utilityProcess 子进程
 *   2. 建立主进程 ↔ utilityProcess 的双向消息通道
 *   3. 上游代理：将 ADBox 数据 / S7 数据 / 渲染进程 IPC 请求转发到 utility
 *   4. 下游代理：将 utility 的响应 (渲染推送 / 标定结果 / IPC 回复) 回传给主进程
 *
 * 生命周期：
 *   - init(): 启动 utilityProcess，等待 ready 信号后 resolve
 *   - destroy(): 通知 shutdown 并等待子进程退出
 */

import { utilityProcess, app } from 'electron'
import { join } from 'node:path'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IUpperRotationDebugData } from '@/types/ipc'
import type { MainToUtilityMsg, UtilityToMainMsg, InitPayload } from './utilityProtocol'

export type { MainToUtilityMsg, UtilityToMainMsg }

// ═══════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════

export interface UtilityHostOptions {
  /** 数据库目录 */
  dbDir: string
  /** 最大脉冲数 */
  maxPulse: number
  /** 边界余量 */
  margin: number
  /** 应用配置对象 */
  config: Record<string, unknown>
}

export type RendererSendFn = (channel: string, data: unknown) => void
export type OnIpcRequestFn = (channel: string, ...args: unknown[]) => Promise<unknown>

export interface UtilityHostCallbacks {
  /** 当 utility 需要向渲染进程发送消息时 */
  onRendererSend: RendererSendFn
  /** 当 utility 推送标定结果时 */
  onCalibrationResult?: (result: unknown) => void
  /** 当 utility 推送状态时 */
  onMotionState?: (state: string) => void
  /** 当 utility 推送扫描仪控制动作时 */
  onScannerAction?: (action: string, state: string, log: string | null, debug?: { pulse?: number; probeValue?: number; inMembrane?: boolean; direction?: 'FWD' | 'REV' }) => void
  /** 当 utility 报告错误时 */
  onError?: (message: string) => void
  /** 当 utility 就绪时 */
  onReady?: () => void
}

// ═══════════════════════════════════════════════════════════════
// IPC 代理：将渲染进程的 ipcMain.handle 请求转发到 utility
// ═══════════════════════════════════════════════════════════════

/** 待处理的 IPC 请求 Promise resolver */
interface PendingIpcRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

const IPC_REQUEST_TIMEOUT_MS = 60_000 // 1 分钟超时（历史数据回放可能较慢）

// ═══════════════════════════════════════════════════════════════

export class UtilityHost {
  private child: Electron.UtilityProcess | null = null
  private ready = false
  private callbacks: UtilityHostCallbacks
  private pendingRequests = new Map<string, PendingIpcRequest>()
  private requestIdCounter = 0

  constructor(callbacks: UtilityHostCallbacks) {
    this.callbacks = callbacks
  }

  // ══ 生命周期 ══

  async init(options: UtilityHostOptions): Promise<void> {
    if (this.child) {
      console.warn('[UtilityHost] utilityProcess 已在运行')
      return
    }

    const workerPath = join(app.getAppPath(), 'dist-electron', 'utilityWorker.js')

    console.log('[UtilityHost] 启动 utilityProcess:', workerPath)

    return new Promise((resolve, reject) => {
      try {
        this.child = utilityProcess.fork(workerPath, [], {
          serviceName: 'Data Processing Worker',
        })
      } catch (err) {
        console.error('[UtilityHost] utilityProcess 创建失败:', err)
        reject(err)
        return
      }

      let processReady = false
      let internalReady = false

      const readyTimeout = setTimeout(() => {
        reject(new Error('[UtilityHost] utilityProcess 初始化超时 (60s)'))
      }, 60_000)

      this.child.on('message', (msg: UtilityToMainMsg) => {
        // 第一阶段：进程启动就绪
        if (msg.type === 'ready' && !processReady) {
          processReady = true
          console.log('[UtilityHost] utilityProcess 进程就绪，发送初始化参数...')

          // 发送初始化参数给 utility
          this.send({
            type: 'init',
            payload: {
              dbDir: options.dbDir,
              maxPulse: options.maxPulse,
              margin: options.margin,
              config: options.config,
            } satisfies InitPayload,
          })
          return
        }

        // 第二阶段：内部初始化（DataPipeline / SQLite / CalibrationBridge）完成
        if (msg.type === 'ready' && processReady) {
          internalReady = true
          this.ready = true
          clearTimeout(readyTimeout)
          console.log('[UtilityHost] utilityProcess 内部初始化完成')
          resolve()
          return
        }

        this.handleMessage(msg)
      })

      this.child.on('exit', (code) => {
        this.ready = false
        console.error(`[UtilityHost] utilityProcess 退出，code=${code}`)
        if (!internalReady) {
          clearTimeout(readyTimeout)
          reject(new Error(`utilityProcess 在初始化完成前退出，code=${code}`))
        }
        this.callbacks.onError?.(`utilityProcess 异常退出，code=${code}`)
        this.rejectAllPending(new Error('utilityProcess 已退出'))
      })
    })
  }

  destroy(): void {
    if (!this.child) return

    console.log('[UtilityHost] 关闭 utilityProcess')
    this.rejectAllPending(new Error('utilityProcess 正在关闭'))

    try {
      this.send({ type: 'shutdown' })
    } catch {
      // 可能已退出
    }

    setTimeout(() => {
      try {
        this.child?.kill()
      } catch {
        // 可能已退出
      }
      this.child = null
      this.ready = false
    }, 2000)
  }

  // ══ 消息发送 ══

  /** 向 utility 发送消息 */
  send(msg: MainToUtilityMsg): void {
    if (!this.child) {
      console.warn('[UtilityHost] utilityProcess 未启动，消息丢弃:', msg.type)
      return
    }
    this.child.postMessage(msg)
  }

  /** 推送 ADBox 测厚数据到 utility */
  pushThickness(push: PushData, receivedAt: number): void {
    this.send({ type: 'thickness-push', push, receivedAt })
  }

  /** 推送上旋/风环数据到 utility */
  pushRotation(data: IUpperRotationDebugData): void {
    this.send({ type: 'rotation-data', data })
  }

  /** 开启扫描仪运动控制 */
  enableScannerMotion(airAD?: number, toleranceMs?: number): void {
    this.send({ type: 'enable-scanner-motion', airAD, toleranceMs })
  }

  /** 停止扫描仪运动控制 */
  disableScannerMotion(): void {
    this.send({ type: 'disable-scanner-motion' })
  }

  /** 向 utility 发起 IPC 请求并等待响应 */
  async ipcRequest(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!this.child || !this.ready) {
      throw new Error('utilityProcess 未就绪')
    }

    const id = `ipc-${++this.requestIdCounter}-${Date.now()}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`IPC 请求超时: ${channel}`))
      }, IPC_REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.send({ type: 'ipc-request', id, channel, args })
    })
  }

  get isReady(): boolean {
    return this.ready
  }

  // ══ 内部方法 ══

  private handleMessage(msg: UtilityToMainMsg): void {
    switch (msg.type) {
      case 'ready':
        this.callbacks.onReady?.()
        break

      case 'error':
        console.error('[UtilityHost] utility 报告错误:', msg.message)
        this.callbacks.onError?.(msg.message)
        break

      case 'renderer-send':
        this.callbacks.onRendererSend(msg.channel, msg.data)
        break

      case 'calibration-result':
        this.callbacks.onCalibrationResult?.(msg.result)
        break

      case 'motion-state':
        this.callbacks.onMotionState?.(msg.state)
        break

      case 'config-updated':
      case 'scan-range-updated':
        // 这些事件也转发到渲染进程
        this.callbacks.onRendererSend(msg.type, msg.payload)
        break

      case 'pipeline-stats':
        this.callbacks.onRendererSend('pipeline-stats', msg.stats)
        break

      case 'scanner-action':
        this.callbacks.onScannerAction?.(
          msg.action,
          msg.state,
          msg.log,
          { pulse: msg.pulse, probeValue: msg.probeValue, inMembrane: msg.inMembrane, direction: msg.direction }
        )
        break

      case 'ipc-response': {
        const pending = this.pendingRequests.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(msg.id)
          if (msg.error) {
            pending.reject(new Error(msg.error))
          } else {
            pending.resolve(msg.result)
          }
        }
        break
      }

      default:
        console.warn('[UtilityHost] 未知 utility 消息:', (msg as { type: string }).type)
    }
  }

  private rejectAllPending(reason: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pendingRequests.clear()
  }
}
