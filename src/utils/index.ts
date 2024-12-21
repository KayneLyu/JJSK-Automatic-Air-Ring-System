// 用于防抖的辅助函数（可根据实际情况调整防抖时间间隔）
function debounce(func: Function, delay: number) {
    let timer: ReturnType<typeof setTimeout>;
    return function(this: any,...args: any[]) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}