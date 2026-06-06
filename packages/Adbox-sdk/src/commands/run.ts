import { Buffer } from 'buffer';

export class RunCommands {
  // ---------- 参数设置 ----------
  static setSpeed(velocity: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(velocity, 0);
    return { cmd: Buffer.concat([Buffer.from('RPV'), buf]), expectedPrefix: Buffer.from('RPV') };
  }

  static setInitSpeed(sv: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(sv, 0);
    return { cmd: Buffer.concat([Buffer.from('RPS'), buf]), expectedPrefix: Buffer.from('RPS') };
  }

  static setAccelTime(ms: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(ms, 0);
    return { cmd: Buffer.concat([Buffer.from('RPU'), buf]), expectedPrefix: Buffer.from('RPU') };
  }

  static setDecelTime(ms: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(ms, 0);
    return { cmd: Buffer.concat([Buffer.from('RPD'), buf]), expectedPrefix: Buffer.from('RPD') };
  }

  static setHomeSpeed1(speed: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(speed, 0);
    return { cmd: Buffer.concat([Buffer.from('RP1'), buf]), expectedPrefix: Buffer.from('RP1') };
  }

  static setHomeSpeed2(speed: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(speed, 0);
    return { cmd: Buffer.concat([Buffer.from('RP2'), buf]), expectedPrefix: Buffer.from('RP2') };
  }

  // ---------- 参数读取 ----------
  static getSpeed(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RpV'), expectedPrefix: Buffer.from('RpV') };
  }
  static getInitSpeed(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RpS'), expectedPrefix: Buffer.from('RpS') };
  }
  static getAccelTime(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RpU'), expectedPrefix: Buffer.from('RpU') };
  }
  static getDecelTime(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RpD'), expectedPrefix: Buffer.from('RpD') };
  }
  static getHomeSpeed1(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('Rp1'), expectedPrefix: Buffer.from('Rp1') };
  }
  static getHomeSpeed2(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('Rp2'), expectedPrefix: Buffer.from('Rp2') };
  }

  // ---------- 运动动作 ----------
  static moveToPosition(targetPos: number, serial: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const data = Buffer.alloc(1 + 4 + 4); // P(1) + pos(4) + serial(4)
    data.writeUInt8(0x50, 0); // 'P'
    data.writeInt32LE(targetPos, 1);
    data.writeInt32LE(serial, 5);
    return {
      cmd: Buffer.concat([Buffer.from('RR'), data]),
      expectedPrefix: Buffer.from('RR'),   // 前缀只有 "RR"
    };
  }

  static moveRelative(pulses: number, serial: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const sign = pulses >= 0 ? '+' : '-';
    const absVal = Math.abs(pulses);
    const data = Buffer.alloc(1 + 4 + 4);
    data.writeUInt8(sign === '+' ? 0x2B : 0x2D, 0); // '+' or '-'
    data.writeUInt32LE(absVal, 1);
    data.writeInt32LE(serial, 5);
    return {
      cmd: Buffer.concat([Buffer.from('RR'), data]),
      expectedPrefix: Buffer.from('RR'),
    };
  }

  static forward(serial: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const cmd = Buffer.alloc(2 + 4);
    cmd.write('RF', 0, 2, 'ascii');
    cmd.writeInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer.from('RF') };
  }

  static backward(serial: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const cmd = Buffer.alloc(2 + 4);
    cmd.write('RB', 0, 2, 'ascii');
    cmd.writeInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer.from('RB') };
  }

  static home(serial: number): { cmd: Buffer; expectedPrefix: Buffer } {
    const cmd = Buffer.alloc(2 + 4);
    cmd.write('RO', 0, 2, 'ascii');
    cmd.writeInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer.from('RO') };
  }

  static stopDecel(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RS'), expectedPrefix: Buffer.from('RS') };
  }

  static stopEmergency(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RT'), expectedPrefix: Buffer.from('RT') };
  }

  static getRunResult(): { cmd: Buffer; expectedPrefix: Buffer } {
    return { cmd: Buffer.from('RN'), expectedPrefix: Buffer.from('RN') };
  }
}