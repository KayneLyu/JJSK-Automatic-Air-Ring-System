import type { RollerDevice, ThicknessDevice } from '@jjsk/core'

export type ThicknessData = {
  timestamp?: number
} & RollerDevice & ThicknessDevice

export interface ThicknessBatchData {
  adValues: number[]
  pulses: number[]
  timestamps: number[]
}

