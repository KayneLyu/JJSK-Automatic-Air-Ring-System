import { formateResult, postRequest } from '@/utils/axios';

/**
 * 获取当前1幅数据
 * id <= 0 当前数据 / null
*/
export const getFrame = (params: { id: Number } | null) => {
    return formateResult<IFrameData>(postRequest("/api/thk/getFrame", params))
}

/**
 * 开始测量
 */
export const startMeasuring = () => {
    return formateResult(postRequest("/api/thk/scan"))
}

/**
 * 停止测量
 */
export const stopMeasuring = () => {
    return formateResult(postRequest("/api/thk/stop"))
}

/**
 * 归边
 */
export const toTheEdge = () => {
    return formateResult(postRequest("/api/thk/org"))
}

/**
 * 轮询数据
 */
export const getThickInfo = () => {
    return formateResult<IThickInfoData>(postRequest("/api/thk/getInfo"))
}

/**
 * 设置热量
 */
export const setAutoRingHeats = (params: number[]) => {
    return formateResult(postRequest("/api/airRing/setHeats", params))
}

/**
 *获取热量
 */
export const getHeats = () => {
    return formateResult<number[]>(postRequest("/api/airRing/getHeats"))
}

/**
 * 设置自动加热
 */
export const setAutoHeats = (params: boolean) => {
    return formateResult(postRequest("/api/airRing/setIsAuto", params))
}
/**
 * 复位加热量
 */
export const resetHeatsApi = () => {
    return formateResult(postRequest("/api/airRing/resetHeats"))
}

/**
 * 获取损坏的加热棒
 */
export const getBadHeats = () => {
    return formateResult<boolean[]>(postRequest("/api/airRing/getBads"))
}

/**
 * 开启/停止检测动作
 */
export const setCheckEnable = (params: string) => {
    return formateResult(postRequest("/api/airRing/setCheckEnable", params))
}


/**
 * 设置放大倍数
 */
export const magnification = (params: number) => {
    return formateResult(postRequest("/api/thk/setK", params))
}

/**
 * 获取测厚仪报警列表
 */
export const getThickWarningList = () => {
    return formateResult<IWarningList[]>(postRequest("/api/thk/getWarningList"))
}

/**
 * 获取风环报PLC警列表
 */
export const getAirRingWarningList = () => {
    return formateResult<IWarningList[]>(postRequest("/api/airRing/getWarningList"))
}

/**
 *  清空测厚仪报警列表
 */
export const clearThickWarningList = () => {
    return formateResult(postRequest("/api/thk/resetErrCode"))
}

/**
 * 清空风环PLC报警列表
 */
export const clearAirRingWarningList = () => {
    return formateResult(postRequest("/api/airRing/resetErrCode"))
}

/**
 * 获取风环基础配置
 */
export const getAirRingConfig = () => {
    return formateResult<IAirRingParams>(postRequest("/api/airRing/getParam"))
}

/**
 *  实时厚度数据
 */
export const UploadThickness = () => {
    return formateResult<{ D: Array<number | string>}>(postRequest("/api/thk/getTempFrame"))
}

/**
 * 风环状态数据
 */
export const getAirRingInfo = () => {
    return formateResult<IAirRingInfo>(postRequest("/api/airRing/getInfo"))
}

