/**
 * CRC8 计算（多项式 0x31，初始值 0x00）
 */
export function crc8(data: Buffer): number {
  let crc = 0x00;
  const poly = 0x31;
  for (const byte of data) {
    let b = byte;
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) crc = ((crc << 1) ^ poly) & 0xff;
      else crc = (crc << 1) & 0xff;
    }
  }
  return crc;
}