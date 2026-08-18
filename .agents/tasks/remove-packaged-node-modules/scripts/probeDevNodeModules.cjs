const { createRequire } = require('node:module')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '../../../..')
const requireFromApp = createRequire(
  path.resolve(repositoryRoot, 'apps/AirRingSys/package.json')
)
const Database = requireFromApp('better-sqlite3')
const database = new Database(':memory:')

try {
  const row = database.prepare('SELECT 1 AS value').get()
  if (row.value !== 1) throw new Error('开发态内存 SQLite 查询失败')
  console.log(
    `[DevNodeModulesProbe] ${JSON.stringify({
      ok: true,
      resolvedFrom: requireFromApp.resolve('better-sqlite3'),
      query: true,
    })}`
  )
} finally {
  database.close()
}
