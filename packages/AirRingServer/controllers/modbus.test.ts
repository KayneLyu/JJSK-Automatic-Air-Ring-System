import { expect, test } from 'vitest'
import { ModbusController } from './modbus'

test('modbus 控制器对外接口与 opcua 控制器一致', () => {
  const controller = ModbusController({
    airRingUrl: 'tcp://127.0.0.1:502',
    thicknessUrl: 'tcp://127.0.0.1:503',
    config: {
      roller: {
        numCycles: 10,
      },
      upperRotation: {},
    },
    standardized: {
      CHANNEL_COUNT: 48,
      THICKNESS_UNIT_PULSE_DIS: 0.1,
      ROLLER: {
        DIAMETER: 100,
      },
    },
  })

  expect(typeof controller.testConnect).toBe('function')
  expect(typeof controller.sysCalibrate).toBe('function')
  expect(typeof controller.autoAdjustment).toBe('function')
})

