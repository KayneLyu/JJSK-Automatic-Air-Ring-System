import { join } from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

export type ConnectionProtocol = 'opcua' | 'modbus'

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

// 全局 winston logger 缓存，相同 dirPath 复用同一个 transport
const loggerCache = new Map<string, winston.Logger>()

const getOrCreateWinstonLogger = (
  dirPath: string,
  maxSize: string,
  maxFiles: string
): winston.Logger => {
  const cacheKey = dirPath
  if (loggerCache.has(cacheKey)) {
    return loggerCache.get(cacheKey)!
  }

  const transport = new DailyRotateFile({
    dirname: dirPath,
    filename: 'connection-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
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
  const maxSize = options?.maxSize || '20m'
  const maxFiles = options?.maxFiles || '30d'

  const winstonLogger = enabled
    ? getOrCreateWinstonLogger(dirPath, maxSize, maxFiles)
    : null

  const log = (payload: ConnectionLogPayload) => {
    if (!winstonLogger) return

    winstonLogger.info({
      source: options?.source,
      ...payload,
      error:
        payload.error !== undefined ? stringifyError(payload.error) : undefined,
    })
  }

  return { log, dirPath }
}
