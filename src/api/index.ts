import { formateResult, postRequest, getRequest } from '@/utils/axios';

type IParams = {
    ajaxRequest: string;
    rpcFunction: string;
    jsonObject: string
}
/**
 * 获取测厚仪状态 
*/
// export const getFrame = (params: IParams) => {
//     return formateResult<IFrameData>(postRequest("http://127.0.0.1:8081/cgi/cgi.json", params))
// }

/**
 * 测量按钮 VDP
 * @param params 
 * @returns 
 */
export const setVDPButtonStatus = (params: IParams) => {
    return formateResult(postRequest("http://127.0.0.1:8090/cgi/cgi.json", params))
}

/**
 * 测量按钮 VDP
 * @param params 
 * @returns 
 */
export const setKPEButtonStatus = (params: IParams) => {
    return formateResult(postRequest("http://127.0.0.1:8081/cgi/cgi.json", params))
}

/**
 * 获取测厚基础数据 VDP
 * @param params 
 * @returns 
 */
export const getVDPBaseData = () => {
    return formateResult<IKunBaseData>(postRequest("http://127.0.0.1:8090/cgi/cgi.json", {
        ajaxRequest: 'jsonObjectRpc',
        rpcFunction: 'webRpcOverviewActuals',
        jsonObject: {}
    }))
}
/**
 * 获取测厚仪配置数据 VDP
 * @param params 
 * @returns 
 */
export const getVDPProcess = () => {
    return formateResult<IProcess>(postRequest("http://127.0.0.1:8090/cgi/cgi.json", {
        ajaxRequest: 'jsonObjectRpc',
        rpcFunction: 'webRpcGetSvValues',
        jsonObject: '{"targetStateText": "", "actualStateText": "", "rotActive": 0, "radMoveActive": 0, "actThickness": 0, "actPosition": 0, "actRotTime": 0, "avgTDThickness": 0, "actISensorPos": 0, "actUSDistance2": 0, "displacementUSDistOffs": 0, "penetrationDepth": 0, "actSpindleNutPos": 0, "actSensorRadius": 0, "actDiameter": 0, "actExcentr": 0, "actExcAngle": 0, "actTempMK": 0, "actTempME": 0, "actTempHeatsink": 0, "actTempCase": 0, "actGaugeTempCtrlMode": 0, "actGaugeTargetTemp": 0, "actZeroFreq": 0, "actRotToHome": 0, "actRotToZero": 0}'
    }))
}

type IProfiles = {
    p: [any[], IAirRingData, any[]][]
}

/**
 * 获取风环通道数据 KPE
 * @param params 
 * @returns 
 */
export const getKPEHeatsData = () => {
    return formateResult<IProfiles>(postRequest("http://127.0.0.1:8081/cgi/cgi.json", {
        ajaxRequest: 'jsonObjectRpc',
        rpcFunction: 'webRpcActualProfiles',
        jsonObject: {}
    }))
}
/**
 * 获取风环通道数据 KPE
 * @param params 
 * @returns 
 */
export const getKPEThickData = () => {
    return formateResult<IKunThickData>(postRequest("http://127.0.0.1:8081/cgi/cgi.json", {
        ajaxRequest: 'jsonObjectRpc',
        rpcFunction: 'webRpcOverviewActuals',
        jsonObject: {}
    }))
}

/**
 * 获取自动控制按钮状态
 */

export const getAutoStatus = (param:string) => {
    return formateResult<IApcInfo>(postRequest("http://127.0.0.1:8081/cgi/cgi.json", {
        ajaxRequest: 'jsonObjectRpc',
        rpcFunction: 'webRpcGetData',
        jsonObject: {"actuatorValue":"0","actuatorIndex":"-1","rotation":param ,"actuatorMirrored":"0"}
    }))
}

/**
 *  获取报警内容页面
 */
export const getWarningPage = () => {
    return formateResult(getRequest("http://127.168.15.100:8090/templates/diagn_t_flags.html"))
}

/**
 *  设置放大倍数/校准系数 & 目标厚度
 * @returns 
 */
export const setCalibration = (factor:number, targetThick:number) => {
    return formateResult(postRequest("http://127.168.15.100:8090/templates/param_measurement.html",{
        setSV_calFactor:factor,
        setSV_targetThickness: targetThick,
        saveSV:'SAVE'
    }))
}

/**
 *  获取放大倍数/校准系数 & 目标厚度
 * @returns 
 */
export const getCalibration = () => {
    return formateResult(getRequest("http://127.168.15.100:8090/templates/param_measurement.html"))
}


