import { Adb2Core } from '../core/adb2-core';

export class IoProtocol {
  constructor(private core: Adb2Core) {}

  async getInput() {
    return this.core.send('IGI');
  }

  async getOutput() {
    return this.core.send('IGO');
  }

  async getPos0() {
    return this.core.send('IGP0');
  }

  async getPos1() {
    return this.core.send('IGP1');
  }

  async setOutput(mask: number, value: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(mask, 0);
    buf.writeUInt16BE(value, 2);
    return this.core.send('ISO', [buf]);
  }
}