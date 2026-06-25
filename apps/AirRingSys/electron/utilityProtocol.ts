/**
 * utilityProcess 通信协议定义
 *
 * 主进程与 utilityProcess 之间通过 postMessage 传递结构化消息。
 * utilityProcess 承载全部 CPU 密集型与 I/O 阻塞型业务逻辑，
 * 主进程仅保留窗口管理、设备 TCP 连接、IPC 路由与实时运动控制。
 */

import type { PushData } from '@jjsk/adbox-sdk'
import type { IUpperRotationDebugData, ICalibrationResult } from '@/types/ipc'

// ═══════════════════════════════════════════════════════════════
// 主进程 → utilityProcess
// ═══════════════════════════════════════════════════════════════

export type MainToUtilityMsg =
  | { type: 'init'; payload: InitPayload }
  | { type: 'shutdown' }
  | { type: 'thickness-push'; push: PushData; receivedAt: number }
  | { type: 'rotation-data'; data: IUpperRotationDebugData }
  | { type: 'ipc-request'; id: string; channel: string; args: unknown[] }

export interface InitPayload {
  dbDir: string
  maxPulse: number
  margin: number
  config: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// utilityProcess → 主进程
// ═══════════════════════════════════════════════════════════════

export type UtilityToMainMsg =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'renderer-send'; channel: string; data: unknown }
  | { type: 'calibration-result'; result: ICalibrationResult }
  | { type: 'motion-state'; state: string }
  | { type: 'scan-range-updated'; payload: { maxPulse: number; webWidth: number; margin: number } }
  | { type: 'config-updated'; payload: Record<string, unknown> }
  | { type: 'ipc-response'; id: string; result?: unknown; error?: string }
  | { type: 'pipeline-stats'; stats: unknown }

// ═══════════════════════════════════════════════════════════════
// 内部 IPC 请求处理（utility 侧）
// ═══════════════════════════════════════════════════════════════

export type IpcRequestHandler = (args: unknown[]) => Promise<unknown> | unknown
