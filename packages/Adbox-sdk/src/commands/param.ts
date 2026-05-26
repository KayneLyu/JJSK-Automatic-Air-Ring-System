import { Buffer } from 'buffer';

export class ParamCommands {
  /**
   * 读取保存的参数
   * @param index 参数索引 (0~4)
   */
  static getSavedParam(index: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const idxBuf = Buffer.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    return { cmd: Buffer.concat([Buffer.from('PG'), idxBuf]), expectedPrefix: Buffer.from('PG') };
  }

  /**
   * 设置保存的参数（写入 Flash）
   */
  static setSavedParam(index: number, value: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const idxBuf = Buffer.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    const valBuf = Buffer.alloc(4);
    valBuf.writeUInt32LE(value, 0);
    return { cmd: Buffer.concat([Buffer.from('PS'), idxBuf, valBuf]), expectedPrefix: Buffer.from('PS') };
  }

  /**
   * 读取临时参数（不保存）
   */
  static getTempParam(index: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const idxBuf = Buffer.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    return { cmd: Buffer.concat([Buffer.from('Pg'), idxBuf]), expectedPrefix: Buffer.from('Pg') };
  }

  /**
   * 设置临时参数
   */
  static setTempParam(index: number, value: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const idxBuf = Buffer.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    const valBuf = Buffer.alloc(4);
    valBuf.writeUInt32LE(value, 0);
    return { cmd: Buffer.concat([Buffer.from('Ps'), idxBuf, valBuf]), expectedPrefix: Buffer.from('Ps') };
  }

  /**
   * 应用参数（使设置生效）
   */
  static applyParams(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('PA'), expectedPrefix: Buffer.from('PA') };
  }

  /**
   * 软件复位
   * @param seconds 延迟秒数后停止喂狗
   */
  static softReset(seconds: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const cmd = Buffer.alloc(3 + 1 + 5); // "PR" + sec + "reset"
    cmd.write('PR', 0, 2, 'ascii');
    cmd.writeUInt8(seconds, 2);
    cmd.write('reset', 3, 5, 'ascii');
    return { cmd, expectedPrefix: Buffer.from('PR') };
  }

  /**
   * 清除复位标志位（通知上位机已知道重启）
   */
  static clearResetFlag(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('Pr'), expectedPrefix: Buffer.from('Pr') };
  }
}