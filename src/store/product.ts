import { defineStore } from 'pinia'
type IProduct = {
    param: IProductData
}

export const useProduct = defineStore('product', {
    state: (): IProduct => {
        return {
            param: {
                productName: 'ABCDE',
                order: '00000001',
                roll: 0,
                thick: 0,
                tolerance: 5,
                scale: 0
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
