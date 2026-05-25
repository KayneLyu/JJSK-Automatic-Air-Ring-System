import { EventEmitter } from 'events';
import { TcpConnection } from '../comm/tcp-client';
import { buildFrame, decode7E, calcCrc8 } from '../frame';
import { PacketType, RealTimeData, RequestPromise, DbmBit } from '../types';

export class Adb2Core extends EventEmitter {
  private conn: TcpConnection;
  private pn = 0;
  private reqMap = new Map<string, RequestPromise>();

  constructor(conn: TcpConnection) {
    super();
    this.conn = conn;
    this.conn.on('data', (buf: Buffer) => this.parse(buf));
  }

  async send(cmd: string, args: Buffer[] = []): Promise<Buffer> {
    if (!this.conn.isConnected()) throw new Error('未连接');

    const payload = Buffer.concat([Buffer.from(cmd, 'ascii'), ...args]);
    this.pn = (this.pn + 1) & 0x7f;
    const frame = buildFrame(PacketType.Function, this.pn, payload);
    this.conn.write(frame);

    return new Promise((resolve, reject) => {
      const key = Math.random().toString(16).slice(2);
      const timer = setTimeout(() => {
        this.reqMap.delete(key);
        reject(new Error('超时'));
      }, 3000);

      this.reqMap.set(key, { resolve, reject, timer });

      this.once('response', (resBuf: Buffer) => {
        const item = this.reqMap.get(key);
        if (!item) return;
        clearTimeout(item.timer);
        this.reqMap.delete(key);
        resolve(resBuf.subarray(cmd.length));
      });
    });
  }

  private parse(buf: Buffer) {
    while (true) {
      const s = buf.indexOf(0x7e);
      if (s === -1) break;
      const e = buf.indexOf(0x7e, s + 1);
      if (e === -1) break;

      const frame = buf.subarray(s, e + 1);
      buf.subarray(e + 1);
      this.processFrame(frame);
    }
  }

  private processFrame(frame: Buffer) {
    const dec = decode7E(frame);
    if (!dec || dec.length < 2) return;

    const crcRx = dec[dec.length - 1];
    const data = dec.subarray(0, dec.length - 1);
    if (calcCrc8(data) !== crcRx) return;

    const b0 = data[0];
    const pt = (b0 >> 7) & 1;
    const payload = data.subarray(1);

    if (pt === PacketType.Data) {
      this.parseRealTime(b0 & 0x7f, payload);
    } else {
      this.emit('response', payload);
    }
  }

  private parseRealTime(pn: number, payload: Buffer) {
    const dbm = payload[0];
    let ptr = 1;
    const data: RealTimeData = {
      pn,
      reset: !!(dbm & (1 << DbmBit.RESET)),
      ad0: payload.readUInt16BE(ptr),
    };
    ptr += 2;

    // 按DBM解析省略...（和之前一样）
    this.emit('realTime', data);
  }
}