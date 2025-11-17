import { startServer as StartThicknessServer } from '../servers/thickness/opcua'
import { startServer as StartAirRingServer } from '../servers/airRing/opcua'
import { mockUpperRotation } from './upperRotation.mock'

/**
 * 标定
 * */
export const calibrateCase = async () => {
  const { updateVariables: updateThicknessVer } = await StartThicknessServer()
  const { updateVariables: updateAirRingVer } = await StartAirRingServer()
  const { next } = mockUpperRotation({ maxAngle: 330 })
  // 每 10ms 秒更新一次数据
  setInterval(() => {
    const values = next()
    updateAirRingVer(values)
  }, 10)
}
