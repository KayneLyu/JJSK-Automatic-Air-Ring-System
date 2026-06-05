import { EventEmitter } from 'events';
import { CommandDef } from './commands';
import { crc8 } from './protocol/crc8';
import { encode7E } from './protocol/codec';

export interface PendingRequest {
  resolve: (resp: Buffer) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  retries: number;
  expectedPrefix: Buffer;
  commandData: Buffer; // 完整数据（不含B0）
}

export class CommandDispatcher extends EventEmitter {
  private pending: PendingRequest[] = [];
  private current: PendingRequest | null = null;
  private sendHandler: ((data: Buffer) => void) | null = null;
  private timeout = 1000;    // 默认1秒
  private maxRetries = 2;    // 重试2次，共3次发送
  public debug = false;

  /** 设置底层发送函数 */
  setSendHandler(handler: (data: Buffer) => void) {
    this.sendHandler = handler;
  }

  /** 配置超时和重试次数 */
  configure(timeout: number, maxRetries: number) {
    this.timeout = timeout;
    this.maxRetries = maxRetries;
  }

  /** 执行一条指令（自动加入队列） */
  execute<T>(def: CommandDef, data?: Buffer, customParser?: (payload: Buffer) => T): Promise<T> {
    const cmd = data ? Buffer.concat([def.prefix, data]) : def.prefix;
    return new Promise<T>((resolve, reject) => {
      const req: PendingRequest = {
        resolve: (payload: Buffer) => {
          try {
            if (def.responseDataLen !== undefined && def.responseDataLen > 0) {
              const dataStart = 1 + def.prefix.length;
              const data = payload.subarray(dataStart, dataStart + def.responseDataLen);
              if (def.parse) resolve(def.parse(data));
              else if (customParser) resolve(customParser(data));
              else resolve(undefined as unknown as T);
            } else {
              resolve(undefined as unknown as T); // 无数据成功
            }
          } catch (err) {
            reject(err);
          }
        },
        reject,
        timer: setTimeout(() => {}, 0),
        retries: 0,
        expectedPrefix: def.prefix,
        commandData: cmd,
      };
      this.pending.push(req);
      if (this.debug) console.log('[Dispatcher] enqueue', def.prefix.toString());
      this.processNext();
    });
  }

  /** 处理收到的功能包 (已去除CRC，包含B0) */
  handleResponse(payload: Buffer) {
    // 忽略空包
    if (payload.length < 2) return;

    // 检查当前事务
    if (this.current && this.matchPrefix(payload, this.current.expectedPrefix)) {
      clearTimeout(this.current.timer);
      this.current.resolve(payload);
      this.current = null;
      if (this.debug) console.log('[Dispatcher] matched current');
      this.processNext();
      return;
    }

    // 检查队列中的其他事务
    for (let i = 0; i < this.pending.length; i++) {
      if (this.matchPrefix(payload, this.pending[i].expectedPrefix)) {
        const req = this.pending.splice(i, 1)[0];
        clearTimeout(req.timer);
        req.resolve(payload);
        if (this.debug) console.log('[Dispatcher] matched pending');
        return;
      }
    }

    // 未匹配任何请求，可能是主动推送的事件（如RN）
    if (payload.length >= 3 && payload[1] === 0x52 && payload[2] === 0x4E) {
      this.emit('rnPush', payload);
    }
  }

  /** 清空所有等待中的事务 */
  reset(reason: string) {
    const err = new Error(reason);
    this.pending.forEach(r => { clearTimeout(r.timer); r.reject(err); });
    this.pending = [];
    if (this.current) {
      clearTimeout(this.current.timer);
      this.current.reject(err);
      this.current = null;
    }
  }

  // --- 内部方法 ---
  private processNext() {
    if (this.current) return;
    if (this.pending.length === 0) return;
    const next = this.pending.shift()!;
    this.current = next;
    this.sendRaw(next);
  }

  private sendRaw(req: PendingRequest, retry = 0) {
    if (!this.sendHandler) {
      req.reject(new Error('No send handler'));
      this.current = null;
      this.processNext();
      return;
    }
    // 构建完整帧：B0(0x80) + 命令数据
    const b0 = Buffer.from([0x80]);
    const fullCmd = Buffer.concat([b0, req.commandData]);
    const crc = crc8(fullCmd);
    const wire = encode7E(Buffer.concat([fullCmd, Buffer.from([crc])]));
    this.sendHandler(wire);

    // 设置超时
    req.timer = setTimeout(() => {
      if (this.current === req) {
        if (req.retries < this.maxRetries) {
          req.retries++;
          if (this.debug) console.log(`[Dispatcher] retry ${req.retries} for`, req.expectedPrefix.toString());
          this.sendRaw(req, req.retries);
        } else {
          const err = new Error(`Command timeout after ${this.maxRetries + 1} attempts`);
          if (this.debug) console.log('[Dispatcher] timeout final', err.message);
          this.current = null;
          req.reject(err);
          this.processNext();
        }
      }
    }, this.timeout);
  }

  private matchPrefix(payload: Buffer, prefix: Buffer): boolean {
    if (payload.length < prefix.length + 1) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (payload[i + 1] !== prefix[i]) return false;
    }
    return true;
  }
}