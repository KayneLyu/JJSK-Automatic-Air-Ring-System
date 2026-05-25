import { Adb2Core } from '../core/adb2-core';
import { SystemParamIndex } from '../types';

export class ParamProtocol {
  constructor(private core: Adb2Core) {}

  async getParam(index: SystemParamIndex) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(index);
    return this.core.send('PG', [buf]);
  }

  async confirmReset() {
    return this.core.send('Pr');
  }
}