// ad-box-client.ts
import * as net from 'net';
import { EventEmitter } from 'events';
import { FrameParser } from './frame-parser';
import { parseDataPacket, DataFrame } from './data-parser';
import { CommandDispatcher } from './command-dispatcher';
import { CMD, CommandDef } from './commands';

export interface AdBoxOptions {
    host: string;
    port: number;
    autoReconnect?: boolean;
    reconnectInterval?: number;
    /** 参数是否从设备读取，否则从本地写入设备 (同 C# IsReadParamFromDev) */
    readParamsFromDevice?: boolean;
}

export class AdBoxClient extends EventEmitter {
    private socket: net.Socket | null = null;
    private parser = new FrameParser();
    private dispatcher = new CommandDispatcher();
    private options: Required<AdBoxOptions>;

    public connected = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pushWatchdog: NodeJS.Timeout | null = null;
    private lastPushTime = 0;

    // 状态变量（对应 C# 客户端）
    public sysTick = 0;
    public now = new Date();
    public ad = 0;
    public ad2 = 0;
    public position = 0;          // 32位扩展脉冲1
    public position2 = 0;         // 32位扩展脉冲2
    public iStatus = 0;
    public oStatus = 0;
    public isReseted = false;
    public driveStatus = 0;
    public driveOrder = 0;
    public velocity = 8000;
    public sVelocity = 200;
    public aTime = 300;
    public dTime = 200;
    public hVelocity1 = 4000;
    public hVelocity2 = 500;
    public motorType = 0; // 0:SERVO, 1:STEP...
    public ratio01 = 4;
    public ratio02 = 1;
    public posOffset = 0;
    public jogVelocity = 5000;
    public isReady = false;

    // 内部就绪标志
    private readyState = {
        pos1: false,
        pos2: false,
        in: false,
        out: false,
    };

    private pulse16To32 = new Pulse32Extender();
    private pulse16To32_2 = new Pulse32Extender();
    private sysTickContext = new SysTickConverter();

