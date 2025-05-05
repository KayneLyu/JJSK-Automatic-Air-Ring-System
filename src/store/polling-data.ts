import { defineStore } from 'pinia';

type IPollingData = {
    apiThickData: IThickInfoData,
    apiAirRingData: IAirRingInfo,
    apiAirRingConfig: IAirRingParams
}
export const useApiDataStore = defineStore('apiThickData', {
    state: (): IPollingData => {
        return {
            apiThickData: {
                AD: 0, //采集器的模拟量采集值 ,
                Thk: 0, //厚度 um ,
                K: 0, //厚度放大倍数 ,
                PosMm: 0,  // 探头位置 mm ,
                PosLenMm: 0,  //机架总长度 mm ,
                PosLength: 0, //机架总长度 脉冲 ,
                Position: 0, //探头位置 脉冲mm ,
                Velocity: 0,//探头速度 m/min ,
                Width: 0, //膜宽度 mm ,
                FilmVelocity: 0,//生产速度 m/min ,
                ControllerState: 'FIX', //运行状态 ,
                IsFlyAdConnected: true,//采集器 连接状态 ,
                IsRotationCW: true,//旋转架 是 顺时针 clockwise ,
                ARoundTimeOfRotation: 0, //旋转一圈时间 min ,
                PastTimeOfRotation: 0,//转向发生到现在已经过去的时间 min ,
                AngleOfRotation: 0, //旋转角度 ° ,
                SampleAD: 0,
                LastScanDataId: 0,
                IStatus: 0,
                OStatus: 0,
                ErrCode: 0,
            },
            apiAirRingData: {
                IsAuto: false, // 自控使能 ,
                IsChecking: false, // 检测动作 使能中 ,
                IsConnectedWithPLC: false,//连接到PLC?,
                LastChangedTime: '', //上一次加热修改时间,
                StableTime: '', // 厚度起效时间,
                IsStable: false, // 厚度起效了,
                HasElectricity: false,//加热棒有电流,
                MaxHeatSigma: 0,// 加热量 每3个计算的sigma, 最大值,
                UpdateTimeOfHeats: '', // 加热量更新时间,
                UpdateTimeOfBads: '', //加热棒损坏列表 更新时间,
                CurrR: 0 ,// 当前检测出来的厚度数据 的稳定性,
                CurrSigma: 0, // 当前检测出来的厚度% Sigma,
                ErrCode: 0, // 报警中 二进制
                IsAirDoorMode: false // 风环使用风门方式控制
            },
            apiAirRingConfig: {
                ChannelCnt: 0, // 通道数
                ChannelNo1Angle: 0, //风环1号通道对于的角度 0~359° ,
                Delay: 0, //加热后起效延时,单位s; 从加热，到起效，再到被测量时间=Delay+mRenZiJiaService.FilmLength/mRenZiJiaService.Velocity ,
                HasCheckFilmVelocity: 0, //检测线速度 使能 ,
                Step: 0, //手动加热步进 ,
                HasCheck: false, // 具备检查功能 ,
                Kp: 0, //HeatOffset = ThickPercent * Kp ,
                ThresholdHeatSigma: 0,// number输出平滑的阀值，只有超出阀值，才平滑 ,
                BaseHeat: 0, //当前加热全部为0， 按自动，全部加热就设置为BaseHeat 风门式控制 这个值恒为50% 加热式控制 这个值默认为30% ,
                IsAutoUpDown: false, //加热式控制时， 自动调整总体上升下降 ,
                CtrlLine: 0,// 厚度控制线 ， 厚度% 大于 厚度控制线 自动才会加热控制 ,
                StableRange: 0,// 偏差在范围内，都是稳定的 ,
                ThresholdR: 0,//加热与厚度相关性阀值, 例如 相关性 >=0.7 才能触发 自动调整加热 ,
                ThresholdSigmaMax: 0//最大厚度% sigma, 只有当前厚度% sigma 在 最大sigma 内，才能控制
            }
        }
    },
    actions: {
        updateApiData(newData: IThickInfoData) {
            Object.assign(this.apiThickData, newData);
        },
        updateAirRingData(newData: IAirRingInfo) {
            Object.assign(this.apiAirRingData, newData);
        },
        updateAirRingConfig(newData: IAirRingParams) {
            Object.assign(this.apiAirRingConfig, newData);
        }
    },
});
