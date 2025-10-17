export interface IAirRingInfo {
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