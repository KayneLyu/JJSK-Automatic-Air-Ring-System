// data-parser.ts
export interface DataFrame {
    sysTick: number;    // 低7位，来自B0
    ad: number;         // AD0 (16-bit)
    pos0?: number;      // ENC1 (16-bit)
    pos0_small?: number;// ENC2 (16-bit)
    in?: number;
    inChange?: number;
    out?: number;
    ad2?: number;
    reset: boolean;
  }
  
  export function parseDataPacket(packet: Buffer): DataFrame | null {
    if (packet.length < 4) return null; // B0 + B1 + AD0
  
    const b0 = packet[0];
    const sysTick = b0 & 0x7f;
    const dbm = packet[1];
    const reset = !!(dbm & 0x01);
  
    let offset = 2;
    const ad = packet.readUInt16LE(offset);
    offset += 2;
  
    const frame: DataFrame = { sysTick, ad, reset };
  
    // 校验长度：根据 DBM 累加，确保数据足够
    let expectedLen = 4;
    if (dbm & 0x80) expectedLen += 4; // In + InChange
    if (dbm & 0x40) expectedLen += 2; // POS0
    if (dbm & 0x20) expectedLen += 2; // pos0
    if (dbm & 0x10) expectedLen += 2; // Out
    if (dbm & 0x08) expectedLen += 2; // AD2
    if (expectedLen > packet.length) return null;
  
    try {
      if (dbm & 0x80) {
        frame.in = packet.readUInt16LE(offset);
        frame.inChange = packet.readUInt16LE(offset + 2);
        offset += 4;
      }
      if (dbm & 0x40) {
        frame.pos0 = packet.readUInt16LE(offset);
        offset += 2;
      }
      if (dbm & 0x20) {
        frame.pos0_small = packet.readUInt16LE(offset);
        offset += 2;
      }
      if (dbm & 0x10) {
        frame.out = packet.readUInt16LE(offset);
        offset += 2;
      }
      if (dbm & 0x08) {
        frame.ad2 = packet.readUInt16LE(offset);
        offset += 2;
      }
    } catch {
      return null;
    }
    return frame;
  }