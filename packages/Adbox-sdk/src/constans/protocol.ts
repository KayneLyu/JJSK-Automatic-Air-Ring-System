export const CMD = {
  // ================= IO =================
  GET_INPUT: 'IGI',
  GET_OUTPUT: 'IGO',
  GET_POS0: 'IGP0',
  GET_POS1: 'IGP1',
  GET_POS_ALL: 'IGPA',
  GET_TICK: 'IT',
  SET_OUTPUT: 'ISO',

  // ================= 运动设置 =================
  SET_AXIS: 'RPA',
  SET_PROFILE: 'RPP',
  SET_SPEED: 'RPV',
  SET_START_SPEED: 'RPS',
  SET_ACC_TIME: 'RPU',
  SET_DEC_TIME: 'RPD',
  SET_HOME_SPEED1: 'RP1',
  SET_HOME_SPEED2: 'RP2',

  // ================= 运动读取 =================
  GET_SPEED: 'RpV',
  GET_START_SPEED: 'RpS',
  GET_ACC_TIME: 'RpU',
  GET_DEC_TIME: 'RpD',
  GET_HOME_SPEED1: 'Rp1',
  GET_HOME_SPEED2: 'Rp2',

  // ================= 运动控制 =================
  MOVE: 'RR',
  STOP_DECEL: 'RS',
  STOP_EMERGENCY: 'RT',
  FORWARD: 'RF',
  BACKWARD: 'RB',
  HOME: 'RO',
  GET_RESULT: 'RN',

  // ================= 参数 =================
  PARAM_SET_SAVED: 'PS',
  PARAM_SET_TEMP: 'Ps',
  PARAM_GET_SAVED: 'PG',
  PARAM_GET_TEMP: 'Pg',
  PARAM_RESET: 'PR',
  RESET_CONFIRM: 'Pr',
} as const;