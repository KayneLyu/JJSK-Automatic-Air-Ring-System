export const formateThickData = (thickInfo: IThickInfoData): IThickInfoInterval => {
    return {
        AD: thickInfo.AD, //采集器的模拟量采集值 ,
        Thk: thickInfo.Thk, //厚度 um ,
        K: thickInfo.K, //厚度放大倍数 ,
        PosMm: thickInfo.PosMm,
        PosDetector:  Number((thickInfo.PosMm / thickInfo.PosLenMm * 100).toFixed(0)), //探头位置 
        Velocity: thickInfo.Velocity,//探头速度 m/min ,
        Width: thickInfo.Width, //膜宽度 mm ,
        FilmVelocity: thickInfo.FilmVelocity,//生产速度 m/min ,
        ControllerState: thickInfo.ControllerState, //运行状态 ,
        IsFlyAdConnected: thickInfo.IsFlyAdConnected,//采集器 连接状态 ,
        IsRotationCW: thickInfo.IsRotationCW,//旋转架 是 顺时针 clockwise ,
        ARoundTimeOfRotation: thickInfo.ARoundTimeOfRotation, //旋转一圈时间 min ,
        PastTimeOfRotation: thickInfo.PastTimeOfRotation,//转向发生到现在已经过去的时间 min ,
        AngleOfRotation: thickInfo.AngleOfRotation //旋转角度 ° ,
    }
}