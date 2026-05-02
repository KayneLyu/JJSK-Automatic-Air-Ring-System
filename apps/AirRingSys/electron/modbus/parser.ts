/**
 * 16位高低字节交换
 * 例如：0x1234 -> 0x3412
 */
export function swap16(val: number): number {
    return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
  }
  
  /**
   * 32位解析（西门子常见：Word Swap）
   * reg1: 高地址
   * reg2: 低地址
   */
  export function parseInt32(reg1: number, reg2: number): number {
    // return (reg2 << 16) | reg1;
    return (reg1 << 16) | reg2;
  }
  
  /**
   * 32位浮点数解析（REAL）
   */
  export function parseFloat32(reg1: number, reg2: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
  
    // 西门子常见：字交换
    view.setUint16(0, reg2);
    view.setUint16(2, reg1);
  
    return view.getFloat32(0, false);
  }

  /**
   * 32位字节交换
   * 例如：测试   实际是 normal
   */

  export function testAllFormats(reg1: number, reg2: number) {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);

  // 1. 标准
  view.setUint16(0, reg1);
  view.setUint16(2, reg2);
  const normal = view.getUint32(0, false);

  // 2. word swap
  view.setUint16(0, reg2);
  view.setUint16(2, reg1);
  const wordSwap = view.getUint32(0, false);

  // 3. byte swap
  view.setUint16(0, ((reg1 & 0xff) << 8) | (reg1 >> 8));
  view.setUint16(2, ((reg2 & 0xff) << 8) | (reg2 >> 8));
  const byteSwap = view.getUint32(0, false);

  // 4. word + byte swap
  view.setUint16(0, ((reg2 & 0xff) << 8) | (reg2 >> 8));
  view.setUint16(2, ((reg1 & 0xff) << 8) | (reg1 >> 8));
  const allSwap = view.getUint32(0, false);

  return {
    normal,
    wordSwap,
    byteSwap,
    allSwap,
  };
}