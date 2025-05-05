import { defineStore } from 'pinia'
type IProduct = {
    tempList: [number, number | null][]
}

export const useTempStore = defineStore('tempData', {
    state: (): IProduct => {
        return {
            tempList: []
        }
    },
    actions: {
        updateTempData(data: [number, number | null][]) {
            Object.assign(this.tempList, data);
        },
    },
})
