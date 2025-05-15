import { ref, reactive } from 'vue';
import { db } from '@/utils/dexie';
import { useConfigStore } from '@/store/config';
function useOperateChartsHooks() {
    const store = useConfigStore()
    // 数据列表
    const queryDataList = ref<IFrameThickData[]>([])
    // sigma 列表
    const sigmaDataList = ref<Array<[string, number]>>([])
    // 平局值列表
    const meanDataList = ref<Array<[string, number]>>([])

    // 末端ID
    const lastFrameId = ref<number>(0)
    // 选中ID
    const currentId = ref<number>(0)
    // 选中的索引
    const currentIndex = ref<number>(0)
    // const hours = 2

    const refreshDataHandle = (result: IFrameThickData[]) => {
        const sigmaList: Array<[string, number]> = [];
        const meanList: Array<[string, number]> = [];
        for (const item of result) {
            sigmaList.push([item.endTime, item.sigmaPercent]);
            meanList.push([item.endTime, item.mean]);
        }
        // 根据查询结果初始化
        queryDataList.value = result
        sigmaDataList.value = sigmaList
        meanDataList.value = meanList
        const frameId = result[result.length -1].frameId
        lastFrameId.value = frameId
        currentId.value = frameId
        currentIndex.value = result.length -1
    }

    // 查询趋势数据
    const getTrendDataList = async (pickDate?: string) => {
        let startDate;
        let endDate;
        let result: IFrameThickData[] = [];
        try {
            if (pickDate) {
                startDate = pickDate + ' 00:00:00'
                endDate = pickDate + ' 23:59:59'
                result = await db.Frame.where("endTime").between(startDate, endDate).limit(100).toArray()
            } else {
                result = (await db.Frame.orderBy('frameId').reverse().limit(100).toArray()).reverse()
            }
            if (result.length) {
                refreshDataHandle(result)
            } else {
                sigmaDataList.value = []
            }
        } catch (error) { }
    }

    // 翻页数据
    const nextPageQuery = async (isBack: boolean) => {
        let startId
        let endId
        if(queryDataList.value.length == 0) {
            return
        }

        if (isBack) {
            const startNumbers = queryDataList.value[0]
            startId = startNumbers.frameId- store.queryHours * 100 < 0 ? 0 : startNumbers.frameId - store.queryHours * 100
            endId = startNumbers.frameId
            console.log('获取数据成功', startId, endId, store.queryHours );
            
        } else {
            startId = lastFrameId.value
            endId = lastFrameId.value + store.queryHours * 100
        }
        try {
            const result = await db.Frame.where("frameId").between(startId, endId).toArray()
            if (result.length) {
                console.log('获取数据成功', result);
                refreshDataHandle(result)
            } else {
                console.log('没有更多数据');
            }
        } catch (error) {
        }
    }

    // 步进
    const changeStep = (step: number) => {
        if(!queryDataList.value || queryDataList.value.length == 0) {
            return
        }
        let index = queryDataList.value.findIndex((item) => item.frameId === currentId.value)
        index += step
        if(index > queryDataList.value.length-1 ) {
            nextPageQuery(false)
            return
        }
        if(index < 0) {
            nextPageQuery(true)
            return
        }
        currentIndex.value = index
        currentId.value = queryDataList.value[index].frameId
    }

    return {
        queryDataList,
        sigmaDataList,
        meanDataList,
        lastFrameId,
        currentId,
        currentIndex,
        getTrendDataList,
        nextPageQuery,
        changeStep
    }
}

export default useOperateChartsHooks