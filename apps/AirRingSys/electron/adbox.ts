import { BrowserWindow, ipcMain, app } from 'electron';
import { ADBoxClient } from '@jjsk/adbox-sdk';
import type { PushData, RunResult } from '@jjsk/adbox-sdk';
import Store from 'electron-store';
import { join } from 'node:path';
import { createConnectionLogger } from '@jjsk/air-ring-server/connections/base/connectionLogger';
import { DataBatcher } from './data-batcher';
import { calibrationBridge } from './rendererCommunicator';

// ==================== 类型定义 ====================
type MotionState = 'idle' | 'forward' | 'backward' | 'stopping' | 'scanning' | 'emergency';

// ==================== 配置接口 ====================
interface AppConfig {
    maxPulse: number;
    margin: number;
}

// ==================== 全局状态 (模块级私有) ====================
let mainWindow: BrowserWindow | null = null; // 保存引用供内部使用
let dataBatcher: DataBatcher<PushData> | null = null;
let adb: ADBoxClient | null = null;
let store: Store<AppConfig> | null = null;
let connectionLogger: ReturnType<typeof createConnectionLogger> | null = null;

// 运动状态
let motionState: MotionState = 'idle';
let currentMotionSerial = 0;
let scanDir = 1; // 1:正向, -1:反向
let emergencyStopFlag = false;
let currentMaxPulse = 6500;
let pauseTimer: NodeJS.Timeout | null = null;
const END_PAUSE_MS = 200;

// ==================== 导出初始化函数 ====================
/**
 * 初始化运动控制模块
 * @param win Electron 主窗口实例
 */
export function initMotionControl(win: BrowserWindow) {
    mainWindow = win;

    // ---------- 配置存储 ----------
    store = new Store<AppConfig>({
        defaults: {
            maxPulse: 7000,
            margin: 300,
        },
    });
    currentMaxPulse = store.get('maxPulse');

    // ---------- 日志记录器 ----------
    const logDir = join(app.getPath('userData'), 'logs', 'thickness');
    connectionLogger = createConnectionLogger({
        dirPath: logDir,
        source: 'thickness/adbox',
        deviceType: 'thickness',
        deviceName: '测厚仪',
        filePrefix: 'thickness-adbox',
        datePattern: 'YYYY-MM-DD-HH',
        maxSize: '100m',
        maxFiles: '7d',
    });

    // ---------- 节流器 ----------
    // 确保 mainWindow 已赋值
    if (!mainWindow) throw new Error('Main window not set');
    dataBatcher = new DataBatcher<PushData>(mainWindow, 'adbox-data', { interval: 50 });

    // ---------- AD盒初始化 ----------
    initADBox();

    // ---------- IPC 注册 ----------
    registerIpcHandlers();

    // ---------- 应用退出清理 ----------
    app.on('before-quit', () => {
        adb?.disconnect();
        dataBatcher?.destroy();
    });
}

