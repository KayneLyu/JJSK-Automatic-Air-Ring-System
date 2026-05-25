import { decode7E } from './codec';
import { crc8 } from './crc';

export class FrameParser {
  private buffer = Buffer.alloc(0);

  /**
   * 喂入原始数据，返回所有已校验通过的完整载荷
   */
  feed(data: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames: Buffer[] = [];
    while (true) {
      const result = decode7E(this.buffer);
      if (!result) break;
      const { payload, consumed } = result;
      // 校验 CRC8
      if (payload.length >= 1) {
        const dataWithoutCrc = payload.subarray(0, payload.length - 1);
        const receivedCrc = payload[payload.length - 1];
        if (crc8(dataWithoutCrc) === receivedCrc) {
          frames.push(dataWithoutCrc);
        } else {
          // CRC 错误，丢弃该帧并记录错误（可触发 error 事件）
          // 这里简单丢弃，上层可监听 error
        }
      }
      this.buffer = this.buffer.subarray(consumed);
    }
    return frames;
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}