const result = {
  schemaVersion: 1,
  product: 'JJSK',
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron ?? null,
  modules: process.versions.modules,
  napi: process.versions.napi ?? null,
}

console.log(`[ContentRuntimeProbe] ${JSON.stringify(result)}`)

if (result.electron === null) {
  console.error('[ContentRuntimeProbe] 必须由 Electron 以 Node 模式运行')
  process.exitCode = 1
}
