import { ref, watch } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { rearrangeArray } from "@/utils";
function useSortChannel() {
    const channelOrder = ref<number[]>([]);
    const store = useApiDataStore();



    watch([() => store.apiAirRingConfig.ChannelCnt, () => store.apiAirRingConfig.ChannelNo1Angle], ([channel, angle]) => {
        const startNo = channel - angle / (360 /  channel) +  2
        const newArr = []
        for (let index = 1; index <= channel; index++) {
            newArr.push(index)
        }
        channelOrder.value = rearrangeArray(newArr, Math.floor(startNo))
    },{
        immediate: true
    })

    return { channelOrder }
}

export default useSortChannel