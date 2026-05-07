import { join } from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

export type ConnectionProtocol = 'opcua' | 'modbus' | 's7'

export interface ConnectionLoggerOptions {
  /**
   * 是否启用本地日志，默认开启
   */
  enabled?: boolean
  /**
   * 日志目录，默认 `${process.cwd()}/logs`
   */
  dirPath?: string
  /**
   * 数据来源标识，例如 thickness/opcua
   */
  source?: string
  /**
   * 设备类型标识，例如 thickness / upperRotation
   */
  deviceType?: string
  /**
   * 设备名称，例如 测厚仪 / 上旋
   */
  deviceName?: string
  /**
   * 日志文件名前缀，默认 connection
   */
  filePrefix?: string
  /**
   * 日志轮转时间模式，默认按天 `YYYY-MM-DD`
   */
  datePattern?: string
  /**
   * 单个日志文件大小上限，默认 20m
   */
  maxSize?: string
  /**
   * 最多保留天数，默认 30d
   */
  maxFiles?: string
}

export interface ConnectionLogPayload {
  protocol: ConnectionProtocol
  event:
    | 'connect'
    | 'connect_error'
    | 'test_connect'
    | 'test_connect_error'
    | 'read'
    | 'subscribe'
    | 'subscribe_error'
  data?: unknown
  error?: unknown
  meta?: Record<string, unknown>
}

const stringifyError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return error
}

const normalizeFilePrefix = (filePrefix?: string) => {
  const normalized = filePrefix
    ?.trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'connection'
}

// 全局 winston logger 缓存，相同 dirPath + filePrefix 复用同一个 transport
const loggerCache = new Map<string, winston.Logger>()

const getOrCreateWinstonLogger = (
  dirPath: string,
  filePrefix: string,
  datePattern: string,
  maxSize: string,
  maxFiles: string
): winston.Logger => {
  const cacheKey = `${dirPath}:${filePrefix}:${datePattern}:${maxSize}:${maxFiles}`
  if (loggerCache.has(cacheKey)) {
    return loggerCache.get(cacheKey)!
  }

  const transport = new DailyRotateFile({
    dirname: dirPath,
    filename: `${filePrefix}-%DATE%.log`,
    datePattern,
    zippedArchive: true,
    maxSize,
    maxFiles,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  })

  const logger = winston.createLogger({
    level: 'info',
    transports: [transport],
  })

  loggerCache.set(cacheKey, logger)
  return logger
}

export const createConnectionLogger = (options?: ConnectionLoggerOptions) => {
  const enabled = options?.enabled ?? true
  const dirPath = options?.dirPath || join(process.cwd(), 'logs')
  const filePrefix = normalizeFilePrefix(options?.filePrefix)
  const datePattern = options?.datePattern || 'YYYY-MM-DD'
  const maxSize = options?.maxSize || '20m'
  const maxFiles = options?.maxFiles || '30d'

  const winstonLogger = enabled
    ? getOrCreateWinstonLogger(
        dirPath,
        filePrefix,
        datePattern,
        maxSize,
        maxFiles
      )
    : null

  const log = (payload: ConnectionLogPayload) => {
    if (!winstonLogger) return

    winstonLogger.info({
      source: options?.source,
      deviceType: options?.deviceType,
      deviceName: options?.deviceName,
      ...payload,
      error:
        payload.error !== undefined ? stringifyError(payload.error) : undefined,
    })
  }

  return { log, dirPath }
}
