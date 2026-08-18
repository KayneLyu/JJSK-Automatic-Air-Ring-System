import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'

const BETTER_SQLITE3_NATIVE_FILE = 'better_sqlite3.node'
const require = createRequire(import.meta.url)
let packagedNativeBinding: object | undefined

function resolveResourcesPath(): string {
  return (
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
    join(dirname(process.execPath), 'resources')
  )
}

/**
 * 开发态沿用 better-sqlite3 的 node_modules 默认解析；生产态使用显式发布的 addon。
 */
export function withPackagedBetterSqlite3Binding(
  options: Database.Options = {}
): Database.Options {
  const nativeBinding = join(
    resolveResourcesPath(),
    'native',
    BETTER_SQLITE3_NATIVE_FILE
  )

  if (!existsSync(nativeBinding)) return options

  packagedNativeBinding ??= require(nativeBinding) as object
  return {
    ...options,
    nativeBinding: packagedNativeBinding,
  } as unknown as Database.Options
}

export function packagedBetterSqlite3BindingPath(): string {
  return join(resolveResourcesPath(), 'native', BETTER_SQLITE3_NATIVE_FILE)
}
