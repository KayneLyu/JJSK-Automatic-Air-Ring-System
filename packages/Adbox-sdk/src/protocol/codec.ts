const DELIM = 0x7e, ESC = 0x7d, XOR = 0x20;

/**
 * 将数据封装为 7E 帧（添加头尾、转义）
 * @param frame 不含头尾、不含 CRC8 的原始数据
 * @returns 完整的 7E 帧
 */
export function encode7E(raw: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (const b of raw) {
    if (b === DELIM || b === ESC) chunks.push(Buffer.from([ESC, b ^ XOR]));
    else chunks.push(Buffer.from([b]));
  }
  const body = Buffer.concat(chunks);
  return Buffer.concat([Buffer.from([DELIM]), body, Buffer.from([DELIM])]);
}

/**
 * 从数据流中提取一个完整的 7E 帧并解码
 * @param frame 累积的接收数据（会修改原数据？调用者需处理剩余部分）
 * @returns 解码后的有效载荷（不含头尾、已反转义、未校验CRC），若未找到完整帧则返回 null
 */
export function decode7E(frame: Buffer): Buffer | null {
  const out: number[] = [];
  for (let i = 0; i < frame.length; i++) {
    if (frame[i] === ESC) {
      if (++i >= frame.length) return null;
      out.push(frame[i] ^ XOR);
    } else out.push(frame[i]);
  }
  return Buffer.from(out);
}




