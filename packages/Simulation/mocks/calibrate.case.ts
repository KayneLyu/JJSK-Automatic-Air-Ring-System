import { startServer as StartThicknessServer } from '../servers/thickness/opcua'
import { startServer as StartAirRingServer } from '../servers/airRing/opcua'
import { mockUpperRotation } from './upperRotation.mock'
import { mockThickness } from './thickness.mock'
import { mockRoller } from './roller.mock'
/**
 * 标定
 * */
export const calibrateCase = async () => {
  const { updateVariables: updateThicknessVer } = await StartThicknessServer()
  const { updateVariables: updateAirRingVer } = await StartAirRingServer()
  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: thicknessNext } = mockThickness({})
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  // 每 10ms 秒更新一次数据
  setInterval(() => {
    const upperRotationValues = upperRotationNext()
    updateAirRingVer(upperRotationValues)
    const thicknessGaugeValue = thicknessNext()
    const rollerValue = rollerNext()
    updateThicknessVer({
      ...thicknessGaugeValue,
      ...rollerValue,
    })
  }, 10)
}
