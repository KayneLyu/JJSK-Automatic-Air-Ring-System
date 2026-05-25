import { Adb2Config } from './types';
import { TcpConnection } from './comm/tcp-client';
import { Adb2Core } from './core/adb2-core';
import { IoProtocol } from './protocol/io-protocol';
import { MotionProtocol } from './protocol/motion-protocol';
import { ParamProtocol } from './protocol/param-protocol';

export class Adb2Sdk {
  public io: IoProtocol;
  public motion: MotionProtocol;
  public param: ParamProtocol;

  private conn: TcpConnection;
  private core: Adb2Core;

  constructor(config: Adb2Config) {
    this.conn = new TcpConnection(config);
    this.core = new Adb2Core(this.conn);
    this.io = new IoProtocol(this.core);
    this.motion = new MotionProtocol(this.core);
    this.param = new ParamProtocol(this.core);
  }

  connect() {
    return this.conn.connect();
  }

  disconnect() {
    this.conn.disconnect();
  }

  onRealTime(cb: (data: any) => void) {
    this.core.on('realTime', cb);
  }
}