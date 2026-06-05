// command-dispatcher.ts
import { crc8 } from './crc8';
import { encode } from './frame-codec';
import { CommandDef } from './commands';
import { EventEmitter } from 'events';

interface Transaction {
  id: number;
  command: CommandDef;
  data?: Buffer;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  retries: number;
}

export class CommandDispatcher extends EventEmitter {
  private queue: Transaction[] = [];
  private current: Transaction | null = null;
  private multiGroup: Transaction[] | null = null; // 打包模式下等待的组
  private sendHandler: ((buf: Buffer) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private seqId = 0;

  onSend(handler: (buf: Buffer) => void) { this.sendHandler = handler; }
  onDisconnect(handler: () => void) { this.disconnectHandler = handler; }

  /** 普通单条指令 */
  execute(cmd: CommandDef, data?: Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      const t: Transaction = {
        id: ++this.seqId,
        command: cmd,
        data,
        resolve,
        reject,
        timer: setTimeout(() => this.onTimeout(t), 1000),
        retries: 0,
      };
      this.queue.push(t);
      this.processNext();
    });
  }

  /** 打包多条指令一起发送，全部收到后 resolve */
  executeMulti(commands: Array<{ cmd: CommandDef; data?: Buffer }>): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const trans = commands.map(({ cmd, data }) => ({
        id: ++this.seqId,
        command: cmd,
        data,
        resolve: null as any, // 由多组事务统一 resolve
        reject: null as any,
        timer: null as any,
        retries: 0,
      }));
      // 将多组指令作为一个整体，包装成一个“打包事务”
      this.multiGroup = trans;
      // 为每个子事务设置单个解析，但实际由多事务整体控制
      trans.forEach(t => {
        t.timer = setTimeout(() => this.onTimeout(t), 1000);
      });
      // 整体 Promise 将被 multiGroup 的完成回调解决
      this.queue.push(...trans);
      this.processNext();
    });
  }

  handleResponse(packet: Buffer) {
    const prefix = this.current?.command.prefix;
    if (!prefix) return;

    // 与当前事务前缀匹配（忽略 B0）
    if (packet.length >= 1 + prefix.length &&
        Buffer.from(packet.subarray(1, 1 + prefix.length)).equals(prefix)) {
      clearTimeout(this.current!.timer);
      let result: any = undefined;
      const dataOffset = 1 + prefix.length;
      if (this.current!.command.parse) {
        result = this.current!.command.parse(packet.subarray(dataOffset));
      } else if (this.current!.command.resDataLen) {
        result = packet.subarray(dataOffset, dataOffset + this.current!.command.resDataLen);
      }
      this.current!.resolve(result);
      this.current = null;
      this.processNext();
      return;
    }

    // 检查是否属于当前打包组（多命令响应）
    if (this.multiGroup) {
      for (const t of this.multiGroup) {
        const pfx = t.command.prefix;
        if (packet.length >= 1 + pfx.length &&
            Buffer.from(packet.subarray(1, 1 + pfx.length)).equals(pfx)) {
          clearTimeout(t.timer);
          let result: any = undefined;
          const dataOffset = 1 + pfx.length;
          if (t.command.parse) {
            result = t.command.parse(packet.subarray(dataOffset));
          } else if (t.command.resDataLen) {
            result = packet.subarray(dataOffset, dataOffset + t.command.resDataLen);
          }
          // 标记已完成
          (t as any)._result = result;
          // 检查是否全部完成
          if (this.multiGroup!.every(t => (t as any)._result !== undefined)) {
            const results = this.multiGroup!.map(t => (t as any)._result);
            this.multiGroup = null;
            this.current?.resolve(results); // 注意：这里的 current 应是多组事务的 promise
            this.current = null;
            this.processNext();
          }
          return;
        }
      }
    }

    // R+N 主动推送事件处理（前缀 "RN"）
    if (packet.length >= 3 && packet[1] === 0x52 && packet[2] === 0x4E) {
      const sysTick = packet[0] & 0x7f;
      const status = packet[3]; // 1字节状态
      const serial = packet.readUInt32LE(4); // 4字节 serial
      this.emit('runResult', { sysTick, status, serial });
    }
  }

  private processNext() {
    if (this.current) return;
    if (this.queue.length === 0) return;

    // 如果下一批是打包组
    if (this.multiGroup && this.queue[0] === this.multiGroup[0]) {
      // 发送所有打包指令
      const allBufs: Buffer[] = [];
      for (const t of this.multiGroup) {
        const frame = this.buildFrame(t.command, t.data);
        allBufs.push(frame);
      }
      const combined = Buffer.concat(allBufs);
      this.sendHandler?.(combined);
      // 将当前事务设为一个占位，表示打包组正在等待
      this.current = this.multiGroup[0]; // 借用第一个事务作为占位
      // 注意：打包组不设置整体超时，由单条超时处理
    } else {
      const t = this.queue.shift()!;
      this.current = t;
      const frame = this.buildFrame(t.command, t.data);
      this.sendHandler?.(frame);
    }
  }

  private buildFrame(cmd: CommandDef, data?: Buffer): Buffer {
    const prefix = cmd.prefix;
    const payload = data ? Buffer.concat([prefix, data]) : prefix;
    const b0 = Buffer.from([0x80]); // PT=1
    const raw = Buffer.concat([b0, payload]);
    const crc = crc8(raw);
    return encode(Buffer.concat([raw, Buffer.from([crc])]));
  }

  private onTimeout(t: Transaction) {
    // 清理已超时的
    if (t.retries >= 2) {
      // 失败，断开
      clearTimeout(t.timer);
      if (this.current === t) this.current = null;
      if (this.multiGroup && this.multiGroup.includes(t)) this.multiGroup = null;
      t.reject(new Error('Command timeout'));
      this.disconnectHandler?.();
    } else {
      t.retries++;
      // 重发
      const frame = this.buildFrame(t.command, t.data);
      this.sendHandler?.(frame);
    }
  }

  reset() {
    this.queue.forEach(t => {
      clearTimeout(t.timer);
      t.reject(new Error('Connection reset'));
    });
    this.queue = [];
    this.current = null;
    this.multiGroup = null;
  }
}