import { ref, reactive } from 'vue';
import { db } from '@/utils/dexie';
import { useApiDataStore } from "@/store/polling-data";

function useOperateChartsHooks() {
    const store = useApiDataStore()
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

    const hours = 2

    const refreshDataHandle = (result: IFrameThickData[]) => {
        const sigmaList: Array<[string, number]> = [];
        const meanList: Array<[string, number]> = [];
        for (const item of result) {
            sigmaList.push([item.endTime, item.sigmaPercent]);
            meanList.push([item.endTime, item.mean]);
        }
        queryDataList.value = result
        sigmaDataList.value = sigmaList
        meanDataList.value = meanList
        lastFrameId.value = result[result.length - 1].frameId
    }

    // 查询趋势数据
    const getTrendDataList = async (pickDate: string) => {
        const startDate = pickDate + ' 00:00:00'
        const endDate = pickDate + ' 23:59:59'
        try {
            const result = await db.Frame.where("endTime").between(startDate, endDate).limit(100).toArray()
            if (result.length) {
                refreshDataHandle(result)
            } else {
                sigmaDataList.value = []
            }
        } catch (error) {}
    }

    // 翻页数据
    const nextPageQuery = async (isBack: boolean) => {
        let startId
        let endId

        if (isBack) {
            startId = lastFrameId.value - hours * 100 * 2
            endId = lastFrameId.value - hours * 100
        } else {
            startId = lastFrameId.value
            endId = lastFrameId.value + hours * 100
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
    return {
        queryDataList,
        sigmaDataList,
        meanDataList,
        lastFrameId,
        currentId,
        getTrendDataList,
        nextPageQuery
    }
}

export default useOperateChartsHooks