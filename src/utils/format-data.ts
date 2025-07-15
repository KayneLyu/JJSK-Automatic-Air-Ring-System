import dayjs from "dayjs";
// 计算平均值
export function calculateMean(data: number[]) {
    const sum = data.reduce((acc, value) => acc + value, 0);
    const mean = sum / data.length;
    return mean;
}
// 计算西格玛值
function calculateStandardDeviation(data: number[], mean: number) {
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

// 向下 & 向上取整
function floorToFixed(value: number, decimalPlaces: number): number {
    if (!value) {
        return 0
    }
    const pow10 = Math.pow(10, decimalPlaces);
    if (value < 0) {
        return Math.ceil(value * pow10) / pow10;
    }
    return Math.floor(value * pow10) / pow10;
}

export const formateKunFrame = (thickList: [number, number][], mean: number) => {
    let flatArray: number[] = [];
    let realThickList: number[] = []
    for (let index = 0; index < thickList.length; index++) {
        flatArray.push(thickList[index][1]);
        realThickList.push(thickList[index][1] * mean / 100 + mean);
    }
    const sigma = calculateStandardDeviation(realThickList, mean)
    const sigmaPercent = floorToFixed(sigma / mean * 100, 1)
    const minPercent = floorToFixed(Math.min(...flatArray), 1)
    const maxPercent = floorToFixed(Math.max(...flatArray), 1)
    const max = floorToFixed(maxPercent * mean / 100 + mean, 1)
    const min = floorToFixed(minPercent * mean / 100 + mean, 1)
    return {
        sigma,
        sigmaPercent,
        max,
        min,
        minPercent,
        maxPercent
    }
}

export const formatKunErrors = (htmlTree: string) => {
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlTree as string;
    let elements:Element[] = []
    // 找到特定节点
    const errorList = tempDiv.querySelectorAll('.tab_text[style="color: red"]');
    const warningList = tempDiv.querySelectorAll('.tab_text[style="color: orange"]');
    elements = [...errorList,...warningList]
    var textArray: string[] = [];
    // 遍历匹配的节点并将其文本内容添加到数组中
    elements.forEach(function (element) {
        textArray.push('alarmKun.' + (element.previousElementSibling?.textContent as string).replace(/\/n/g, '').trim());
    });
    // 输出文本内容
    return textArray
}