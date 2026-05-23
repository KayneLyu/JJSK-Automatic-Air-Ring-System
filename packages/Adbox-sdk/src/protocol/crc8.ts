/**
 * CRC-8 标准校验函数
 * @param buffer - 需要进行 CRC-8 校验的 Buffer 对象
 * @returns CRC-8 校验结果
 */
export function crc8(buffer: Buffer): number {

    let crc = 0x00
  
    for (const byte of buffer) {
  
      crc ^= byte
  
      for (let i = 0; i < 8; i++) {
  
        if (crc & 0x80) {
          crc = ((crc << 1) ^ 0x07) & 0xff
        } else {
          crc = (crc << 1) & 0xff
        }
      }
    }
  
    return crc
  }
