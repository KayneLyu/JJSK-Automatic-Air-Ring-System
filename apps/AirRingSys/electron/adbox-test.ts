// main.ts
import { BrowserWindow, ipcMain } from 'electron';
import { AdBoxClient } from '../../../packages/adbox-sdk'
import type { PushData, RunResult } from "../../../packages/adbox-sdk";
import Store from 'electron-store';


export function initMotionControl(mainWindow: BrowserWindow) {
    // ---------- 配置存储 ----------
    const store = new Store({
        defaults: {
            maxPulse: 7000,      // 默认最大脉冲（机架长度）
            margin: 300,         // 膜宽余量（脉冲）
        },
    });

    let adb: AdBoxClient;

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
        adb = new AdBoxClient({
            host: '192.168.251.12',
            port: 20021,
            autoReconnect: true,
            reconnectInterval: 5000,
            readParamsFromDevice: true,
        });

        adb.on('connected', () => console.log('adbox-connected'));
        adb.on('disconnected', () => console.log('adbox-disconnected retry in 5s...'));
        adb.on('ready', () => console.log('adbox-ready'));
        adb.on('data', (frame) => {
            // 1000 fps 实时数据，可选择性转发给 UI
            mainWindow.webContents.send('adbox-data', frame);
        });
        adb.on('error', (err) => console.error(err));
        adb.connect();
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


    // 正常停止扫描（减速）
    function stopScanGracefully() {
        isScanning = false;
        adb.stop();
    }

    // ---------- IPC 接口 ----------
    ipcMain.handle('adbox-connect', async () => {
        if (!adb) await initADBox();
        return adb.connected;
    });
    // ipcMain.handle('adbox-start-scan', async () => {
    //     if (!adb?.connected) throw new Error('设备未连接');
    //     await startScan();
    // });
    ipcMain.handle('adbox-stop', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        stopScanGracefully();
    });

    ipcMain.handle('adbox-forward', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.forward();
    });
    ipcMain.handle('adbox-backward', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.backward();
    });
    ipcMain.handle('adbox-home', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.home();
    });
    ipcMain.handle('adbox-home', async () => {
        if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        stopScanGracefully();
        await adb.moveAbs(1234);
    });
    // ipcMain.handle('adbox-get-position', () => client?.getCachedPos0Raw() ?? 0);
    ipcMain.handle('config-get-max-pulse', () => getMaxPulse());
    ipcMain.handle('config-set-max-pulse', (_, value: number) => setMaxPulse(value));
    ipcMain.handle('config-get-margin', () => getMargin());
    ipcMain.handle('config-set-margin', (_, value: number) => setMargin(value));
    ipcMain.handle('config-set-scan-range-by-web-width', (_, webWidth: number) => setScanRangeByWebWidth(webWidth));
}


