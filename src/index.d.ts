interface IThickInfoData {
    CurrThk: number; // 膜泡厚度 um ,
    OrgThk: number; // 原始厚度 um ,
    CurrThkAd: number; // 膜泡厚度 AD ,
    SampleAd: number; // 空气 AD ,
    SampleThk: number; // 样品厚度 um ,
    IsSampling: boolean; //  采样中 ,
    IsWaitThkStabilize: boolean; //  碰了膜，等等温度上次，厚度稳定 ,
    WaitThkSurplusSec: number; //  厚度稳定剩余时间（S） 
    FilmWidth: number; // 膜泡折径 mm ,
    CurrRotatePosition: number; // 当前小车旋转角度 (°) ,
    TotalRotateLength: number; //  旋转总角度 ,
    CurrRotateVelocity: number; // 当前小车旋转速度 (s/360°) ,
    CurrStretchPosition: number; // 当前摆臂位置 (mm) 当前摆臂位置 = 轨道半径 - 当前探头与中心距离 ,
    CurrStretchSpeed: number; // 当前摆臂移动速度 (mm/s) ,
    CurrBubbleShape: number; // 膜泡尺寸 (mm) 膜泡尺寸 = 轨道半径 - 膜泡位置 当 CurrBubbleDistance 无效时，为NaN ,
    RailwayRadius: number; //  轨道半径 (mm) ,
    CurrUs: number; // 膜泡距离 (mm) 就是超声波传感器的测量值 ,
    CurrHall: number; // 霍尔位置 (mm) ,
    CurrAp: number; // 气压(kPa) ,
    CurrTemp: number; // 温度(℃) ,
    IsTempOk: boolean; // 温度稳定 ,
    IsSensorOn: boolean; // 探头启动了 ,
    CurrPwm: number; //   当前PWM ,
    CurrPwmSpeed: number; // PWM 速度 ,
    CurrTempSpeed: number; // 温度 速度 ,
    CurrThkSpeed: number; // 厚度 速度 ,
    BubbleBiasMm: number; // 膜泡偏心距离 mm ,
    BubbleBiasDeg: number; // 膜泡偏心角度 ° ,
    IsTrackingOK: boolean; // 膜泡跟踪成功 ,
    IsCW: boolean; // 旋转架 顺时针 clockwise ,
    RealTimeOfR: string; // 真实旋转一圈时间 ,
    MinuteOfR: number; // 频率算出来的时间 ,
    PastTime: string; // 已经过去的时间 ,
    IsRotaryOn: boolean; // 旋转中 ,
    RotaryFreq: number; // 旋转频率 ,
    RotaryProgess: number; // 旋转进度 0~100% ,
    ControllerState: string; // 动作状态 FIX,STOP,RETRACT,SCAN ,
    LastScanDataId: number; // 数据库中 扫描数据表 最新的ID ,
    ErrCode: number;  // 异常代码 0为无异常，按位触发
    K: number;
}



// // 旧数据 获取一幅图数据
// interface IFrameData {
//     ID: number, //每幅图标识ID
//     Time: string  //测量数据开始时间,
//     EndTime: string //测量数据结束时间,
//     IsBackw: boolean //旋转方向 是反向,
//     RPeriod: string //旋转1周的时间,
//     RCnt: number //旋转次数,
//     RAngle: number  //旋转角度 ° ,
//     FilmLength: number //膜距离 m,
//     FilmVelocity: number//线速度,
//     FilmWidth: number //膜宽度 mm,
//     K: number //斜率补偿,
//     Thicks: number[] //1幅数据
// }

//  获取一幅图数据
interface IFrameData {
    Request: Request;
    scanData: ScanData;
    profile: any;
}

interface ScanData {
    ID: number;
    Time: string;
    EndTime: string;
    FilmWidth: number;
    BubbleBiasMm: number;
    BubbleBiasDeg: number;
    IsScanBackw: boolean;
    IsBackw: boolean;
    RPeriod: number;
    PastTime: number;
    RCnt: number;
    K: number;
    B: number;
    AirAd: number;
    AirOrgThk: number;
    Temperature: number;
    OrgThkAvg: number;
    Target: number;
    BoltCnt: number;
    Thicks: number[];
}

interface Request {
    Id: number;
    Mix: number;
}




// 一幅图数据
interface IFrameThickData {
    frameId: number,
    startTime: string,
    endTime: string,
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
    datalist: [number, number][] | number[],
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
    scale: number
}

type ILanguageType = 'zhCn' | 'en' | 'vi'