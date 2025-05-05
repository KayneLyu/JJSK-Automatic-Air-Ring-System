

// 角度排序
export const setDegArray = (degArray: number[], startDeg: number): number[] => {
    // 检查 degArray 是否为 null 或 undefined
    if (!degArray || degArray.length === 0) {
        return [];
    }

    // 检查 startDeg 是否为数字
    if (typeof startDeg !== 'number' || isNaN(startDeg)) {
        throw new Error('startDeg must be a valid number');
    }

    // 检查 degArray 中是否包含非数字元素
    if (!degArray.every(item => typeof item === 'number' && !isNaN(item))) {
        throw new Error('degArray must only contain valid numbers');
    }

    // 排序逻辑简化
    degArray.sort((a, b) => {
        const aAboveStart = a >= startDeg;
        const bAboveStart = b >= startDeg;
        if (aAboveStart === bAboveStart) {
            return a - b;
        }
        return aAboveStart ? -1 : 1;
    });

    return degArray;
}

// 横向数据
export const formateList = (frame: number[], meanValue: number) => {
    let thickList: Array<[number, number]> = []
    for (let i = 0; i < frame.length; i++) {
        const value = (
            ((frame[i] - meanValue) / meanValue) *
            100
        ).toFixed(1)
        thickList.push([i, Number(value)]);
    }
    return thickList
}


// 即时数据
export const formatTempList = (frame: Array<number | string>, meanValue: number) => {
    let tempList: Array<[number, number | null]> = []
    for (let i = 0; i < frame.length; i++) {
        let value = null
        if (typeof frame[i] === 'number') {
            value = Number((
                ((frame[i] as number - meanValue) / meanValue) *
                100
            ).toFixed(1))
        }
        tempList.push([i, value]);
    }
    return tempList
}