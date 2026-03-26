import { defineStore } from 'pinia'
type IConfig = {
  language: ILanguageType
  isDark: boolean,
  queryHours: number
  beforeAutoID: number | null
  fold: boolean
}

export const useConfigStore = defineStore('config', {
  state: (): IConfig => {
    return {
      language: 'zhCn',
      isDark: false,
      queryHours: 2,
      beforeAutoID: null,
      fold: true
    }
  },
  actions: {
    changeLang(data: ILanguageType) {
      this.language = data
    },
  },
  persist: true,
})
