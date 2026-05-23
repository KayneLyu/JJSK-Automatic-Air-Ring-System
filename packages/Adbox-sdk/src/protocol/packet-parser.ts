import { crc8 } from './crc8'
import { unescapeBuffer } from './escape'
import type { ADData } from '../types'

export function parsePacket(frame: Buffer): ADData | null {

  const raw = unescapeBuffer(frame)

  if (raw.length < 3) {
    return null
  }

  const payload = raw.subarray(0, raw.length - 1)

  const recvCRC = raw[raw.length - 1]

  const calcCRC = crc8(payload)

  if (recvCRC !== calcCRC) {

    console.error('CRC ERROR')

    return null
  }

  const b0 = payload[0]

  const pt = (b0 & 0x80) >> 7

  if (pt !== 0) {
    return null
  }

  const pn = b0 & 0x7f

  const dbm = payload[1]

  let offset = 2

  const data: ADData = {
    systick: pn,
    ad0: 0,
    reset: !!(dbm & 0x01)
  }

  data.ad0 = payload.readUInt16LE(offset)

  offset += 2

  if (dbm & 0x08) {

    data.ad1 = payload.readUInt16LE(offset)

    offset += 2
  }

  if (dbm & 0x40) {

    data.encoder0 = payload.readUInt16LE(offset)

    offset += 2
  }

  if (dbm & 0x20) {

    data.encoder1 = payload.readUInt16LE(offset)

    offset += 2
  }

  if (dbm & 0x80) {

    data.inputs = payload.readUInt16LE(offset)

    offset += 4
  }

  if (dbm & 0x10) {

    data.outputs = payload.readUInt16LE(offset)

    offset += 2
  }

  return data
}