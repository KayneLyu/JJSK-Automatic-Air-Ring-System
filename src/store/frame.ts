import { defineStore } from 'pinia'
type IConfig = {
  updateFrameId: number
}

export const useFrameStore = defineStore('frame', {
  state: (): IConfig => {
    return {
        updateFrameId: 0
    }
  },
})
