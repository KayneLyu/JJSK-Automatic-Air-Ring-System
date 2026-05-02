import type { App } from 'electron'
import { mkdirSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspect } from 'node:util'

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

type ConsoleMethod = (...args: unknown[]) => void

const CONSOLE_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug']

const formatConsoleArg = (value: unknown) => {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  return inspect(value, {
    depth: 6,
    breakLength: Infinity,
    maxArrayLength: 200,
    compact: false,
  })
}

const getLogFilePath = (dirPath: string, now: Date) => {
  const date = now.toISOString().slice(0, 10)
  return join(dirPath, `main-console-${date}.log`)
}

export const setupConsoleFileLogger = (app: App) => {
  const dirPath = join(app.getPath('userData'), 'logs', 'main-console')
  mkdirSync(dirPath, { recursive: true })

  const originalConsole = Object.fromEntries(
    CONSOLE_LEVELS.map((level) => [level, console[level].bind(console)])
  ) as Record<ConsoleLevel, ConsoleMethod>

  let writeQueue = Promise.resolve()

  const writeLogLine = (line: string) => {
    const filePath = getLogFilePath(dirPath, new Date())
    writeQueue = writeQueue
      .then(() => appendFile(filePath, line, 'utf8'))
      .catch((error) => {
        originalConsole.error('控制台日志写入失败:', error)
      })
  }

  for (const level of CONSOLE_LEVELS) {
    console[level] = (...args: unknown[]) => {
      originalConsole[level](...args)

      const now = new Date()
      const message = args.map(formatConsoleArg).join(' ')
      const line = `${now.toISOString()} [${level.toUpperCase()}] ${message}\n`
      writeLogLine(line)
    }
  }

  return {
    dirPath,
    restore: () => {
      for (const level of CONSOLE_LEVELS) {
        console[level] = originalConsole[level]
      }
    },
  }
}
