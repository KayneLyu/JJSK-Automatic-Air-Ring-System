/**
 * 将数据封装为 7E 帧（添加头尾、转义）
 * @param frame 不含头尾、不含 CRC8 的原始数据
 * @returns 完整的 7E 帧
 */
export function encode7E(frame: Buffer): Buffer {
  const escaped: number[] = [];
  for (const byte of frame) {
    if (byte === 0x7E) {
      escaped.push(0x7D, 0x5E);
    } else if (byte === 0x7D) {
      escaped.push(0x7D, 0x5D);
    } else {
      escaped.push(byte);
    }
  }
  return Buffer.concat([Buffer.from([0x7E]), Buffer.from(escaped), Buffer.from([0x7E])]);
}

/**
 * 从数据流中提取一个完整的 7E 帧并解码
 * @param data 累积的接收数据（会修改原数据？调用者需处理剩余部分）
 * @returns 解码后的有效载荷（不含头尾、已反转义、未校验CRC），若未找到完整帧则返回 null
 */
export function decode7E(data: Buffer): { payload: Buffer; consumed: number } | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x7E) {
      if (start === -1) {
        start = i;
      } else {
        end = i;
        break;
      }
    }
  }
  if (start === -1 || end === -1) return null;
  const frame = data.subarray(start + 1, end);
  // 反转义
  const decoded: number[] = [];
  for (let j = 0; j < frame.length; j++) {
    if (frame[j] === 0x7D) {
      if (j + 1 >= frame.length) return null;
      const next = frame[j + 1];
      if (next === 0x5E) decoded.push(0x7E);
      else if (next === 0x5D) decoded.push(0x7D);
      else return null;
      j++;
    } else {
      decoded.push(frame[j]);
    }
  }
  return { payload: Buffer.from(decoded), consumed: end + 1 };
}