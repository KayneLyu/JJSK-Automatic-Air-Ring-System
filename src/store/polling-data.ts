import { defineStore } from 'pinia';

type IPollingData = {
    apiThickData: IThickInfoInterval;
}
export const useApiDataStore = defineStore('apiThickData', {
    state: (): IPollingData => {
        return {
            apiThickData: {
                AD: 0, //采集器的模拟量采集值 ,
                Thk: 0, //厚度 um ,
                K: 0, //厚度放大倍数 ,
                PosMm: 0,
                PosDetector: 0, //探头位置 
                Velocity: 0,//探头速度 m/min ,
                Width: 0, //膜宽度 mm ,
                FilmVelocity: 0,//生产速度 m/min ,
                ControllerState: 'FIX', //运行状态 ,
                IsFlyAdConnected: true,//采集器 连接状态 ,
                IsRotationCW: true,//旋转架 是 顺时针 clockwise ,
                ARoundTimeOfRotation: 0, //旋转一圈时间 min ,
                PastTimeOfRotation: 0,//转向发生到现在已经过去的时间 min ,
                AngleOfRotation: 0 //旋转角度 ° ,
            }
        }
    },
    actions: {
        updateApiData(newData: IThickInfoInterval) {
            Object.assign(this.apiThickData, newData);
        }
    },
});
