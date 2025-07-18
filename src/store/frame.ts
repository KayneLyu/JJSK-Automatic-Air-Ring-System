import { defineStore } from 'pinia'
type IConfig = {
  updateFrameId: number,
  meanValue: number,
  updateTime: string
}

export const useFrameStore = defineStore('frame', {
  state: (): IConfig => {
    return {
      updateFrameId: 0,
      meanValue: 0,
      updateTime: ""
    }
  },
})
