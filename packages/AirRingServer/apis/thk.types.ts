// 旧数据 获取一幅图数据
export interface IFrameData {
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

export interface IThickInfoData {
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


export interface IWarningList {
    Time: string,
    ErrCode: number,
    Description: string,
    type?: string
}