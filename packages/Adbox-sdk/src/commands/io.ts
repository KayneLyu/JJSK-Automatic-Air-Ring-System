import { Buffer } from 'buffer';

export class IOCommands {
  /**
   * 获取输入状态指令
   */
  static getInput(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('IGI'),
      expectedPrefix: Buffer.from('IGI'),
    };
  }

  /**
   * 获取输出状态指令
   */
  static getOutput(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('IGO'),
      expectedPrefix: Buffer.from('IGO'),
    };
  }

  /**
   * 设置输出端口
   * @param mask 位掩码
   * @param value 目标值（仅 mask 指定的位有效）
   */
  static setOutput(mask: number, value: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const cmd = Buffer.alloc(2 + 2 + 2); // "ISO" + mask(2) + value(2)
    cmd.write('ISO', 0, 3, 'ascii');
    cmd.writeUInt16LE(mask, 3);
    cmd.writeUInt16LE(value, 5);
    return { cmd, expectedPrefix: Buffer.from('ISO') };
  }

  /**
   * 获取编码器0 (32位)
   */
  static getPos0(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('IGP0'),
      expectedPrefix: Buffer.from('IGP0'),
    };
  }

  /**
   * 获取编码器1 (32位)
   */
  static getPos1(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('IGP1'),
      expectedPrefix: Buffer.from('IGP1'),
    };
  }

  /**
   * 获取双编码器
   */
  static getPosAll(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('IGPA'),
      expectedPrefix: Buffer.from('IGPA'),
    };
  }

  /**
   * 获取系统 Tick
   */
  static getSystemTick(): { cmd: Buffer; expectedPrefix: Buffer } {
    return {
      cmd: Buffer.from('ST'),
      expectedPrefix: Buffer.from('ST'),
    };
  }
}