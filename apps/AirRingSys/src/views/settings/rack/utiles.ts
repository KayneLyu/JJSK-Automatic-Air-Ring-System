/**
 * 数据更新与去重工具函数
 * @param newData 新轮询到的数据，包含 timestamps 和 adValues 两个数组
 * @param currentData 当前已经存在的图表数据 (二维数组格式)
 * @param maxLength 数据最大长度，默认为 1000
 * @returns 更新后的二维数组 [[time, value], ...]
 */
export const updateChartData = (
    newData: { timestamps: number[]; adValues: number[] },
    currentData: Array<[number, number]>,
    maxLength: number = 1000
): Array<[number, number]> => {

    // 1. 创建一个 Map 用于去重
    // Key: 时间戳 (number), Value: 数值 (number)
    const dataMap = new Map<number, number>();

    // 2. 先将旧数据放入 Map
    currentData.forEach(([time, value]) => {
        dataMap.set(time, value);
    });

    // 3. 将新数据放入 Map (覆盖旧数据)
    newData.timestamps.forEach((time, index) => {
        // 确保 adValues 有对应的值
        if (index < newData.adValues.length) {
            dataMap.set(time, newData.adValues[index]);
        }
    });

    // 4. 将 Map 转回二维数组 [[time, value], ...]
    // Map 的 entries() 方法正好返回 [key, value] 的迭代器
    let result = Array.from(dataMap.entries());

    // 5. 按时间戳排序（升序）
    // a 和 b 此时都是 [time, value] 数组，a[0] 是时间戳
    result.sort((a, b) => a[0] - b[0]);

    // 6. 维护最大长度
    // 如果超过 1000，截取最后 1000 条（保留最新的数据）
    if (result.length > maxLength) {
        result = result.slice(result.length - maxLength);
    }

    return result;
};
export function createThicknessCollector() {
    const pulseMap = new Map()
  
    let lastPulse: any = null
    let direction: any = null
  
    function process(pulses: number[], adValues: number[]) {
      let completedData = null
  
      for (let i = 0; i < pulses.length; i++) {
        const pulse = pulses[i]
        const ad = adValues[i]
  
        if (pulse < 0 || pulse > 6999) continue
  
        if (lastPulse !== null) {
          const delta = pulse - lastPulse
  
          let newDirection = direction
  
          if (delta > 0) newDirection = 1
          else if (delta < 0) newDirection = -1
  
          // 🚨 正向完成（到右端后开始回头）
          if (
            direction === 1 &&
            pulse > 6800 &&
            newDirection === -1
          ) {
            if (pulseMap.size > 500) {
              completedData = buildFullData()
            }
            pulseMap.clear()
          }
  
          // 🚨 反向完成（到左端后开始往前）
          if (
            direction === -1 &&
            pulse < 200 &&
            newDirection === 1
          ) {
            if (pulseMap.size > 500) {
              completedData = buildFullData()
            }
            pulseMap.clear()
          }
  
          direction = newDirection
        }
  
        pulseMap.set(pulse, ad)
        lastPulse = pulse
      }
  
      return completedData
    }
  
    function buildFullData() {
      const result = []
      let lastValue = null
  
      for (let i = 0; i < 7000; i++) {
        if (pulseMap.has(i)) {
          lastValue = pulseMap.get(i)
        }
        result.push({
          pulse: i,
          ad: lastValue
        })
      }
  
      return result
    }
  
    function getPreviewData() {
      const arr = []
      for (const [pulse, ad] of pulseMap) {
        arr.push([pulse, ad])
      }
      arr.sort((a, b) => a[0] - b[0])
      return arr
    }
  
    return {
      process,
      getPreviewData
    }
  }