// ==================== AD盒初始化 ====================
async function initADBox() {
    // 确保 mainWindow 在此处可用
    if (!mainWindow) throw new Error('Main window is not available');

    adb = new ADBoxClient({
        host: '192.168.251.12',
        port: 20021,
        pushTimeout: 1000,
        commandTimeout: 1000,
        maxRetries: 2,
    });

    adb.on('connected', () => {
        console.log('ADBox connected');
        mainWindow?.webContents.send('adbox-status', { connected: true });
        connectionLogger?.log({
            protocol: 'modbus',
            event: 'connect',
            meta: { host: '192.168.251.12', port: 20021 },
        });
    });

    adb.on('firstFrame', async () => {
        console.log('First frame received');
        await adb?.syncPos0().catch(() => { });
    });

    adb.on('data', (push: PushData) => {
        dataBatcher?.push(push);
        calibrationBridge.feedAdboxPushData(push);

        // 记录日志，格式与 ModBus 批量读取兼容，便于日志重放复用
        if (connectionLogger) {
            const nowMs = Date.now();
            const now = new Date(nowMs);
            const msSinceMidnight = nowMs - Date.UTC(
                now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
                0, 0, 0, 0
            );
            connectionLogger.log({
                protocol: 'modbus',
                event: 'read',
                data: {
                    adValues: [push.ad0],
                    pulses: [push.pos0 ?? 0],
                    timestamps: [msSinceMidnight],
                },
                meta: {
                    host: '192.168.251.12',
                    port: 20021,
                    reset: push.reset,
                    ad1: push.ad1,
                    in: push.in,
                    out: push.out,
                },
            });
        }
    });

    adb.on('runResult', (result: RunResult) => {
        mainWindow?.webContents.send('adbox-run-result', result);
        console.log('result', result);
        handleRunResult(result);
    });

    adb.on('disconnected', () => {
        console.log('ADBox disconnected');
        mainWindow?.webContents.send('adbox-status', { connected: false });
        connectionLogger?.log({
            protocol: 'modbus',
            event: 'connect_error',
            error: new Error('ADBox disconnected'),
            meta: { host: '192.168.251.12', port: 20021 },
        });
        stopScanInternal(false);
        motionState = 'idle';
        mainWindow?.webContents.send('motion-state', 'idle');
    });

    adb.on('error', (err) => {
        console.error('ADBox error:', err);
        connectionLogger?.log({
            protocol: 'modbus',
            event: 'read_error',
            error: err,
            meta: { host: '192.168.251.12', port: 20021 },
        });
    });

    try {
        await adb.connect();
    } catch (err) {
        console.error('ADBox connection failed:', err);
    }
}

function handleRunResult(result: RunResult) {
    mainWindow?.webContents.send('adbox-run-result', result);

    if (result.serial !== currentMotionSerial) return;

    // 根据协议，status = 0 (空闲/停止) 或 2 (停止) 都表示运动结束
    const isMotionFinished = (result.status === 0 || result.status === 2);

    if (isMotionFinished) {
        switch (motionState) {
            case 'scanning':
                onScanStepComplete();
                break;
            case 'stopping':
                motionState = 'idle';
                mainWindow?.webContents.send('motion-state', 'idle');
                break;
            default:
                motionState = 'idle';
                mainWindow?.webContents.send('motion-state', 'idle');
                break;
        }
    }
}

// ==================== 运动指令封装 ====================
function generateSerial(): number {
    return Math.floor(Math.random() * 0x7fffffff);
}

function sendMotionCommand(dir: 'forward' | 'backward', serial?: number) {
    if (emergencyStopFlag) throw new Error('急停状态');
    if (motionState === 'scanning') throw new Error('扫描中，请先停止扫描');
    const s = serial ?? generateSerial();
    currentMotionSerial = s;
    motionState = dir;
    mainWindow?.webContents.send('motion-state', motionState);

    if (dir === 'forward') {
        adb?.moveForward(s);
    } else {
        adb?.moveBackward(s);
    }
}

function sendMoveToCommand(pos: number, serial?: number, keepState = false) {
    if (emergencyStopFlag) throw new Error('急停状态');
    const s = serial ?? generateSerial();
    currentMotionSerial = s;
    // 只有非扫描模式下才更新运动状态为 forward/backward
    if (!keepState) {
        const currentPos = adb?.getCachedPos0() || 0;
        motionState = (pos >= currentPos) ? 'forward' : 'backward';
        mainWindow?.webContents.send('motion-state', motionState);
    }
    adb?.moveToPosition(pos, s);
}

function sendHomeCommand(serial?: number) {
    if (emergencyStopFlag) throw new Error('急停状态');
    if (motionState === 'scanning') throw new Error('扫描中，请先停止扫描');
    const s = serial ?? generateSerial();
    currentMotionSerial = s;
    motionState = 'backward';
    mainWindow?.webContents.send('motion-state', motionState);

    adb?.home(s);
}

function stopMotion() {
    if (motionState === 'idle' || motionState === 'emergency') return;
    motionState = 'stopping';
    currentMotionSerial = generateSerial();
    mainWindow?.webContents.send('motion-state', 'stopping');
    adb?.stopDecel();
}

