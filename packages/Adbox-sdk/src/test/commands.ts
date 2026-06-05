// commands.ts
export interface CommandDef {
    prefix: Buffer;      // 发送时的命令前缀（如 "IGI" -> [0x49,0x47,0x49]）
    resDataLen?: number; // 响应数据长度（不含 B0 和前缀），0 表示无数据
    parse?: (data: Buffer) => any;
  }
  
  function strToBuf(str: string): Buffer {
    return Buffer.from(str, 'ascii');
  }
  
  // 针对系统参数，前缀 = 字符串 + 2字节索引（小端）
  function paramPrefix(cmd: string, index: number): Buffer {
    const idxBuf = Buffer.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    return Buffer.concat([strToBuf(cmd), idxBuf]);
  }
  
  export const CMD = {
    // I/O 指令
    GET_IN:            { prefix: strToBuf('IGI'), resDataLen: 2 },
    GET_OUT:           { prefix: strToBuf('IGO'), resDataLen: 2 },
    GET_POS0:          { prefix: strToBuf('IGP0'), resDataLen: 4 },
    GET_POS1:          { prefix: strToBuf('IGP1'), resDataLen: 4 },
    GET_POS_ALL:       { prefix: strToBuf('IGPA'), resDataLen: 8, parse: (d: Buffer) => ({ pos1: d.readInt32LE(0), pos2: d.readInt32LE(4) }) },
    SET_OUT:           { prefix: strToBuf('ISO') }, // 无返回数据
    GET_TICK:          { prefix: strToBuf('ST'),  resDataLen: 4 },
  
    // 设置运行参数
    SET_V:             { prefix: strToBuf('RPV') },
    SET_SV:            { prefix: strToBuf('RPS') },
    SET_ACC:           { prefix: strToBuf('RPU') },
    SET_DEC:           { prefix: strToBuf('RPD') },
    SET_HSPD1:         { prefix: strToBuf('RP1') },
    SET_HSPD2:         { prefix: strToBuf('RP2') },
  
    // 读取运行参数
    GET_V:             { prefix: strToBuf('RpV'), resDataLen: 4 },
    GET_SV:            { prefix: strToBuf('RpS'), resDataLen: 4 },
    GET_ACC:           { prefix: strToBuf('RpU'), resDataLen: 4 },
    GET_DEC:           { prefix: strToBuf('RpD'), resDataLen: 4 },
    GET_HSPD1:         { prefix: strToBuf('Rp1'), resDataLen: 4 },
    GET_HSPD2:         { prefix: strToBuf('Rp2'), resDataLen: 4 },
  
    // 运行动作
    FORWARD:           { prefix: strToBuf('RF') },
    BACKWARD:          { prefix: strToBuf('RB') },
    HOME:              { prefix: strToBuf('RO') },
    STOP:              { prefix: strToBuf('RS') },
    ESTOP:             { prefix: strToBuf('RT') },
    MOVE_ABS:          { prefix: strToBuf('RR') }, // 数据段：'P' + pos(4B) + serial(4B)
  
    // 系统参数（读写）
    GET_PARAM_SAVE:    (ind: number): CommandDef => ({ prefix: paramPrefix('PG', ind), resDataLen: 4 }),
    SET_PARAM_SAVE:    (ind: number): CommandDef => ({ prefix: paramPrefix('PS', ind) }),
    APPLY_PARAM:       { prefix: strToBuf('PA') },
  
    // 复位
    RESET_SYSTEM:      { prefix: strToBuf('PR') },
    CLEAR_RESET:       { prefix: strToBuf('Pr') },
  };