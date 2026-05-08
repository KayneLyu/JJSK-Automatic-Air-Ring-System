import type { UpperRotationDevice } from '@jjsk/core'
export type RingData = {
  timestamp?: number
} & UpperRotationDevice & {
  /**
   * 风环热量
   * */
  Heats?: number[]
}
