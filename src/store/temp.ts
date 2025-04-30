import { defineStore } from 'pinia'
type IProduct = {
    tempList: [number, number | null][]
}

export const useProduct = defineStore('tempData', {
    state: (): IProduct => {
        return {
            tempList: []
        }
    },
    actions: {
        updateProduction(data: IProductData) {
            Object.assign(this.tempList, data);
        },
    },
})
