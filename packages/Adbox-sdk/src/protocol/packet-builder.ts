import { crc8 } from './crc8'
import { escapeBuffer } from './escape'

export function buildPacket(payload: Buffer) {

  const crc = crc8(payload)

  const body = Buffer.concat([
    payload,
    Buffer.from([crc])
  ])

  const escaped = escapeBuffer(body)

  return Buffer.concat([
    Buffer.from([0x7e]),
    escaped,
    Buffer.from([0x7e])
  ])
}