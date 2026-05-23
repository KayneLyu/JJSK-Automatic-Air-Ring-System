/**
 * Escapes a buffer by replacing special characters with escape sequences.
 * 转义
 * @param {Buffer} buffer - The buffer to escape.
 * @returns {Buffer} The escaped buffer.
 */
export function escapeBuffer(buffer: Buffer) {

    const result: number[] = []
  
    for (const byte of buffer) {
  
      if (byte === 0x7e) {
  
        result.push(0x7d, 0x5e)
  
      } else if (byte === 0x7d) {
  
        result.push(0x7d, 0x5d)
  
      } else {
  
        result.push(byte)
      }
    }
  
    return Buffer.from(result)
  }
  
  /**
   * 转义
   * Unescapes a buffer by removing escape sequences.
   *
   * @param {Buffer} buffer - The buffer to unescape.
   * @returns {Buffer} The unescaped buffer.
   */
  export function unescapeBuffer(buffer: Buffer) {
  
    const result: number[] = []
  
    for (let i = 0; i < buffer.length; i++) {
  
      const current = buffer[i]
  
      const next = buffer[i + 1]
  
      if (current === 0x7d && next === 0x5e) {
  
        result.push(0x7e)
  
        i++
  
      } else if (current === 0x7d && next === 0x5d) {
  
        result.push(0x7d)
  
        i++
  
      } else {
  
        result.push(current)
      }
    }
  
    return Buffer.from(result)
  }