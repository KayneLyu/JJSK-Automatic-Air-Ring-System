// frame-parser.ts
import { crc8 } from './crc8';
import { decode } from './frame-codec';

const FRAME_DELIM = 0x7e;

export class FrameParser {
  private buffer = Buffer.alloc(0);

  // 喂入数据，回调出通过校验的净荷（B0+payload）
  feed(chunk: Buffer, onPacket: (packet: Buffer) => void) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const start = this.buffer.indexOf(FRAME_DELIM);
      if (start === -1) break;
      const end = this.buffer.indexOf(FRAME_DELIM, start + 1);
      if (end === -1) break;

      const frameContent = this.buffer.subarray(start + 1, end);
      this.buffer = this.buffer.subarray(end + 1);

      if (frameContent.length === 0) continue;
      const raw = decode(frameContent);
      if (!raw || raw.length < 2) continue;

      const dataLen = raw.length - 1;
      if (crc8(raw, 0, dataLen) === raw[dataLen]) {
        onPacket(raw.subarray(0, dataLen)); // 返回去掉 CRC 的数据
      }
    }
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }
}