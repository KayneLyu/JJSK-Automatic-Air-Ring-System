// main.ts
import { BrowserWindow, ipcMain, app } from 'electron';
import { TestADBoxClient } from '../../../packages/Adbox-sdk'
import type { PushData } from "../../../packages/Adbox-sdk/src/test-src/types.ts";
import Store from 'electron-store';
import { DataBatcher } from './data-batcher';

let dataBatcher: DataBatcher<any>;

export function initMotionControl(mainWindow: BrowserWindow) {
    // ---------- 配置存储 ----------
    const store = new Store({
        defaults: {
            maxPulse: 7000,      // 默认最大脉冲（机架长度）
            margin: 300,         // 膜宽余量（脉冲）
        },
    });

    // 创建节流器：每 10 帧合并发送一次（约 100 fps 到渲染进程）
    dataBatcher = new DataBatcher(mainWindow, 'adbox-data', {
        interval: 50
    });


    let adb: TestADBoxClient;

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
        adb = new TestADBoxClient({
            host: '192.168.251.12',
            port: 20021,
            pushTimeout: 1000,
            commandTimeout: 1000,
            maxRetries: 2,
        });

        adb.on('connected', () => console.log('connected'));
        adb.on('firstFrame', async () => {
            console.log('start receiving data');
            // 同步编码器高位（可选）
            await adb.syncPos0().catch(() => { });
        });
        adb.on('data', (push: PushData) => {

            dataBatcher.push(push);
            // 高频数据，推荐节流后发送到 UI
        });
        adb.on('runResult', (r) => console.log('running state', r));
        adb.on('disconnected', () => console.log('disconnected'));
        adb.on('error', (err) => console.error(err));

        adb.connect();

        // 调用移动
        // adb.moveToPosition(1000, 123).then(() => console.log('move complete'));
    }

    app.on("before-quit", () => {
        adb?.disconnect();
        dataBatcher?.destroy();
        console.log('quit app and adbox');
    })

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
        adb.stopDecel();
    }

    // ---------- IPC 接口 ----------
    ipcMain.handle('adbox-connect', async () => {
        if (!adb) await initADBox();
        // return adb.connected;
    });
    // ipcMain.handle('adbox-start-scan', async () => {
    //     if (!adb?.connected) throw new Error('设备未连接');
    //     await startScan();
    // });
    ipcMain.handle('adbox-stop', async () => {
        // if (!adb?.connected) throw new Error('设备未连接');
        stopScanGracefully();
    });

    ipcMain.handle('adbox-forward', async () => {
        // if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        try {
            stopScanGracefully();
            await adb.moveForward();
        } catch (error) {
            console.log('run error', error);
        }
    });
    ipcMain.handle('adbox-backward', async () => {
        // if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        try {
            stopScanGracefully();
            await adb.moveBackward();
        } catch (error) {
            console.log('run error', error);
        }
    });
    ipcMain.handle('adbox-home', async () => {
        // if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        try {
            stopScanGracefully();
            await adb.home();
        } catch (error) {
            console.log('run error', error);

        }
    });
    ipcMain.handle('adbox-movePosition', async ( _, position: number) => {
        // if (!adb?.connected) throw new Error('设备未连接');
        if (emergencyStopFlag) throw new Error('急停状态');
        try {
            stopScanGracefully();
            await adb.moveToPosition(position);
        } catch (error) {
            console.log('run error', error);
        }

    });
    // ipcMain.handle('adbox-get-position', () => client?.getCachedPos0Raw() ?? 0);
    ipcMain.handle('config-get-max-pulse', () => getMaxPulse());
    ipcMain.handle('config-set-max-pulse', (_, value: number) => setMaxPulse(value));
    ipcMain.handle('config-get-margin', () => getMargin());
    ipcMain.handle('config-set-margin', (_, value: number) => setMargin(value));
    ipcMain.handle('config-set-scan-range-by-web-width', (_, webWidth: number) => setScanRangeByWebWidth(webWidth));
}