    constructor(options: AdBoxOptions) {
        super();
        this.options = {
            autoReconnect: true,
            reconnectInterval: 3000,
            readParamsFromDevice: false,
            ...options,
        };
        this.dispatcher.onSend(buf => this.socket?.write(buf));
        this.dispatcher.onDisconnect(() => this.handleDisconnect());
        this.dispatcher.on('runResult', (data: any) => {
            this.driveStatus = data.status;
            this.emit('driveStatusChanged', data);
        });
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.connect(this.options.port, this.options.host, () => {
                this.connected = true;
                this.lastPushTime = Date.now();
                this.startPushWatchdog();
                this.emit('connected');
                this.afterConnected();
                resolve();
            });
            this.socket.on('data', (chunk: Buffer) => this.parser.feed(chunk, this.handlePacket.bind(this)));
            this.socket.on('close', () => this.handleDisconnect());
            this.socket.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });
        });
    }

    disconnect() {
        this.options.autoReconnect = false;
        this.stopPushWatchdog();
        this.dispatcher.reset();
        this.socket?.destroy();
        this.socket = null;
        this.connected = false;
    }

    // -------------------- 内部 --------------------
    private handlePacket(packet: Buffer) {
        const pt = (packet[0] >> 7) & 1;
        if (pt === 0) {
            const frame = parseDataPacket(packet);
            if (frame) {
                this.lastPushTime = Date.now();
                this.processDataFrame(frame);
            }
        } else {
            this.dispatcher.handleResponse(packet);
        }
    }

    private processDataFrame(f: DataFrame) {
        this.sysTick = f.sysTick;
        this.now = this.sysTickContext.toDateTime(f.sysTick);
        this.ad = f.ad;
        this.ad2 = f.ad2 ?? 0;
        this.isReseted = f.reset;

        if (f.pos0 !== undefined && this.readyState.pos1) {
            this.position = this.pulse16To32.update(f.pos0);
        }
        if (f.pos0_small !== undefined && this.readyState.pos2) {
            this.position2 = this.pulse16To32_2.update(f.pos0_small);
        }
        if (f.in !== undefined) {
            this.iStatus = f.in;
            if (!this.readyState.in) { this.readyState.in = true; this.checkReady(); }
        }
        if (f.out !== undefined) {
            this.oStatus = f.out;
            if (!this.readyState.out) { this.readyState.out = true; this.checkReady(); }
        }

        if (f.reset) {
            // 自动清除复位位
            this.sendCommand(CMD.CLEAR_RESET).catch(() => { });
            // 重新初始化
            this.afterConnected();
            return;
        }

        this.emit('data', { ...f, position: this.position, position2: this.position2, iStatus: this.iStatus, oStatus: this.oStatus, now: this.now });
    }

    private afterConnected() {
        this.readyState = { pos1: false, pos2: false, in: false, out: false };
        this.isReady = false;
        this.pulse16To32.reset();
        this.pulse16To32_2.reset();
        this.sysTickContext.reset();

        if (this.options.readParamsFromDevice) {
            // 从设备读取所有参数（使用打包）
            this.executeMulti([
                { cmd: CMD.GET_PARAM_SAVE(1) }, // Ratio01
                { cmd: CMD.GET_PARAM_SAVE(2) }, // Ratio02
                { cmd: CMD.GET_PARAM_SAVE(3) }, // PosOffset
                { cmd: CMD.GET_PARAM_SAVE(4) }, // JogVelocity
                { cmd: CMD.GET_PARAM_SAVE(0) }, // MotorType
                { cmd: CMD.GET_V },
                { cmd: CMD.GET_SV },
                { cmd: CMD.GET_ACC },
                { cmd: CMD.GET_DEC },
                { cmd: CMD.GET_HSPD1 },
                { cmd: CMD.GET_HSPD2 },
            ]).then(results => {
                this.ratio01 = results[0].readUInt16LE(0);
                this.ratio02 = results[1].readUInt16LE(0);
                this.posOffset = results[2].readInt16LE(0);
                this.jogVelocity = results[3].readUInt32LE(0);
                this.motorType = results[4].readUInt8(0) & 3;
                this.velocity = results[5].readUInt32LE(0);
                this.sVelocity = results[6].readUInt32LE(0);
                this.aTime = results[7].readUInt32LE(0);
                this.dTime = results[8].readUInt32LE(0);
                this.hVelocity1 = results[9].readUInt32LE(0);
                this.hVelocity2 = results[10].readUInt32LE(0);
            }).catch(err => this.emit('error', err));
        } else {
            // 将本地参数写入设备
            this.executeMulti([
                { cmd: CMD.SET_PARAM_SAVE(0), data: this.buildMotorTypeData() },
                { cmd: CMD.SET_PARAM_SAVE(1), data: this.createBuffer(this.ratio01, 4, true) },
                { cmd: CMD.SET_PARAM_SAVE(2), data: this.createBuffer(this.ratio02, 4, true) },
                { cmd: CMD.SET_PARAM_SAVE(3), data: this.createBuffer(this.posOffset, 4, false) },
                { cmd: CMD.SET_PARAM_SAVE(4), data: this.createBuffer(this.jogVelocity, 4, true) },
                { cmd: CMD.APPLY_PARAM },
            ]).catch(err => this.emit('error', err));
        }

        // 获取初始状态
        this.executeMulti([
            { cmd: CMD.GET_POS0 },
            { cmd: CMD.GET_POS1 },
            { cmd: CMD.GET_IN },
            { cmd: CMD.GET_OUT },
        ]).then(results => {
            this.position = results[0].readInt32LE(0);
            this.position2 = results[1].readInt32LE(0);
            this.iStatus = results[2].readUInt16LE(0);
            this.oStatus = results[3].readUInt16LE(0);
            this.readyState.pos1 = true;
            this.readyState.pos2 = true;
            this.readyState.in = true;
            this.readyState.out = true;
            this.checkReady();
        }).catch(err => this.emit('error', err));
    }

    private buildMotorTypeData(): Buffer {
        const val = (this.motorType & 3) | (0x3 << 2);
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(val, 0);
        return buf;
    }

    private checkReady() {
        if (this.readyState.pos1 && this.readyState.pos2 && this.readyState.in && this.readyState.out) {
            this.isReady = true;
            this.emit('ready');
        }
    }

    // 推送看门狗（1秒无推送则重连）
    private startPushWatchdog() {
        this.pushWatchdog = setInterval(() => {
            if (!this.connected) return;
            if (Date.now() - this.lastPushTime > 1000) {
                this.handleDisconnect();
            }
        }, 1000);
    }

    private stopPushWatchdog() {
        if (this.pushWatchdog) clearInterval(this.pushWatchdog);
    }

    private handleDisconnect() {
        if (!this.connected) return;
        this.connected = false;
        this.stopPushWatchdog();
        this.dispatcher.reset();
        this.emit('disconnected');
        if (this.options.autoReconnect) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect().catch(() => { });
            }, this.options.reconnectInterval);
        }
    }

    // 指令发送辅助
    private async sendCommand(cmd: CommandDef, data?: Buffer): Promise<any> {
        if (!this.connected) throw new Error('Not connected');
        return this.dispatcher.execute(cmd, data);
    }

    private async executeMulti(cmds: Array<{ cmd: CommandDef; data?: Buffer }>): Promise<any[]> {
        if (!this.connected) throw new Error('Not connected');
        return this.dispatcher.executeMulti(cmds);
    }

    private createBuffer(value: number, size: 2 | 4, unsigned = true): Buffer {
        const buf = Buffer.alloc(size);
        if (unsigned) {
            if (size === 2) buf.writeUInt16LE(value, 0);
            else if (size === 4) buf.writeUInt32LE(value, 0);
        } else {
            if (size === 2) buf.writeInt16LE(value, 0);
            else if (size === 4) buf.writeInt32LE(value, 0);
        }
        return buf;
    }

    // -------------------- 公开 API --------------------
    async getIn(): Promise<number> { const buf = await this.sendCommand(CMD.GET_IN); return buf.readUInt16LE(0); }
    async getOut(): Promise<number> { const buf = await this.sendCommand(CMD.GET_OUT); return buf.readUInt16LE(0); }
    async getPos0(): Promise<number> { const buf = await this.sendCommand(CMD.GET_POS0); return buf.readInt32LE(0); }
    async getPos1(): Promise<number> { const buf = await this.sendCommand(CMD.GET_POS1); return buf.readInt32LE(0); }
    async setOut(mask: number, value: number): Promise<void> {
        const buf = Buffer.alloc(4);
        buf.writeUInt16LE(mask, 0);
        buf.writeUInt16LE(value, 2);
        await this.sendCommand(CMD.SET_OUT, buf);
    }
    async getTick(): Promise<number> { const buf = await this.sendCommand(CMD.GET_TICK); return buf.readUInt32LE(0); }

    async setVelocity(v: number) {
        await this.sendCommand(CMD.SET_V, this.createBuffer(v, 4, true));
        this.velocity = v;
    }

    async setStartVelocity(sv: number) {
        await this.sendCommand(CMD.SET_SV, this.createBuffer(sv, 4, true));
        this.sVelocity = sv;
    }

    async setAccTime(acc: number) {
        await this.sendCommand(CMD.SET_ACC, this.createBuffer(acc, 4, true));
        this.aTime = acc;
    }

    async setDecTime(dec: number) {
        await this.sendCommand(CMD.SET_DEC, this.createBuffer(dec, 4, true));
        this.dTime = dec;
    }

    async setHomeSpeed1(spd: number) {
        await this.sendCommand(CMD.SET_HSPD1, this.createBuffer(spd, 4, true));
        this.hVelocity1 = spd;
    }

    async setHomeSpeed2(spd: number) {
        await this.sendCommand(CMD.SET_HSPD2, this.createBuffer(spd, 4, true));
        this.hVelocity2 = spd;
    }

    async forward(serial = 126) {
        await this.sendCommand(CMD.FORWARD, this.createBuffer(serial, 4, true)); // serial 在 C# 中是 Int32，但原方法用的是 writeInt32LE，需保持一致
        // 若 C# 里 serial 是有符号 int，则应使用 this.createBuffer(serial, 4, false)；
        // 根据原代码中的 writeInt32LE，此处应保持有符号，修改如下：
        // await this.sendCommand(CMD.FORWARD, this.createBuffer(serial, 4, false));
        // 但 C# 中 serial 实际是 Int32，所以请修正为 this.createBuffer(serial, 4, false)
    }

    async backward(serial = 125) {
        await this.sendCommand(CMD.BACKWARD, this.createBuffer(serial, 4, false));
    }

    async home(serial = 124) {
        await this.sendCommand(CMD.HOME, this.createBuffer(serial, 4, false));
    }
    async stop() { await this.sendCommand(CMD.STOP); }
    async emergStop() { await this.sendCommand(CMD.ESTOP); }
    async moveAbs(pos: number, serial = 123) {
        const data = Buffer.alloc(9);
        data.writeUInt8(0x50, 0); // 'P'
        data.writeInt32LE(pos, 1);
        data.writeInt32LE(serial, 5);
        await this.sendCommand(CMD.MOVE_ABS, data);
    }

    async setParamMotorType(type: number) { await this.sendCommand(CMD.SET_PARAM_SAVE(0), this.buildMotorTypeData()); }
    async setParamRatio01(ratio: number) {
        await this.sendCommand(CMD.SET_PARAM_SAVE(1), this.createBuffer(ratio, 4, true));
    }

    async setParamRatio02(ratio: number) {
        await this.sendCommand(CMD.SET_PARAM_SAVE(2), this.createBuffer(ratio, 4, true));
    }

    async setParamZero(offset: number) {
        await this.sendCommand(CMD.SET_PARAM_SAVE(3), this.createBuffer(offset, 4, false));
    }

    async setParamJog(jog: number) {
        await this.sendCommand(CMD.SET_PARAM_SAVE(4), this.createBuffer(jog, 4, true));
    }
    async applyParams() { await this.sendCommand(CMD.APPLY_PARAM); }

    async resetSystem(delaySec: number) {
        const data = Buffer.alloc(6);
        data.writeUInt8(delaySec, 0);
        data.write('reset', 1, 'ascii');
        await this.sendCommand(CMD.RESET_SYSTEM, data);
    }
}

// 辅助：16位脉冲扩展为32位
class Pulse32Extender {
    private last32 = 0;
    update(val16: number): number {
        const last16 = this.last32 & 0xffff;
        const diff = (val16 - last16) << 16 >> 16; // 符号扩展
        this.last32 += diff;
        return this.last32;
    }
    reset() { this.last32 = 0; }
}

// 辅助：systick 转 DateTime
class SysTickConverter {
    private lastTick = 0;
    private lastTime = 0;
    reset() { this.lastTime = 0; }
    toDateTime(tick: number): Date {
        const nowMs = Date.now();
        if (this.lastTime === 0) {
            this.lastTime = nowMs;
            this.lastTick = tick;
            return new Date(nowMs);
        }
        let msDiff = tick - this.lastTick;
        if (msDiff < 0) msDiff += 0x80;
        this.lastTime += msDiff;
        this.lastTick = tick;
        return new Date(this.lastTime);
    }
}