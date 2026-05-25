import { crc8 } from '../protocol/crc8';
import { PacketType } from '../types';

// CRC8
export function calcCrc8(buf: Buffer): number {
  return crc8(buf);
}


// 7E 编码
export function encode7E(buf: Buffer): Buffer {
  const out: number[] = [];
  for (const b of buf) {
    if (b === 0x7e) {
      out.push(0x7d, 0x5e);
    } else if (b === 0x7d) {
      out.push(0x7d, 0x5d);
    } else {
      out.push(b);
    }
  }
  return Buffer.concat([Buffer.from([0x7e]), Buffer.from(out), Buffer.from([0x7e])]);
}

// 7E 解码
export function decode7E(frame: Buffer): Buffer | null {
  const content = frame.subarray(1, frame.length - 1);
  const out: number[] = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] === 0x7d) {
      i++;
      if (content[i] === 0x5e) out.push(0x7e);
      else if (content[i] === 0x5d) out.push(0x7d);
      else return null;
    } else {
      out.push(content[i]);
    }
    i++;
  }
  return Buffer.from(out);
}

// 构建完整帧
export function buildFrame(
  pt: PacketType,
  pn: number,
  payload: Buffer
): Buffer {
  const b0 = (pt << 7) | (pn & 0x7f);
  const data = Buffer.concat([Buffer.from([b0]), payload]);
  const crc8 = calcCrc8(data);
  return encode7E(Buffer.concat([data, Buffer.from([crc8])]));
}