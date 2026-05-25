/**
 * 将 Buffer 转为十六进制字符串（调试用）
 */
export function bufferToHex(buf: Buffer): string {
  return buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
}

/**
 * 位操作：检查某位是否为1
 */
export function checkBit(value: number, bit: number): boolean {
  return ((value >> bit) & 1) === 1;
}

/**
 * 位操作：清除某位
 */
export function clearBit(value: number, bit: number): number {
  return value & ~(1 << bit);
}

/**
 * 位操作：设置某位
 */
export function setBit(value: number, bit: number, on: boolean): number {
  if (on) return value | (1 << bit);
  else return value & ~(1 << bit);
}