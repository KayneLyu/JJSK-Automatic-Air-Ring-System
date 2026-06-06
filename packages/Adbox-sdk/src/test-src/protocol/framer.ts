import { decode7E } from './codec';
import { crc8 } from './crc8';
const DELIM = 0x7e;

export class FrameParser {
  private buf = Buffer.alloc(0);

  feed(chunk: Buffer): Buffer[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const frames: Buffer[] = [];
    while (true) {
      const s = this.buf.indexOf(DELIM);
      if (s === -1) break;
      const e = this.buf.indexOf(DELIM, s + 1);
      if (e === -1) break;

      const raw = decode7E(this.buf.subarray(s + 1, e));
      this.buf = this.buf.subarray(e + 1);
      if (!raw || raw.length < 2) continue;

      const dataLen = raw.length - 1;
      if (crc8(raw.subarray(0, dataLen)) === raw[dataLen]) {
        frames.push(raw.subarray(0, dataLen)); // 返回去除CRC的纯数据
      }
    }
    return frames;
  }

  clear() { this.buf = Buffer.alloc(0); }
}