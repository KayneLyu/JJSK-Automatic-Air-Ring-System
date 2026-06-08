import { decode7E } from './codec';
import { crc8 } from './crc8';
const DELIM = 0x7e;

export class FrameParser {
  private buf = Buffer.alloc(0);

  feed(chunk: Buffer): Buffer[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const frames: Buffer[] = [];

    while (true) {
      const start = this.buf.indexOf(DELIM);
      if (start === -1) break;
      const end = this.buf.indexOf(DELIM, start + 1);
      if (end === -1) break;

      // 调试
      // [RAW FRAME] frameContent.toString('hex')
      const frameContent = this.buf.subarray(start + 1, end);
      // 保留 end 处的 0x7E 作为下一帧的开始
      this.buf = this.buf.subarray(end);   // 原来是 end + 1，导致丢掉下一帧的头

      if (frameContent.length === 0) {
        // 双 0x7E 产生的空帧，直接跳过
        continue;
      }

      const raw = decode7E(frameContent);
      if (!raw || raw.length < 2) continue;

      const dataLen = raw.length - 1;
      const computed = crc8(raw.subarray(0, dataLen));
      const expected = raw[dataLen];
      if (computed === expected) {
        frames.push(raw.subarray(0, dataLen));
        // console.log(`[FRAME] CRC OK -> payload: ${raw.subarray(0, dataLen).toString('hex')}`);
      } 
      // else {
        // console.log(`[FRAME] CRC FAIL -> calc=${computed.toString(16)} exp=${expected.toString(16)}`);
      // }
    }
    return frames;
  }

  clear() { this.buf = Buffer.alloc(0); }
}