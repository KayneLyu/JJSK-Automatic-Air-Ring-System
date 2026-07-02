// 用于防抖的辅助函数（可根据实际情况调整防抖时间间隔）
export function debounce(func: Function, delay: number) {
    let timer: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
// 获取配置
export function getLocalstorage(name: string, params: string) {
    const getLocalData = localStorage.getItem('config')
    if (getLocalData) {
        const data = JSON.parse(getLocalData)
        return data[name] || params
    } else {
        return params
    }
}

export function isValidNumber(value: any): boolean {
    if (typeof value !== 'number') {
        return false;
    }
    // 排除NaN和Infinity情况
    return !isNaN(value) && value !== Infinity && value !== -Infinity;
}

// 控制环形图起始角度
export const resetOrderDeg = (index: number) => {
    let arr: number[] = []
    for (let k = 0; k < 120; k++) {
        arr.push(k)
    }
    if (index == 0 ) {
        return arr
    }
    const firstArr = arr.slice(0, index)
    const lastArr = arr.slice(index, arr.length + 1)
    const newArr = [...lastArr, ...firstArr]
    
    return newArr
}

// re-export from common.ts (has auto-dismiss duration)
export { showNotification } from './common'

/**
 * 截断数组
 * @param arr 
 * @param item 
 * @returns xAxis 
 */
export function rearrangeArray(arr: Array<number | string>, index: number) {
    if (!arr || arr.length == 0) return []
    return [...arr.slice(index), ...arr.slice(0, index)];
}

/***
 * 对比数组
 */

export function compareArrays(array1: string[], array2: string[]) {
    let set = new Set(array1); // 创建第一个数组的 Set
    return array2.filter(function (item) {
        return !set.has(item);
    });
}