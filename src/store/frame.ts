import { defineStore } from 'pinia'
type IConfig = {
  updateFrameId: number,
  hasBadChannels: boolean,
  meanValue: number
}

export const useFrameStore = defineStore('frame', {
  state: (): IConfig => {
    return {
        updateFrameId: 0,
        hasBadChannels: false,
        meanValue: 0
    }
  },
})
