import { defineStore } from 'pinia'
type IProduct = {
    product: string,
    order: string,
    roll: number,
    tolerance: number
}

export const useProduct = defineStore('product', {
    state: (): IProduct => {
        return {
            product: 'ABCDE',
            order: '00000001',
            roll: 1,
            tolerance: 5
        }
    },
    actions: {
        changeLang(data: IProduct) {
        },
    },
    persist: true,
})
