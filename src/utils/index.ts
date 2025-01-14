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

export function getLocalstorage(name: string, params: string) {
    const getLocalData = localStorage.getItem('config')
    if (getLocalData) {
        const data = JSON.parse(getLocalData)
        console.log('data', data, data[name] );
        
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
    let arr: string[] =[]
    for (let index = 0; index < 120; index++) {
        arr.push(index * 3 + '°')
    }
    if (arr.length <= 0) {
        return arr
    }
    if (index == 0) {
        return arr
    }
    const firstArr = arr.slice(0, index)
    const lastArr = arr.slice(index, arr.length + 1)
    const newArr = lastArr.concat(firstArr)
    return newArr
}