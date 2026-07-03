export * from './RingBuffer'

import { RollerScalar } from '../types'

/**
 * 获取周长
 * */
export const getCircumference = (options: RollerScalar) => {
  if ('CIRCUMFERENCE' in options) {
    return options.CIRCUMFERENCE
  }
  if ('DIAMETER' in options) {
    return Math.PI * options.DIAMETER
  }
  if ('RADIUS' in options) {
    return 2 * Math.PI * options.RADIUS
  }
  throw new Error('Circumference options must be greater than 0')
}