function emergencyStop() {
    motionState = 'emergency';
    emergencyStopFlag = true;
    adb?.stopEmergency();
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }
    mainWindow?.webContents.send('motion-state', 'emergency');
}

// ==================== 扫描控制 ====================
async function startScan() {
    if (!adb?.isConnected) throw new Error('设备未连接');
    if (emergencyStopFlag) throw new Error('急停状态，请先复位');
    if (motionState === 'scanning') return;

    // 确保之前的运动完全停止
    await adb.stopDecel();
    await new Promise(r => setTimeout(r, 100));

    motionState = 'scanning';
    emergencyStopFlag = false;
    currentMaxPulse = store?.get('maxPulse') || currentMaxPulse;
    scanDir = 1;

    mainWindow?.webContents.send('motion-state', 'scanning');
    const target = currentMaxPulse;
    // keepState = true，保持扫描状态不变
    sendMoveToCommand(target, undefined, true);
}

function onScanStepComplete() {
    console.log('motionState', motionState);

    if (motionState !== 'scanning') return;

    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
        pauseTimer = null;
        if (motionState !== 'scanning') return;

        scanDir *= -1;
        const target = scanDir === 1 ? currentMaxPulse : 0;
        sendMoveToCommand(target, undefined, true);   // 保持扫描状态
    }, END_PAUSE_MS);
}

function stopScanGracefully() {
    if (motionState !== 'scanning') return;
    stopMotion();
}

function stopScanInternal(graceful: boolean) {
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }
    if (graceful) {
        stopScanGracefully();
    } else {
        motionState = 'idle';
        mainWindow?.webContents.send('motion-state', 'idle');
    }
}

// ==================== 配置管理 ====================
function setMaxPulse(value: number) {
    if (!store) return;
    store.set('maxPulse', value);
    currentMaxPulse = value;
    mainWindow?.webContents.send('config-updated', { maxPulse: value });
}

function getMaxPulse(): number {
    return store?.get('maxPulse') || currentMaxPulse;
}

function setMargin(value: number) {
    if (!store) return;
    store.set('margin', value);
}

function getMargin(): number {
    return store?.get('margin') || 300;
}

function setScanRangeByWebWidth(webWidth: number) {
    const margin = getMargin();
    const newMax = webWidth + margin;
    setMaxPulse(newMax);
    mainWindow?.webContents.send('scan-range-updated', { maxPulse: newMax, webWidth, margin });
}

// ==================== IPC 注册 ====================
function registerIpcHandlers() {
    const handlers: Record<string, (...args: any[]) => Promise<any>> = {
        // 连接管理
        'adbox-connect': async () => {
            if (!adb) await initADBox();
            return adb?.isConnected ?? false;
        },
        'adbox-disconnect': async () => { adb?.disconnect(); },

        // 运动控制
        'adbox-forward': async () => sendMotionCommand('forward'),
        'adbox-backward': async () => sendMotionCommand('backward'),
        'adbox-home': async () => sendHomeCommand(),
        'adbox-move-to': async (_, pos: number) => sendMoveToCommand(pos),
        'adbox-stop': async () => stopMotion(),
        'adbox-emergency-stop': async () => emergencyStop(),

        // 扫描
        'adbox-start-scan': async () => startScan(),
        'adbox-stop-scan': async () => stopScanGracefully(),

        // 状态查询
        'adbox-get-motion-state': async () => motionState,
        'adbox-get-connection-status': async () => adb?.isConnected ?? false,

        // 配置
        'config-get-max-pulse': async () => getMaxPulse(),
        'config-set-max-pulse': async (_, value: number) => setMaxPulse(value),
        'config-get-margin': async () => getMargin(),
        'config-set-margin': async (_, value: number) => setMargin(value),
        'config-set-scan-range': async (_, webWidth: number) => setScanRangeByWebWidth(webWidth),
    };

    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, async (event, ...args) => {
            try {
                return await handler(event, ...args);
            } catch (err: any) {
                console.error(`IPC ${channel} error:`, err);
                throw err.message;
            }
        });
    }
}