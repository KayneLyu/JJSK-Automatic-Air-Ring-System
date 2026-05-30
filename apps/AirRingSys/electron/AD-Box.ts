// main.ts
import { BrowserWindow, ipcMain } from 'electron';
import { ADBoxClient } from '../../../packages/adbox-sdk'
import type { PushData, RunResult } from "../../../packages/adbox-sdk";
import Store from 'electron-store';


export function initMotionControl(mainWindow: BrowserWindow) {
    // ---------- 配置存储 ----------
    const store = new Store({
        defaults: {
            maxPulse: 8900,      // 默认最大脉冲（机架长度）
            margin: 300,         // 膜宽余量（脉冲）
        },
    });

    let adb: ADBoxClient;

    // ---------- 运动控制状态 ----------
    let isScanning = false;
    let currentScanDir = 1;      // 1:正向, -1:反向
    let emergencyStopFlag = false;

    // 动态扫描范围（每次扫描前从配置读取）
    let currentMaxPulse = store.get('maxPulse') as number;

    // 端点停顿时间(ms)
    const END_PAUSE_MS = 100;

    // ---------- AD盒初始化 ----------
    async function initADBox() {
        adb = new ADBoxClient('192.168.251.12', 20021);
        adb.on('connected', async () => {
            console.log('AD Box 已连接');
            await adb.syncAllPos();
            await adb.clearResetFlag();
            emergencyStopFlag = false;
            mainWindow.webContents.send('adbox-connected', true);
        });

        adb.on('data', (push: PushData) => {
            // 推送测厚仪数据，如果探头脉冲位置没改变则只有AD0 AD1字段
            mainWindow.webContents.send('adbox-data', push.pos0Raw);
            // 根据reset字段判断是否复位
            if (push.reset) {
                console.warn('设备复位，重新同步');
                adb.syncAllPos();
                adb.clearResetFlag();
            }
        });

        adb.on('runResult', (result:RunResult) => {
            // 限位触发 (3)
            if (result.status === 3) {
                console.error('限位触发！紧急停止');
                emergencyStop();
                mainWindow.webContents.send('adbox-error', '限位开关触发，已紧急停止');
            }
            mainWindow.webContents.send('adbox-run-result', result);
        });

        adb.on('error', (err) => {
            console.error(err);
            mainWindow.webContents.send('adbox-error', err.message);
        });

        await adb.connect();
    }

    // ---------- 安全保护 ----------
    async function emergencyStop() {
        if (!adb?.connected) return;
        isScanning = false;
        emergencyStopFlag = true;
        await adb.stopEmergency();
        mainWindow.webContents.send('adbox-emergency-stopped');
    }

    function clearEmergencyFlag() {
        emergencyStopFlag = false;
    }

    // 正常停止扫描（减速）
    function stopScanGracefully() {
        isScanning = false;
        adb.stopDecel();
    }

    // 运动等待（带超时和急停检测）
    async function moveAndWait(target: number): Promise<void> {
        if (emergencyStopFlag || !isScanning) {
            throw new Error('运动已取消（急停或停止）');
        }
        await adb.moveToPosition(target);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('运动超时'));
            }, 10000);
            const onResult = (result: any) => {
                switch (result.status) {
                    case 0: cleanup(); resolve(); break;
                    case 2: cleanup(); reject(new Error('手动停止')); break;
                    case 3: cleanup(); reject(new Error('限位触发')); break;
                    default: cleanup(); reject(new Error(`未知状态: ${result.status}`));
                }
            };
            const cleanup = () => {
                clearTimeout(timeout);
                adb.off('runResult', onResult);
            };
            adb.on('runResult', onResult);
        });
    }

    // 往复扫描循环（使用当前最大脉冲）
    async function runScanLoop() {
        const maxPos = currentMaxPulse;
        const minPos = 0;
        while (isScanning && !emergencyStopFlag) {
            if (currentScanDir === 1) {
                await moveAndWait(maxPos).catch(err => console.warn('正向失败:', err.message));
                if (!isScanning || emergencyStopFlag) break;
                currentScanDir = -1;
                await new Promise(r => setTimeout(r, END_PAUSE_MS));
            } else {
                await moveAndWait(minPos).catch(err => console.warn('反向失败:', err.message));
                if (!isScanning || emergencyStopFlag) break;
                currentScanDir = 1;
                await new Promise(r => setTimeout(r, END_PAUSE_MS));
            }
        }
    }

    async function startScan() {
        if (emergencyStopFlag) throw new Error('设备处于急停状态，请先复位');
        if (isScanning) return;
        // 从配置重新读取最大脉冲（确保用户最新设置生效）
        currentMaxPulse = store.get('maxPulse') as number;
        isScanning = true;
        // 根据当前位置决定初始方向（可选）
        const cur = adb.getCachedPos0Raw();
        currentScanDir = (cur >= currentMaxPulse) ? -1 : 1;
        runScanLoop().catch(err => {
            console.error('扫描异常:', err);
            isScanning = false;
        });
    }

    // ---------- 配置管理 ----------
    function setMaxPulse(value: number) {
        store.set('maxPulse', value);
        currentMaxPulse = value;
        mainWindow.webContents.send('config-updated', { maxPulse: value });
    }

    function getMaxPulse(): number {
        return store.get('maxPulse') as number;
    }

    function setMargin(value: number) {
        store.set('margin', value);
    }

    function getMargin(): number {
        return store.get('margin') as number;
    }

    /**
     * 根据膜宽设置扫描最大脉冲 = 膜宽 + 余量
     * @param webWidth 膜宽（脉冲）
     */
    function setScanRangeByWebWidth(webWidth: number) {
        const margin = getMargin();
        const newMax = webWidth + margin;
        setMaxPulse(newMax);
        mainWindow.webContents.send('scan-range-updated', { maxPulse: newMax, webWidth, margin });
    }

    // ---------- IPC 接口 ----------
    ipcMain.handle('adbox-connect', async () => {
        if (!adb) await initADBox();
        return adb.connected;
    });
    ipcMain.handle('adbox-start-scan', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        await startScan();
    });
    ipcMain.handle('adbox-stop', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        stopScanGracefully();
    });
    ipcMain.handle('adbox-emergency-stop', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        await emergencyStop();
    });
    ipcMain.handle('adbox-clear-emergency', async () => {
        clearEmergencyFlag();
        mainWindow.webContents.send('adbox-emergency-cleared');
    });
    ipcMain.handle('adbox-forward', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.moveForward();
    });
    ipcMain.handle('adbox-backward', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.moveBackward();
    });
    ipcMain.handle('adbox-home', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.home();
    });
    ipcMain.handle('adbox-get-position', () => adb?.getCachedPos0Raw() ?? 0);
    ipcMain.handle('config-get-max-pulse', () => getMaxPulse());
    ipcMain.handle('config-set-max-pulse', (_, value: number) => setMaxPulse(value));
    ipcMain.handle('config-get-margin', () => getMargin());
    ipcMain.handle('config-set-margin', (_, value: number) => setMargin(value));
    ipcMain.handle('config-set-scan-range-by-web-width', (_, webWidth: number) => setScanRangeByWebWidth(webWidth));
}


