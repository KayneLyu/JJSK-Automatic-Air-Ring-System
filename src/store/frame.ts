import { defineStore } from 'pinia'
type IConfig = {
  updateFrameId: number,
  hasBadChannels: boolean
}

export const useFrameStore = defineStore('frame', {
  state: (): IConfig => {
    return {
        updateFrameId: 0,
        hasBadChannels: false
    }
  },
})
