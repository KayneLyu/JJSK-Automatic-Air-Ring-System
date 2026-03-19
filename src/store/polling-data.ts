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
                CurrThk: 0, // 膜泡厚度 um ,
                OrgThk: 0, // 原始厚度 um ,
                CurrThkAd: 0, // 膜泡厚度 AD ,
                SampleAd: 0, // 空气 AD ,
                SampleThk: 0, // 样品厚度 um ,
                IsSampling: false, //  采样中 ,
                IsWaitThkStabilize: false, //  碰了膜，等等温度上次，厚度稳定 ,
                WaitThkSurplusSec: 0, //  厚度稳定剩余时间（S） 
                FilmWidth: 0, // 膜泡折径 mm ,
                CurrRotatePosition: 0, // 当前小车旋转角度 (°) ,
                TotalRotateLength: 0, //  旋转总角度 ,
                CurrRotateVelocity: 0, // 当前小车旋转速度 (s/360°) ,
                CurrStretchPosition: 0, // 当前摆臂位置 (mm) 当前摆臂位置 = 轨道半径 - 当前探头与中心距离 ,
                CurrStretchSpeed: 0, // 当前摆臂移动速度 (mm/s) ,
                CurrBubbleShape: 0, // 膜泡尺寸 (mm) 膜泡尺寸 = 轨道半径 - 膜泡位置 当 CurrBubbleDistance 无效时，为NaN ,
                RailwayRadius: 0, //  轨道半径 (mm) ,
                CurrUs: 0, // 膜泡距离 (mm) 就是超声波传感器的测量值 ,
                CurrHall: 0, // 霍尔位置 (mm) ,
                CurrAp: 0, // 气压(kPa) ,
                CurrTemp: 0, // 温度(℃) ,
                IsTempOk: false, // 温度稳定 ,
                IsSensorOn: false, // 探头启动了 ,
                CurrPwm: 0, //   当前PWM ,
                CurrPwmSpeed: 0, // PWM 速度 ,
                CurrTempSpeed: 0, // 温度 速度 ,
                CurrThkSpeed: 0, // 厚度 速度 ,
                BubbleBiasMm: 0, // 膜泡偏心距离 mm ,
                BubbleBiasDeg: 0, // 膜泡偏心角度 ° ,
                IsTrackingOK: false, // 膜泡跟踪成功 ,
                IsCW: false, // 旋转架 顺时针 clockwise ,
                RealTimeOfR: '', // 真实旋转一圈时间 ,
                MinuteOfR: 0, // 频率算出来的时间 ,
                PastTime: '', // 已经过去的时间 ,
                IsRotaryOn: false, // 旋转中 ,
                RotaryFreq: 0, // 旋转频率 ,
                RotaryProgess: 0, // 旋转进度 0~100% ,
                ControllerState: 'FIX', // 动作状态 FIX,STOP,RETRACT,SCAN ,
                LastScanDataId: 0, // 数据库中 扫描数据表 最新的ID ,
                ErrCode: 0,  // 异常代码 0为无异常，按位触发
                K: 1,
                IsPwmAuto: false
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
                CurrR: 0,// 当前检测出来的厚度数据 的稳定性,
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
