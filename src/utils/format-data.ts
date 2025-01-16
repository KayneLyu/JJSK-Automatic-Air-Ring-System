import dayjs from "dayjs";
// 计算平均值
export function calculateMean(data: number[]) {
    const sum = data.reduce((acc, value) => acc + value, 0);
    const mean = sum / data.length;
    return mean;
}
// 计算西格玛值
function calculateStandardDeviation(data: number[]) {
    const mean = calculateMean(data);
    const differences = data.map((value) => value - mean);
    const squaredDifferences = differences.map((diff) => Math.pow(diff, 2));
    const meanSquaredDifference = calculateMean(squaredDifferences);
    const standardDeviation = Math.sqrt(meanSquaredDifference);
    const twoSigma = 2 * standardDeviation;
    return twoSigma
}
// 保留小数
function fixedNumber(value: number, digist: number) {
    if (typeof value !== "number") {
        console.log('fixedNumber =>传入数据类型非number')
        return 0
    }
    const n = 10 ** digist
    return Math.round(value * n) / n
}

// 计算旋转速度
function timeToSecondsRotate(time: string) {
    const [hours, minutes, seconds] = time.split(':');
    const timeInSeconds = (+hours * 3600) + (+minutes * 60) + (+seconds);
    const rotateSpeed = timeInSeconds / 60
    return Number(rotateSpeed.toFixed(1))
}

export const formatFrameData = (data: IFrameData): IFrameThickData => {
    // 提取公共的时间格式化逻辑
    const startTime = dayjs(data.Time).format("YYYY-MM-DD HH:mm:ss");
    const endTime = dayjs(data.EndTime).format("HH:mm:ss");
    const queryDate = dayjs(data.Time).format("YYYY-MM-DD");
    // 检查 data.Thicks 是否为空或包含非数字值
    if (!Array.isArray(data.Thicks) || data.Thicks.length === 0) {
        throw new Error("Invalid or empty Thicks array");
    }
    const thicks = data.Thicks;
    const sigma = calculateStandardDeviation(thicks);
    const max = Math.max(...thicks);
    const min = Math.min(...thicks);
    const mean = calculateMean(thicks);
    const sigmaPercent = sigma / mean * 100;
    const minPercent = (min - mean) / mean * 100;
    const maxPercent = (max - mean) / mean * 100;
    return {
        frameId: data.ID,
        date: queryDate,
        startTime: startTime,
        endTime: endTime,
        speed: fixedNumber(data.FilmVelocity, 1),
        width: data.FilmWidth,
        rotateSpeed: timeToSecondsRotate(data.RPeriod),
        sigmaVal: fixedNumber(sigma, 1),
        sigmaPercent: fixedNumber(sigmaPercent, 1),
        mean: fixedNumber(mean, 1),
        minVal: fixedNumber(min, 1),
        minPercent: fixedNumber(minPercent, 1),
        maxVal: fixedNumber(max, 1),
        maxPercent: fixedNumber(maxPercent, 1),
        datalist: thicks,
    };
}


// 测厚仪监控数据
export const formateThickData = (thickInfo: IThickInfoData): IThickInfoInterval => {
    return {
        AD: thickInfo.AD, //采集器的模拟量采集值 ,
        Thk: thickInfo.Thk, //厚度 um ,
        K: thickInfo.K, //厚度放大倍数 ,
        PosMm: thickInfo.PosMm,
        PosDetector: Number((thickInfo.PosMm / thickInfo.PosLenMm * 100).toFixed(0)), //探头位置 
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


// 处理二进制
export function decimalToBinary(decimal: number | undefined) {
    if (!decimal || typeof (decimal) !== "number") {
        return []
    }
    let binary = decimal.toString(2).split('').reverse().join('') // 将十进制转换为二进制字符串
    let binaryArray = []; // 存储触发的位的数组
    for (let i = 0; i < binary.length; i++) {
        if (binary.charAt(i) === '1') {
            binaryArray.push(i); // 将触发的位索引添加到数组中
        }
    }
    return binaryArray;
}