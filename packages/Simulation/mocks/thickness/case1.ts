import { startServer } from '../../servers/thickness/opcua'
import Simulator from './signal'

/**
 * 数据模拟样本1
 * */
export const case1 = async () => {
  const { updateVariables } = await startServer()
  const simulator = new Simulator()
  // 每 10ms 秒更新一次数据
  setInterval(() => {
    const values = simulator.updateTick()
    updateVariables(values)
  }, 10)
}
