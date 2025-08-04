interface IAlarmsData {
    date: string,
    type: string,
    content: string,
    code: string
}

interface IConfigure {
    name: string,
    order: string,
    volume: number,
    thickness: number,
    tolerance: number,
    multiple: number,
    checked: boolean
    trueValue?: number,
    displayValue?: number,
}

interface IWarningList {
    Time: string,
    ErrCode: number,
    Description: string,
    type?: string
}

interface IHeats {
    time: string,
    heats: [number, number][]
}

interface ISaveHeats {
    frameId: number,
    name: string
}

// 产品配置
interface IProductData {
    productName: string,
    order: string,
    roll: number,
    tolerance: number,
    thick: number,
    scale: number,
    trigAlert: boolean
}

type ILanguageType = 'zhCn' | 'en' | 'vi'

// kundig api
interface IAirRingData {
    actualBias: number
    bias: number
    data: [number, number][]
    mirrored: number,
    rotation: number,
    apcState?: 'apcStateStopped' | 'apcStateActive'| 'apcStateHold',
}

type IThickData = {
    data: [number, number][]
    date: string,
    mean: number,
    stddev: number,
    time: string
}
interface IKunThickData {
    actMeasPos: number
    actMeasVal: number
    actTorsion: number
    maxMeasPos: number
    p: Array<[IThickData, IThickData]>
    processUpTime: number
    takeOffRotation: 'CW' | 'CCW' | "stopped"
}

interface IProcess {
    actDiameter: string,
    actExcAngle: string,
    actExcentr: string,
    actGaugeTargetTemp: string,
    actGaugeTempCtrlMode: string,
    actISensorPos: string,
    actPosition: string,
    actRotTime: string,
    actRotToHome: string,
    actRotToZero: string,
    actSensorRadius: string,
    actSpindleNutPos: string,
    actTempCase: string,
    actTempHeatsink: string,
    actTempME: string,
    actTempMK: string,
    actThickness: string,
    actUSDistance2: string,
    actZeroFreq: string,
    actualStateText: string, // disconnecte
    avgTDThickness: string,
    displacementUSDistOffs: string,
    penetrationDepth: string,
    radMoveActive: string,
    rotActive: string,
    targetStateText: string// stopped
}

// 一幅图数据
interface IFrameThickData {
    dataList: [number, number][],
    meanValue: number,
    max: number,
    min: number,
    maxPercent: number,
    minPercent: number,
    width: string,
    date: string,
    rotation: string,
    sigma: number,
    sigmaPercent: number,
    id?: number
}

interface ITempThickData {
    position: number,
    actualVal: number,
    time: string
    // tempList: [number, number][]
    buttonState: string
}

interface IApcInfo {
    data: [number, number][]
    apcState: 'apcStateStopped' | 'apcStateActive'| 'apcStateHold',
    actuatorState: string,
    tmdState: string,
    rotation: string,
    mirrored: string
}

interface IKunBaseData {
    actDisplacementProfileMean: number
    actDisplacementProfileStdev: number
    actMeasPos: number
    actMeasVal: number
    actUsDistanceProfileMean: number
    actUsDistanceProfileStdev: number
    actualTmdState: "stopped" | "measuring_TD" | "disconnected" // "disconnected"
    maxMeasPos: number
    p: Array<[IThickData, IThickData, any]>
    prevDisplacementProfileMean: number
    prevDisplacementProfileStdev: number
    prevUsDistanceProfileMean: number
    prevUsDistanceProfileStdev: number
    targetTmdState: "stopped" | "measuring_TD"
}

