import { ref, watch } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { rearrangeArray } from "@/utils";
function useSortChannel() {
    const channelOrder = ref<Array<string | number>>([]);
    const startNumber = ref(0);
    const store = useApiDataStore();

    watch([() => store.KPEData.data.length, () => store.KPEData.rotation], ([channel, angle]) => {
        const startNo = channel - angle / (360 / channel) + 2
        const newArr = []
        for (let index = 1; index <= channel; index++) {
            newArr.push(`${index}`)
        }
        channelOrder.value = rearrangeArray(newArr, Math.floor(startNo)-1)
        startNumber.value = Math.floor(startNo)
    }, {
        immediate: true
    })

    return { channelOrder }
}

export default useSortChannel