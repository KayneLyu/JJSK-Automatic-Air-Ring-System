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
// function timeToSecondsRotate(time: number) {
//     const [hours, minutes, seconds] = time.split(':');
//     const timeInSeconds = (+hours * 3600) + (+minutes * 60) + (+seconds);
//     const rotateSpeed = timeInSeconds / 60
//     return Number(rotateSpeed.toFixed(1))
// }

export const formatFrameData = (data: IFrameData) => {
    // 提取公共的时间格式化逻辑
    const startTime = dayjs(data.scanData.Time).format("YYYY-MM-DD HH:mm:ss");
    const endTime = dayjs(data.scanData.EndTime).format("YYYY-MM-DD HH:mm:ss");
    // 检查 data.Thicks 是否为空或包含非数字值
    if (!Array.isArray(data.scanData.Thicks) || data.scanData.Thicks.length === 0) {
        throw new Error("Invalid or empty Thicks array");
    }
    const thicks = data.scanData.Thicks;
    const sigma = calculateStandardDeviation(thicks);
    const max = Math.max(...thicks);
    const min = Math.min(...thicks);
    const mean = calculateMean(thicks);
    const sigmaPercent = sigma / mean * 100;
    const minPercent = (min - mean) / mean * 100;
    const maxPercent = (max - mean) / mean * 100;
    return {
        frameId: data.scanData.ID,
        startTime: startTime,
        endTime: endTime,
        width: data.scanData.FilmWidth,
        rotateSpeed: data.scanData.RPeriod,
        sigmaVal: fixedNumber(sigma, 1),
        sigmaPercent: fixedNumber(sigmaPercent, 1),
        mean: fixedNumber(mean, 1),
        minVal: fixedNumber(min, 1),
        minPercent: fixedNumber(minPercent, 1),
        maxVal: fixedNumber(max, 1),
        maxPercent: fixedNumber(maxPercent, 1),
        IsBackw: data.scanData.IsBackw,
        datalist: thicks
    };
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