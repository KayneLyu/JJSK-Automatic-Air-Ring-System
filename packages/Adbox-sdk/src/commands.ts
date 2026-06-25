const ascii = (s: string) => Buffer.from(s, 'ascii');
const u16le = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };

export interface CommandDef {
  prefix: Buffer;               // 发送时的命令前缀
  responseTotalLen?: number;    // 响应总长度（含B0+prefix+数据），用于校验
  parse?: (data: Buffer) => any; // 从prefix之后的数据开始解析
}

// 系统参数命令辅助
function paramPrefix(cmd: string, index: number): Buffer {
  return Buffer.concat([ascii(cmd), u16le(index)]);
}

export const Commands = {
  // IO
  GET_IN: {
    prefix: ascii('IGI'),
    responseTotalLen: 2,
    parse: (d: Buffer) => d.readUInt16LE(0),
  } as CommandDef,
  GET_OUT: {
    prefix: ascii('IGO'),
    responseTotalLen: 2,
    parse: (d: Buffer) => d.readUInt16LE(0),
  } as CommandDef,
  GET_POS0: {
    prefix: ascii('IGP0'),
    responseTotalLen: 4,
    parse: (d: Buffer) => d.readInt32LE(0),
  } as CommandDef,
  GET_POS1: {
    prefix: ascii('IGP1'),
    responseTotalLen: 4,
    parse: (d: Buffer) => d.readInt32LE(0),
  } as CommandDef,
  GET_POS_ALL: {
    prefix: ascii('IGPA'),
    responseTotalLen: 8,
    parse: (d: Buffer) => ({ pos0: d.readInt32LE(0), pos1: d.readInt32LE(4) }),
  } as CommandDef,
  SET_OUT: {
    prefix: ascii('ISO'),
    responseTotalLen: 0, // 无响应数据
  } as CommandDef,
  GET_TICK: {
    prefix: ascii('ST'),
    responseTotalLen: 4,
    parse: (d: Buffer) => d.readUInt32LE(0),
  } as CommandDef,

  // 设置运行参数
  SET_V:   { prefix: ascii('RPV'), responseTotalLen: 0 } as CommandDef,
  SET_SV:  { prefix: ascii('RPS'), responseTotalLen: 0 } as CommandDef,
  SET_ACC: { prefix: ascii('RPU'), responseTotalLen: 0 } as CommandDef,
  SET_DEC: { prefix: ascii('RPD'), responseTotalLen: 0 } as CommandDef,
  SET_H1:  { prefix: ascii('RP1'), responseTotalLen: 0 } as CommandDef,
  SET_H2:  { prefix: ascii('RP2'), responseTotalLen: 0 } as CommandDef,

  // 读取运行参数
  GET_V:   { prefix: ascii('RpV'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,
  GET_SV:  { prefix: ascii('RpS'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,
  GET_ACC: { prefix: ascii('RpU'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,
  GET_DEC: { prefix: ascii('RpD'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,
  GET_H1:  { prefix: ascii('Rp1'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,
  GET_H2:  { prefix: ascii('Rp2'), responseTotalLen: 4, parse: (d: Buffer) => d.readUInt32LE(0) } as CommandDef,

  // 运行动作
  FORWARD:   { prefix: ascii('RF'), responseTotalLen: 0 } as CommandDef,
  BACKWARD:  { prefix: ascii('RB'), responseTotalLen: 0 } as CommandDef,
  HOME:      { prefix: ascii('RO'), responseTotalLen: 0 } as CommandDef,
  STOP:      { prefix: ascii('RS'), responseTotalLen: 0 } as CommandDef,
  ESTOP:     { prefix: ascii('RT'), responseTotalLen: 0 } as CommandDef,
  MOVE_ABS:  { prefix: ascii('RR'), responseTotalLen: 0 } as CommandDef, // 数据段手动拼接 'P'+pos+serial
  GET_RUN_RESULT: {
    prefix: ascii('RN'),
    responseTotalLen: 5,
    parse: (d: Buffer) => ({ status: d[0], serial: d.readUInt32LE(1) }),
  } as CommandDef,

  // 系统参数
  GET_PARAM: (index: number): CommandDef => ({
    prefix: paramPrefix('PG', index),
    responseTotalLen: 4,
    parse: (d: Buffer) => d.readUInt32LE(0),
  }),
  SET_PARAM: (index: number): CommandDef => ({
    prefix: paramPrefix('PS', index),
    responseTotalLen: 0,
  }),
  APPLY_PARAM: { prefix: ascii('PA'), responseTotalLen: 0 } as CommandDef,
  SOFT_RESET: { prefix: ascii('PR'), responseTotalLen: 0 } as CommandDef,
  CLEAR_RESET: { prefix: ascii('Pr'), responseTotalLen: 0 } as CommandDef,
};