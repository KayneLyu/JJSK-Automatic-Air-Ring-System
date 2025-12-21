import { test } from 'vitest'
import { calibrateCase } from '@jjsk/simulation'
import { OPCUAController } from './opcua'

test('测试标定算法', async () => {
  await calibrateCase()
  const { sysCalibrate } = OPCUAController({
    airRingUrl: 'opc.tcp://localhost:4344',
    thicknessUrl: 'opc.tcp://localhost:4334',
    config: {
      roller: {
        numCycles: 10,
      },
      upperRotation: {},
    },
  })
  await sysCalibrate()
}, 1000_000)
