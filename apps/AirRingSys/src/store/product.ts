import { defineStore } from 'pinia'
type IProduct = {
    param: IProductData
}

export const useProduct = defineStore('production', {
    state: (): IProduct => {
        return {
            param: {
                productName: 'ABCDE',
                order: '00000001',
                roll: 0,
                thick: 60,
                tolerance: 5,
                scale: 1,
            }
        }
    },
    actions: {
        updateProduction(data: IProductData) {
            Object.assign(this.param, data);
        },
    },
    persist: true,
})
