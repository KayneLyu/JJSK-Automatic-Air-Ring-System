import type { RingData } from '@jjsk/air-ring-server/connections/airRing/opcua.ts'
import { PLCConnector } from './PLC-S7.ts'

const UPPER_ROTATION_S7_ADDRESS_MAP = {
  ForwardRotation: 'DB7,X0.0',
  ReverseRotation: 'DB7,X0.1',
  ForwardDirectionChange: 'DB7,X0.2',
  ReverseDirectionChange: 'DB7,X0.3',
  Reset: 'DB7,X0.4',
  MotorFrequency: 'DB7,INT2.0',
  // Heats: process.env.UPPER_ROTATION_HEATS_ADDRESS,
} satisfies Partial<
  Record<keyof Omit<RingData, 'timestamp'>, string | undefined>
>

const upperRotationPlc = new PLCConnector('192.168.2.10')
let hasDefinedItems = false
let hasWarnedMissingAddressMap = false

const getDefinedItems = () => {
  return Object.fromEntries(
    Object.entries(UPPER_ROTATION_S7_ADDRESS_MAP).filter(([, address]) => {
      return typeof address === 'string' && address.trim().length > 0
    })
  ) as Record<string, string>
}

const normalizeUpperRotationData = (
  values: Record<string, unknown>,
  timestamp: number
): RingData => {
  const heatsValue = values.Heats

  return {
    timestamp,
    ForwardRotation:
      values.ForwardRotation === undefined
        ? undefined
        : Boolean(values.ForwardRotation),
    ReverseRotation:
      values.ReverseRotation === undefined
        ? undefined
        : Boolean(values.ReverseRotation),
    ForwardDirectionChange:
      values.ForwardDirectionChange === undefined
        ? undefined
        : Boolean(values.ForwardDirectionChange),
    ReverseDirectionChange:
      values.ReverseDirectionChange === undefined
        ? undefined
        : Boolean(values.ReverseDirectionChange),
    Reset: values.Reset === undefined ? undefined : Boolean(values.Reset),
    MotorFrequency:
      values.MotorFrequency === undefined
        ? undefined
        : Number(values.MotorFrequency),
    Heats:
      heatsValue === undefined || heatsValue === null
        ? undefined
        : [Number(heatsValue)],
  }
}

export async function readUpperRotationData(): Promise<RingData | null> {
  const definedItems = getDefinedItems()

  if (Object.keys(definedItems).length === 0) {
    if (!hasWarnedMissingAddressMap) {
      console.warn(
        '上旋 S7 地址映射未配置，已跳过 192.168.2.10 的上旋读取。请在 upperRotationReader.ts 中补充对应地址或设置环境变量。'
      )
      hasWarnedMissingAddressMap = true
    }

    return null
  }

  if (!hasDefinedItems) {
    upperRotationPlc.defineItems(definedItems)
    hasDefinedItems = true
  }

  const values = await upperRotationPlc.readAll()
  return normalizeUpperRotationData(values, Date.now())
}

export function disconnectUpperRotationReader() {
  upperRotationPlc.disconnect()
  hasDefinedItems = false
}
