import { ref, reactive } from 'vue';
import { db } from '@/utils/dexie';
import { useApiDataStore } from "@/store/polling-data";

function useOperateCharts() {
    const store = useApiDataStore()

    // 数据列表
    const queryDataList = ref<IFrameThickData[]>([])
    // sigma 列表
    const sigmaDataList = ref<number[]>([])
    // 平局值列表
    const meanDataList = ref<number[]>([])
    // 末端ID
    const endId = ref<number>(0)
    // 选中ID
    const currentId = ref<number>(0)

    const hours = 2

    const refreshDataHandle = (result: IFrameThickData[]) => { 
        const sigmaList = [];
        const meanList = [];
        for (const item of result) {
            sigmaList.push(item.sigmaPercent);
            meanList.push(item.mean);
        }
        queryDataList.value = result
        sigmaDataList.value = sigmaList
        meanDataList.value = meanList
    }
    // 查询趋势数据
    const getTrendDataList = async (pickDate: string) => {
        const startDate = pickDate + ' 00:00:00'
        const endDate = pickDate + ' 23:59:59'
        try {
            
            const result = await db.Frame.where("endTime").between(startDate, endDate).limit(100).toArray()
            if (result.length) {
                refreshDataHandle(result)
            }
        } catch (error) { }
    }
    // 翻页数据
    const nextPageQuery = async (isBack: boolean) => { 
        const counts = isBack?  -hours * 100 * 2 : hours * 100
        const startId = currentId || store.apiThickData.LastScanDataId

        if (isBack) { 
            endId.value = endId.value - 100
        } else { 
            endId.value = endId.value + 100
        }
        try {
            const result = await db.Frame.where("frameId").between(startId.value, startId.value + counts).toArray()
            if(result.length) {
                console.log('获取数据成功', result);
                
            } else {
                console.log('没有更多数据');
            }
        } catch (error) {
            
        }

    }

    return {
        queryDataList,
        sigmaDataList,
        meanDataList,
        endId,
        currentId,
        getTrendDataList,
        nextPageQuery
    }
}

export default useOperateCharts