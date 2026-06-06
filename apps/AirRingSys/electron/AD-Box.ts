import { app, BrowserWindow, ipcMain } from 'electron'
import { ADBoxClient } from '@jjsk/adbox-sdk'
import type { PushData, RunResult } from '@jjsk/adbox-sdk'
import Store from 'electron-store'
import { DataBatcher } from './data-batcher'

type AdboxMode = 'prod' | 'test'

type RuntimeConfig = {
  adboxMode: AdboxMode
  useDataBatcher: boolean
  dataBatchInterval: number
  dbmDiagnostics: boolean
  dbmLogEveryMs: number
}

// AdbClient was previously a union with TestADBoxClient – now unified.

export function initMotionControl(mainWindow: BrowserWindow) {
  const store = new Store({
    defaults: {
      maxPulse: 7000,
      margin: 300,
      adboxMode: 'prod',
      useDataBatcher: false,
      dataBatchInterval: 50,
      dbmDiagnostics: false,
      dbmLogEveryMs: 1000,
    },
  })

  let adb: ADBoxClient | undefined
  let dataBatcher: DataBatcher<PushData> | undefined

  let isScanning = false
  let currentScanDir = 1
  let emergencyStopFlag = false
  let currentMaxPulse = store.get('maxPulse') as number

  const END_PAUSE_MS = 100
  let lastPushPos0Raw = 0
  let lastDbmLogTs = 0

  function getRuntimeConfig(): RuntimeConfig {
    const envMode = process.env['ADBOX_MODE']
    const mode =
      (envMode === 'test' || envMode === 'prod'
        ? envMode
        : (store.get('adboxMode') as AdboxMode)) ?? 'prod'
    return {
      adboxMode: mode,
      useDataBatcher: Boolean(store.get('useDataBatcher')),
      dataBatchInterval: Number(store.get('dataBatchInterval') ?? 50),
      dbmDiagnostics: Boolean(store.get('dbmDiagnostics')),
      dbmLogEveryMs: Number(store.get('dbmLogEveryMs') ?? 1000),
    }
  }

  function getCurrentPos0Raw(): number {
    return adb?.getCachedPos0Raw() ?? lastPushPos0Raw
  }

  function ensureBatcher(config: RuntimeConfig) {
    if (!config.useDataBatcher) {
      dataBatcher?.destroy()
      dataBatcher = undefined
      return
    }
    if (!dataBatcher) {
      dataBatcher = new DataBatcher<PushData>(mainWindow, 'adbox-data', {
        interval: config.dataBatchInterval,
      })
    }
  }

  function emitPush(push: PushData, config: RuntimeConfig) {
    ensureBatcher(config)
    if (config.useDataBatcher && dataBatcher) {
      dataBatcher.push(push)
      return
    }
    mainWindow.webContents.send('adbox-data', push)
  }

  function maybeLogDbm(push: PushData, config: RuntimeConfig) {
    if (!config.dbmDiagnostics) return
    const now = Date.now()
    if (now - lastDbmLogTs < config.dbmLogEveryMs) return
    lastDbmLogTs = now

    const hasIn = push.in !== undefined || push.inChange !== undefined
    const hasPos0 = push.pos0Raw !== undefined || push.pos0 !== undefined
    const hasPos1 = push.pos1Raw !== undefined || push.pos1 !== undefined
    const hasOut = push.out !== undefined
    const hasAd1 = push.ad1 !== undefined

    console.log(
      `[ADBOX-DBM] in=${hasIn ? 1 : 0} pos0=${hasPos0 ? 1 : 0} pos1=${hasPos1 ? 1 : 0} out=${hasOut ? 1 : 0} ad1=${hasAd1 ? 1 : 0} reset=${push.reset ? 1 : 0} ad0=${push.ad0} pos0Raw=${push.pos0Raw ?? -1} pos1Raw=${push.pos1Raw ?? -1}`
    )
  }

  function bindCommonEvents(client: ADBoxClient) {
    const config = getRuntimeConfig()

    client.on('data', (push: PushData) => {
      if (push.pos0Raw !== undefined) {
        lastPushPos0Raw = push.pos0Raw
      }

      emitPush(push, config)
      maybeLogDbm(push, config)

      if (push.reset) {
        console.warn('设备复位，重新同步')
        client.syncAllPos().catch(() => {})
        Promise.resolve(client.clearResetFlag()).catch(() => {})
      }
    })

    client.on('runResult', (result: RunResult) => {
      if (result.status === 3) {
        console.error('限位触发！紧急停止')
        emergencyStop().catch((err) =>
          console.error('emergencyStop error:', err)
        )
        mainWindow.webContents.send('adbox-error', '限位开关触发，已紧急停止')
      }
      mainWindow.webContents.send('adbox-run-result', result)
    })

    client.on('error', (err: Error) => {
      console.error(err)
      mainWindow.webContents.send('adbox-error', err.message)
    })

    client.on('close', () => {
      mainWindow.webContents.send('adbox-connected', false)
    })

    client.on('disconnected', () => {
      mainWindow.webContents.send('adbox-connected', false)
    })
  }

  async function initADBox() {
    if (adb) {
      adb.disconnect()
      adb = undefined
    }

    const config = getRuntimeConfig()
    const host = '192.168.251.12'
    const port = 20021

    // test 模式：启用自动重连 + 推送看门狗；prod 模式：关闭（保持现有行为）
    adb = new ADBoxClient({
      host,
      port,
      autoReconnect: config.adboxMode === 'test',
      reconnectInterval: 3000,
      pushTimeout: config.adboxMode === 'test' ? 1000 : 0,
    })

    adb.on('connected', async () => {
      console.log(`AD Box 已连接 (mode=${config.adboxMode})`)
      mainWindow.webContents.send('adbox-connected', true)
      emergencyStopFlag = false

      // test 模式等待首帧事件后同步；prod 模式立即同步
      if (config.adboxMode !== 'test') {
        await adb!.syncAllPos()
        await adb!.clearResetFlag()
      }
    })

    adb.on('firstFrame', async () => {
      if (config.adboxMode === 'test') {
        await new Promise((resolve) => setTimeout(resolve, 500))
        adb?.syncPos0().catch((err) => console.warn('syncPos0:', err.message))
        adb?.syncPos1().catch((err) => console.warn('syncPos1:', err.message))
      }
    })

    bindCommonEvents(adb)
    await Promise.resolve(adb.connect())
  }

  async function emergencyStop() {
    if (!adb?.connected) return
    isScanning = false
    emergencyStopFlag = true
    await adb.stopEmergency()
    mainWindow.webContents.send('adbox-emergency-stopped')
  }

  function clearEmergencyFlag() {
    emergencyStopFlag = false
  }

  function stopScanGracefully() {
    isScanning = false
    adb?.stopDecel()
  }

  async function moveAndWait(target: number): Promise<void> {
    if (!adb?.connected) {
      throw new Error('设备未连接')
    }
    if (emergencyStopFlag || !isScanning) {
      throw new Error('运动已取消（急停或停止）')
    }

    await adb.moveToPosition(target)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('运动超时'))
      }, 10000)

      const onResult = (result: RunResult) => {
        switch (result.status) {
          case 0:
            cleanup()
            resolve()
            break
          case 2:
            cleanup()
            reject(new Error('手动停止'))
            break
          case 3:
            cleanup()
            reject(new Error('限位触发'))
            break
          default:
            cleanup()
            reject(new Error(`未知状态: ${result.status}`))
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        adb?.off('runResult', onResult)
      }

      adb!.on('runResult', onResult)
    })
  }

  async function runScanLoop() {
    const maxPos = currentMaxPulse
    const minPos = 0

    while (isScanning && !emergencyStopFlag) {
      if (currentScanDir === 1) {
        await moveAndWait(maxPos).catch((err) =>
          console.warn('正向失败:', err.message)
        )
        if (!isScanning || emergencyStopFlag) break
        currentScanDir = -1
        await new Promise((r) => setTimeout(r, END_PAUSE_MS))
      } else {
        await moveAndWait(minPos).catch((err) =>
          console.warn('反向失败:', err.message)
        )
        if (!isScanning || emergencyStopFlag) break
        currentScanDir = 1
        await new Promise((r) => setTimeout(r, END_PAUSE_MS))
      }
    }
  }

  async function startScan() {
    if (!adb?.connected) throw new Error('设备未连接')
    if (emergencyStopFlag) throw new Error('设备处于急停状态，请先复位')
    if (isScanning) return

    currentMaxPulse = store.get('maxPulse') as number
    isScanning = true

    const cur = getCurrentPos0Raw()
    currentScanDir = cur >= currentMaxPulse ? -1 : 1

    runScanLoop().catch((err) => {
      console.error('扫描异常:', err)
      isScanning = false
    })
  }

  function setMaxPulse(value: number) {
    store.set('maxPulse', value)
    currentMaxPulse = value
    mainWindow.webContents.send('config-updated', { maxPulse: value })
  }

  function getMaxPulse(): number {
    return store.get('maxPulse') as number
  }

  function setMargin(value: number) {
    store.set('margin', value)
  }

  function getMargin(): number {
    return store.get('margin') as number
  }

  function setScanRangeByWebWidth(webWidth: number) {
    const margin = getMargin()
    const newMax = webWidth + margin
    setMaxPulse(newMax)
    mainWindow.webContents.send('scan-range-updated', {
      maxPulse: newMax,
      webWidth,
      margin,
    })
  }

  function setAdboxMode(mode: AdboxMode) {
    store.set('adboxMode', mode)
  }

  function getAdboxMode(): AdboxMode {
    const mode = store.get('adboxMode')
    return mode === 'test' ? 'test' : 'prod'
  }

  function setDbmDiagnostics(enabled: boolean) {
    store.set('dbmDiagnostics', enabled)
  }

  function getDbmDiagnostics(): boolean {
    return Boolean(store.get('dbmDiagnostics'))
  }

  ipcMain.handle('adbox-connect', async () => {
    if (!adb) await initADBox()
    return adb!.connected
  })

  ipcMain.handle('adbox-start-scan', async () => {
    await startScan()
  })

  ipcMain.handle('adbox-stop', async () => {
    if (!adb?.connected) throw new Error('设备未连接')
    stopScanGracefully()
  })

  ipcMain.handle('adbox-emergency-stop', async () => {
    if (!adb?.connected) throw new Error('设备未连接')
    await emergencyStop()
  })

  ipcMain.handle('adbox-clear-emergency', async () => {
    clearEmergencyFlag()
    mainWindow.webContents.send('adbox-emergency-cleared')
  })

  ipcMain.handle('adbox-forward', async () => {
    if (!adb?.connected) throw new Error('设备未连接')
    if (emergencyStopFlag) throw new Error('急停状态')
    stopScanGracefully()
    await adb.moveForward()
  })

  ipcMain.handle('adbox-backward', async () => {
    if (!adb?.connected) throw new Error('设备未连接')
    if (emergencyStopFlag) throw new Error('急停状态')
    stopScanGracefully()
    await adb.moveBackward()
  })

  ipcMain.handle('adbox-home', async () => {
    if (!adb?.connected) throw new Error('设备未连接')
    if (emergencyStopFlag) throw new Error('急停状态')
    stopScanGracefully()
    await adb.home()
  })

  ipcMain.handle('adbox-movePosition', async (_, target = 1234) => {
    if (!adb?.connected) throw new Error('设备未连接')
    if (emergencyStopFlag) throw new Error('急停状态')
    stopScanGracefully()
    await adb.moveToPosition(Number(target))
  })

  ipcMain.handle('adbox-get-position', () => getCurrentPos0Raw())

  ipcMain.handle('config-get-max-pulse', () => getMaxPulse())
  ipcMain.handle('config-set-max-pulse', (_, value: number) =>
    setMaxPulse(value)
  )
  ipcMain.handle('config-get-margin', () => getMargin())
  ipcMain.handle('config-set-margin', (_, value: number) => setMargin(value))
  ipcMain.handle('config-set-scan-range-by-web-width', (_, webWidth: number) =>
    setScanRangeByWebWidth(webWidth)
  )

  ipcMain.handle('config-get-adbox-mode', () => getAdboxMode())
  ipcMain.handle('config-set-adbox-mode', async (_, mode: AdboxMode) => {
    setAdboxMode(mode)
    if (adb?.connected) {
      adb.disconnect()
      adb = undefined
      await initADBox()
    }
    return getAdboxMode()
  })

  ipcMain.handle('adbox-dbm-diagnostics-get', () => getDbmDiagnostics())
  ipcMain.handle('adbox-dbm-diagnostics-set', (_, enabled: boolean) => {
    setDbmDiagnostics(Boolean(enabled))
    return getDbmDiagnostics()
  })

  ipcMain.handle('adbox-runtime-options-get', () => getRuntimeConfig())

  app.on('before-quit', () => {
    adb?.disconnect()
    dataBatcher?.destroy()
    console.log('quit app and adbox')
  })
}
