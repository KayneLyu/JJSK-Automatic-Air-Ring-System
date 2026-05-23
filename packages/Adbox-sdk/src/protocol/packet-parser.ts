import { crc8 } from './crc8'
import { unescapeBuffer } from './escape'

import type {
    ADData,
    CommandResponse
} from '../types'

/**
 *
 * 功能：
 * 1. CRC校验
 * 2. 动态包解析
 * 3. PT路由
 * 4. 边界保护
 * 5. 半包保护
 * 6. 错包保护
 * 7. PN提取
 * 8. 功能回复解析
 */

export type ParseResult =
    | {
        type: 'push'
        data: ADData
    }
    | {
        type: 'command'
        data: CommandResponse
    }

function ensureLength(
    buffer: Buffer,
    offset: number,
    size: number
) {

    return (
        offset + size <= buffer.length
    )
}

export function parsePacket(
    frame: Buffer
): ParseResult | null {

    try {

        /**
         * 7D转义恢复
         */
        const raw =
            unescapeBuffer(frame)

        /**
         * 最小长度:
         * B0 + CRC
         */
        if (raw.length < 2) {

            return null
        }

        /**
         * CRC
         */
        const payload =
            raw.subarray(0, raw.length - 1)

        const recvCRC =
            raw[raw.length - 1]

        const calcCRC =
            crc8(payload)

        if (recvCRC !== calcCRC) {

            return null
        }

        /**
         * B0
         */
        const b0 = payload[0]

        /**
         * PT
         */
        const pt =
            (b0 & 0x80) >> 7

        /**
         * 推送包
         */
        if (pt === 0) {

            const result =
                parsePushPacket(payload)

            if (!result) {
                return null
            }

            return {
                type: 'push',
                data: result
            }
        }

        /**
         * 功能回复包
         */
        const result =
            parseCommandPacket(payload)

        if (!result) {
            return null
        }

        return {
            type: 'command',
            data: result
        }

    } catch (err) {

        console.error(
            '[ADBOX PARSE ERROR]',
            err
        )

        return null
    }
}

/**
 * PT=0
 * 推送包解析
 */
function parsePushPacket(
    payload: Buffer
): ADData | null {

    /**
     * 至少:
     * B0 B1 AD0
     */
    if (payload.length < 4) {

        return null
    }

    const b0 = payload[0]

    const b1 = payload[1]

    /**
     * PN
     */
    const pn =
        b0 & 0x7f

    let offset = 2

    const data: ADData = {

        systick: pn,

        adChannels: [],

        reset:
            !!(b1 & 0x01)
    }

    /**
     * AD0
     * 当前协议里观测到永远存在
     */
    if (!ensureLength(payload, offset, 2)) {

        return null
    }

    data.adChannels.push(
        payload.readUInt16LE(offset)
    )

    offset += 2

    /**
     * AD1
     */
    if (b1 & 0x08) {

        if (
            !ensureLength(
                payload,
                offset,
                2
            )
        ) {

            return null
        }

        data.adChannels.push(
            payload.readUInt16LE(offset)
        )

        offset += 2
    }

    /**
     * OUTPUT
     */
    if (b1 & 0x10) {

        if (
            !ensureLength(
                payload,
                offset,
                2
            )
        ) {

            return null
        }

        data.outputs =
            payload.readUInt16LE(offset)

        offset += 2
    }

    /**
     * ENCODER1
     */
    if (b1 & 0x20) {

        if (
            !ensureLength(
                payload,
                offset,
                2
            )
        ) {

            return null
        }

        data.encoder1 =
            payload.readUInt16LE(offset)

        offset += 2
    }

    /**
     * ENCODER0
     */
    if (b1 & 0x40) {

        if (
            !ensureLength(
                payload,
                offset,
                2
            )
        ) {

            return null
        }

        data.encoder0 =
            payload.readUInt16LE(offset)

        offset += 2
    }

    /**
     * INPUTS
     * 16位状态 + 16位变化
     */
    if (b1 & 0x80) {

        if (
            !ensureLength(
                payload,
                offset,
                4
            )
        ) {

            return null
        }

        data.inputs =
            payload.readUInt16LE(offset)

        offset += 2

        data.inputChanges =
            payload.readUInt16LE(offset)

        offset += 2
    }

    return data
}

/**
 * PT=1
 * 功能回复包解析
 */
function parseCommandPacket(
    payload: Buffer
): CommandResponse | null {

    /**
     * 最小:
     * B0 + CMD
     */
    if (payload.length < 2) {

        return null
    }

    /**
     * 去掉B0
     */
    const body =
        payload.subarray(1)

    /**
     * ASCII命令
     */
    const ascii =
        body.toString('ascii')

    return {

        raw: payload,

        command: ascii,

        success: true,
        payload: body
    }
}