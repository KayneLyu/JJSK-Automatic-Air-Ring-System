import { Buffer } from 'buffer';

const ascii = (s: string) => Buffer.from(s, 'ascii');
const u16le = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32le = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const i32le = (v: number) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };

export interface CommandDef {
  prefix: Buffer;                     // 命令前缀（不带B0）
  responseDataLen?: number;           // 响应数据长度（不含B0+前缀），无数据时设为0
  parse?: (data: Buffer) => any;      // 可选解析器
}

function paramPrefix(cmd: string, index: number): Buffer {
  return Buffer.concat([ascii(cmd), u16le(index)]);
}

export const Commands = {
  // IO
  GET_IN:          { prefix: ascii('IGI'),  responseDataLen: 2, parse: (d: Buffer) => d.readUInt16LE(0) },
  GET_OUT:         { prefix: ascii('IGO'),  responseDataLen: 2, parse: (d: Buffer) => d.readUInt16LE(0) },
  GET_POS0:        { prefix: ascii('IGP0'), responseDataLen: 4, parse: (d: Buffer) => d.readInt32LE(0) },
  GET_POS1:        { prefix: ascii('IGP1'), responseDataLen: 4, parse: (d: Buffer) => d.readInt32LE(0) },
  GET_POS_ALL:     { prefix: ascii('IGPA'), responseDataLen: 8, parse: (d: Buffer) => ({ pos0: d.readInt32LE(0), pos1: d.readInt32LE(4) }) },
  SET_OUT:         { prefix: ascii('ISO'),  responseDataLen: 0 }, // 无数据
  GET_TICK:        { prefix: ascii('ST'),   responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },

  // 设置运行参数 (无数据响应)
  SET_V:   { prefix: ascii('RPV'), responseDataLen: 0 },
  SET_SV:  { prefix: ascii('RPS'), responseDataLen: 0 },
  SET_ACC: { prefix: ascii('RPU'), responseDataLen: 0 },
  SET_DEC: { prefix: ascii('RPD'), responseDataLen: 0 },
  SET_H1:  { prefix: ascii('RP1'), responseDataLen: 0 },
  SET_H2:  { prefix: ascii('RP2'), responseDataLen: 0 },

  // 读取运行参数
  GET_V:   { prefix: ascii('RpV'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },
  GET_SV:  { prefix: ascii('RpS'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },
  GET_ACC: { prefix: ascii('RpU'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },
  GET_DEC: { prefix: ascii('RpD'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },
  GET_H1:  { prefix: ascii('Rp1'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },
  GET_H2:  { prefix: ascii('Rp2'), responseDataLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) },

  // 运行动作 (无数据响应)
  FORWARD:   { prefix: ascii('RF'), responseDataLen: 0 },
  BACKWARD:  { prefix: ascii('RB'), responseDataLen: 0 },
  HOME:      { prefix: ascii('RO'), responseDataLen: 0 },
  STOP:      { prefix: ascii('RS'), responseDataLen: 0 },
  ESTOP:     { prefix: ascii('RT'), responseDataLen: 0 },
  MOVE_ABS:  { prefix: ascii('RR'), responseDataLen: 0 }, // 数据段手动拼接
  MOVE_REL:  { prefix: ascii('RR'), responseDataLen: 0 },

  GET_RUN_RESULT: { prefix: ascii('RN'), responseDataLen: 5, parse: (d: Buffer) => ({ status: d[0], serial: d.readUInt32LE(1) }) },

  // 系统参数
  GET_PARAM: (index: number): CommandDef => ({
    prefix: paramPrefix('PG', index),
    responseDataLen: 4,
    parse: (d: Buffer) => d.readUInt32LE(0),
  }),
  SET_PARAM: (index: number): CommandDef => ({
    prefix: paramPrefix('PS', index),
    responseDataLen: 0,
  }),
  APPLY_PARAM:   { prefix: ascii('PA'), responseDataLen: 0 },
  SOFT_RESET:    { prefix: ascii('PR'), responseDataLen: 0 },
  CLEAR_RESET:   { prefix: ascii('Pr'), responseDataLen: 0 },
};