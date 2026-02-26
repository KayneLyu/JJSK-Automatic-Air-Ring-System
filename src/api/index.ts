import { postRequest } from '@/utils/axios';

/**
 * 获取当前1幅数据
 * id <= 0 当前数据 / null
*/
export const getFrame = (params: { Id: Number, Mix: number } | null) => {
    return postRequest<IFrameData>("/api/thk/getFrame", params)
}

/**
 * 开始测量
 */
export const startMeasuring = () => {
    return postRequest("/api/thk/scan")
}

/**
 * 停止测量
 */
export const stopMeasuring = () => {
    return postRequest("/api/thk/stop")
}

/**
 * 缩回
 */
export const backThick = () => {
    return postRequest("/api/thk/retract")
}

/**
 * 轮询数据
 */
export const getThickInfo = () => {
    return postRequest<IThickInfoData>("/api/thk/getInfo")
}

/**
 * 设置放大倍数
 */
export const magnification = (params: number) => {
    return postRequest("/api/thk/setK", params)
}

//  ----- 风环部分 -----  

/**
 * 设置热量
 */
export const setAutoRingHeats = (params: number[]) => {
    return postRequest("/api/airRing/setHeats", params)
}

/**
 *获取热量
 */
export const getHeats = () => {
    return postRequest<number[]>("/api/airRing/getHeats")
}

/**
 * 设置自动加热
 */
export const setAutoHeats = (params: boolean) => {
    return postRequest("/api/airRing/setIsAuto", params)
}
/**
 * 复位加热量
 */
export const resetHeatsApi = () => {
    return postRequest("/api/airRing/resetHeats")
}

/**
 * 获取损坏的加热棒
 */
export const getBadHeats = () => {
    return postRequest<boolean[]>("/api/airRing/getBads")
}

/**
 * 开启/停止检测动作
 */
export const setCheckEnable = (params: string) => {
    return postRequest("/api/airRing/setCheckEnable", params)
}

/**
 * 获取测厚仪报警列表
 */
export const getThickWarningList = () => {
    return postRequest<IWarningList[]>("/api/thk/getWarningList")
}

/**
 * 获取风环报PLC警列表
 */
export const getAirRingWarningList = () => {
    return postRequest<IWarningList[]>("/api/airRing/getWarningList")
}

/**
 *  清空测厚仪报警列表
 */
export const clearThickWarningList = () => {
    return postRequest("/api/thk/resetErrCode")
}

/**
 * 清空风环PLC报警列表
 */
export const clearAirRingWarningList = () => {
    return postRequest("/api/airRing/resetErrCode")
}

/**
 * 获取风环基础配置
 */
export const getAirRingConfig = () => {
    return postRequest<IAirRingParams>("/api/airRing/getParam")
}

/**
 *  实时厚度数据
 */
export const UploadThickness = () => {
    return postRequest<{ D: Array<number | string>}>("/api/thk/getTempFrame")
}

/**
 * 风环状态数据
 */
export const getAirRingInfo = () => {
    return postRequest<IAirRingInfo>("/api/airRing/getInfo")
}

