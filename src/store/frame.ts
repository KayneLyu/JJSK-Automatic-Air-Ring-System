import { defineStore } from 'pinia'
type IConfig = {
  updateFrameId: string,
  meanValue: number,
}

export const useFrameStore = defineStore('frame', {
  state: (): IConfig => {
    return {
      updateFrameId: "",
      meanValue: 0,
    }
  },
})
