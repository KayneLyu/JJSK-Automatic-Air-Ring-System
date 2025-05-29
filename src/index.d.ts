interface IThickInfoData {
    AD: number, //采集器 的模拟量采集值 ,
    Thk: number, //厚度 um ,
    K: number, //厚度放大倍数 ,
    Position: number, //探头位置 脉冲 ,
    PosLength: number, //机架总长度 脉冲 ,
    PosMm: number, //number //探头位置 mm ,
    PosLenMm: number,
    Velocity: number,//探头速度 m/min ,
    Width: number //膜折径 mm ,
    FilmVelocity: number,//生产速度 m/min ,
    ControllerState: string, //运行状态 ,
    IStatus: number //采集器输入口状态 ,
    OStatus: number //采集器输出口状态 ,
    IsFlyAdConnected: boolean//采集器 连接状态 ,
    SampleAD: number //空气采集值 ,
    IsRotationCW: boolean//旋转架 是 顺时针 clockwise ,
    ARoundTimeOfRotation: number //旋转一圈时间 min ,
    PastTimeOfRotation: number //转向发生到现在已经过去的时间 min ,
    AngleOfRotation: number //旋转角度 ° ,
    LastScanDataId: number //数据库中 扫描数据表 最新的ID
    ErrCode: number
}

// 旧数据 获取一幅图数据
interface IFrameData {
    ID: number, //每幅图标识ID
    Time: string  //测量数据开始时间,
    EndTime: string //测量数据结束时间,
    IsBackw: boolean //旋转方向 是反向,
    RPeriod: string //旋转1周的时间,
    RCnt: number //旋转次数,
    RAngle: number  //旋转角度 ° ,
    FilmLength: number //膜距离 m,
    FilmVelocity: number//线速度,
    FilmWidth: number //膜宽度 mm,
    K: number //斜率补偿,
    Thicks: number[] //1幅数据
}

// 一幅图数据
interface IFrameThickData {
    frameId: number,
    startTime: string,
    endTime: string,
    speed: number,
    width: number,
    rotateSpeed: number,
    sigmaVal: number,
    sigmaPercent: number,
    mean: number,
    minVal: number,
    minPercent: number,
    maxVal: number,
    maxPercent: number,
    IsBackw: boolean,
    datalist: [number,number][] | number[],
}




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

interface IAirRingParams {
    ChannelCnt: number, // 通道数
    ChannelNo1Angle: number //风环1号通道对于的角度 0~359° ,
    Delay: number //加热后起效延时,单位s; 从加热，到起效，再到被测量时间=Delay+mRenZiJiaService.FilmLength/mRenZiJiaService.Velocity ,
    HasCheckFilmVelocity: number //检测线速度 使能 ,
    Step: number //手动加热步进 ,
    HasCheck: boolean // 具备检查功能 ,
    Kp: number //HeatOffset = ThickPercent * Kp ,
    ThresholdHeatSigma: number // number输出平滑的阀值，只有超出阀值，才平滑 ,
    BaseHeat: number, //当前加热全部为0， 按自动，全部加热就设置为BaseHeat 风门式控制 这个值恒为50% 加热式控制 这个值默认为30% ,
    IsAutoUpDown: boolean //加热式控制时， 自动调整总体上升下降 ,
    CtrlLine: number// 厚度控制线 ， 厚度% 大于 厚度控制线 自动才会加热控制 ,
    StableRange: number,// 偏差在范围内，都是稳定的 ,
    ThresholdR: number//加热与厚度相关性阀值, 例如 相关性 >=0.7 才能触发 自动调整加热 ,
    ThresholdSigmaMax: number//最大厚度% sigma, 只有当前厚度% sigma 在 最大sigma 内，才能控制
}

interface IAirRingInfo {
    IsAuto: boolean // 自控使能 ,
    IsChecking: boolean // 检测动作 使能中 ,
    IsConnectedWithPLC: boolean//连接到PLC?,
    LastChangedTime: string //上一次加热修改时间,
    StableTime: string // 厚度起效时间,
    IsStable: boolean // 厚度起效了,
    HasElectricity: boolean//加热棒有电流,
    MaxHeatSigma: number// 加热量 每3个计算的sigma, 最大值,
    UpdateTimeOfHeats: string // 加热量更新时间,
    UpdateTimeOfBads: string //加热棒损坏列表 更新时间,
    CurrR: number // 当前检测出来的厚度数据 的稳定性,
    CurrSigma: number // 当前检测出来的厚度% Sigma,
    ErrCode: number // 报警中
    IsAirDoorMode: boolean // 风环使用风门方式控制
}



interface IHeats {
    frameId: number,
    heats: number[]
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
}

type ILanguageType = 'zhCn' | 'en'