import ModbusTCPService from "./modbus";
import { swap16, parseInt32, testAllFormats } from "./parser";

/**
 * 读取全部数据（125寄存器）
 */
export async function readAllData() {
  const modbus = ModbusTCPService.getInstance();

  // 一次性读取125个寄存器
  const data = await modbus.readHoldingRegisters(100, 125);

  // =========================
  // 1️⃣ 前25个：16位 AD值
  // =========================
  const adValues: number[] = [];
  let times = null

  for (let i = 0; i < 25; i++) {
    const raw = data[i];

    // 高低字节交换  不用交换
    // const value = swap16(raw);

    adValues.push(raw);
  }

  // =========================
  // 2️⃣ 后100个：32位数据
  // =========================
  const values32: number[] = [];

  for (let i = 25; i < 125; i += 2) {
    const reg1 = data[i];
    const reg2 = data[i + 1];

    // 合成32位
    const value = parseInt32(reg1, reg2);
    times = testAllFormats(reg1, reg2)

    values32.push(value);
  }

  // =========================
  // 3️⃣ 按业务拆分
  // =========================
  return {
    adValues, // 25个

    // 前25个32位：时间戳（假设）
    pulses: values32.slice(0, 25),

    // 后25个32位：脉冲值
    timestamps: values32.slice(25, 50),
  };
}

